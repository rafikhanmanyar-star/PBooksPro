import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import {
  requireCompanyAdmin,
  requireFinancialWriteOnMutations,
  requireFinancialWriteRole,
  requirePayrollAccess,
  requirePayrollAccessForPayrollPaths,
  requirePermission,
  requirePermissionWhenPathStartsWith,
  requireRole,
  requireRoleWhenPathStartsWith,
  requireWriteOnMutations,
} from './rbacMiddleware.js';
import type { AuthedRequest } from './authMiddleware.js';

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

function mockReq(method: string, role?: string, path = '/'): AuthedRequest {
  return { method, role, path } as AuthedRequest;
}

describe('rbacMiddleware', () => {
  afterEach(() => mock.reset());

  it('allows GET without financial write role', () => {
    const req = mockReq('GET', 'Sales User');
    const res = mockRes();
    let called = false;
    requireFinancialWriteOnMutations(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it('blocks POST for Read Only User (no financial.write)', () => {
    const req = mockReq('POST', 'Read Only User');
    const res = mockRes();
    let called = false;
    requireFinancialWriteOnMutations(req, res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });

  it('allows Sales User POST for project selling marketing plans', () => {
    const req = mockReq('POST', 'Sales User');
    const res = mockRes();
    let called = false;
    requireWriteOnMutations('project_selling.marketing_plans.write')(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it('blocks Sales User POST for unrelated financial routes', () => {
    const req = mockReq('POST', 'Sales User');
    const res = mockRes();
    let called = false;
    requireFinancialWriteOnMutations(req, res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });

  it('allows POST for Accountant role', () => {
    const req = mockReq('POST', 'Accountant');
    const res = mockRes();
    let called = false;
    requireFinancialWriteRole(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it('blocks trial balance for Project Manager', () => {
    const req = mockReq('GET', 'Project Manager');
    const res = mockRes();
    let called = false;
    requirePermission('reports.trial_balance.read')(req, res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });

  it('allows trial balance for Read Only User', () => {
    const req = mockReq('GET', 'Read Only User');
    const res = mockRes();
    let called = false;
    requirePermission('reports.trial_balance.read')(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it('blocks payroll GET for Sales User', () => {
    const req = mockReq('GET', 'Sales User');
    const res = mockRes();
    let called = false;
    requirePayrollAccess(req, res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });

  it('allows payroll GET for Accountant', () => {
    const req = mockReq('GET', 'Accountant');
    const res = mockRes();
    let called = false;
    requirePayrollAccess(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it('blocks users.read for Accountant', () => {
    const req = mockReq('GET', 'Accountant');
    const res = mockRes();
    let called = false;
    requirePermission('users.read')(req, res, () => {
      called = true;
    });
    assert.equal(called, false);
  });

  it('requireRole allows company admin via Admin label', () => {
    const req = mockReq('GET', 'Admin');
    const res = mockRes();
    let called = false;
    requireRole('company_admin', 'super_admin')(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it('requireCompanyAdmin allows Admin and blocks Sales User', () => {
    {
      const req = mockReq('POST', 'Admin');
      const res = mockRes();
      let called = false;
      requireCompanyAdmin()(req, res, () => {
        called = true;
      });
      assert.equal(called, true);
    }
    {
      const req = mockReq('POST', 'Sales User');
      const res = mockRes();
      let called = false;
      requireCompanyAdmin()(req, res, () => {
        called = true;
      });
      assert.equal(called, false);
      assert.equal(res.statusCode, 403);
    }
  });

  it('requirePermissionWhenPathStartsWith skips unrelated paths', () => {
    const guard = requirePermissionWhenPathStartsWith('/reports/balance-sheet', 'reports.balance_sheet.read');
    {
      const req = mockReq('GET', 'Project Manager', '/tasks/upcoming');
      const res = mockRes();
      let called = false;
      guard(req, res, () => {
        called = true;
      });
      assert.equal(called, true);
    }
    {
      const req = mockReq('GET', 'Project Manager', '/reports/balance-sheet');
      const res = mockRes();
      let called = false;
      guard(req, res, () => {
        called = true;
      });
      assert.equal(called, false);
      assert.equal(res.statusCode, 403);
    }
  });

  it('requirePayrollAccessForPayrollPaths skips unrelated paths', () => {
    const guard = requirePayrollAccessForPayrollPaths();
    {
      const req = mockReq('GET', 'Project Manager', '/tasks/upcoming');
      const res = mockRes();
      let called = false;
      guard(req, res, () => {
        called = true;
      });
      assert.equal(called, true);
    }
    {
      const req = mockReq('GET', 'Project Manager', '/payroll/employees');
      const res = mockRes();
      let called = false;
      guard(req, res, () => {
        called = true;
      });
      assert.equal(called, false);
      assert.equal(res.statusCode, 403);
    }
  });

  it('requireRoleWhenPathStartsWith skips unrelated paths', () => {
    const guard = requireRoleWhenPathStartsWith('/admin', 'super_admin');
    {
      const req = mockReq('GET', 'Admin', '/payroll/departments');
      const res = mockRes();
      let called = false;
      guard(req, res, () => {
        called = true;
      });
      assert.equal(called, true);
    }
    {
      const req = mockReq('GET', 'Admin', '/admin/subscriptions/stats');
      const res = mockRes();
      let called = false;
      guard(req, res, () => {
        called = true;
      });
      assert.equal(called, false);
      assert.equal(res.statusCode, 403);
    }
    {
      const req = mockReq('GET', 'super_admin', '/admin/subscriptions/stats');
      const res = mockRes();
      let called = false;
      guard(req, res, () => {
        called = true;
      });
      assert.equal(called, true);
    }
  });
});
