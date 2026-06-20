/**
 * A5.1.5 — approval matrix enforcement tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashStoredApprovalRows,
  type StoredApprovalHashRow,
} from './approvalCapabilityResolver.js';
import {
  matchRules,
  requiresApproval,
  approvalChain,
  assertValidApprovalTransition,
} from '../approval/approvalEngine.js';
import type { ApprovalMatrixRule } from './approvalTypes.js';
import { computeCompositeAccessVersionHash } from './accessVersionService.js';
import { findSodViolation } from '../modules/rbac/services/rbacSodService.js';

function rule(partial: Partial<ApprovalMatrixRule> & Pick<ApprovalMatrixRule, 'id' | 'entityType'>): ApprovalMatrixRule {
  return {
    tenantId: 't1',
    priority: 100,
    approvalLevel: 1,
    minApprovers: 1,
    allowSelfApproval: false,
    requiredPermission: 'accounting.journals.approve',
    conditions: {},
    isMandatory: false,
    isActive: true,
    ...partial,
  };
}

describe('approvalCapabilityResolver hash', () => {
  it('approval assignment change alters approvalHash', () => {
    const before: StoredApprovalHashRow[] = [
      { kind: 'assignment', id: 'a1', payload: 'rule::cap:user:u1:1:true' },
    ];
    const after: StoredApprovalHashRow[] = [
      { kind: 'assignment', id: 'a1', payload: 'rule::cap:user:u2:1:true' },
    ];
    assert.notEqual(hashStoredApprovalRows(before), hashStoredApprovalRows(after));
  });

  it('approval rule change alters approvalHash', () => {
    const before = hashStoredApprovalRows([
      { kind: 'rule', id: 'r1', payload: 'bill:100:1:1:false:procurement.bills.approve:{}:false:true' },
    ]);
    const after = hashStoredApprovalRows([
      { kind: 'rule', id: 'r1', payload: 'bill:100:2:1:false:procurement.bills.approve:{}:false:true' },
    ]);
    assert.notEqual(before, after);
  });

  it('matrix version change alters approvalHash', () => {
    const v1 = hashStoredApprovalRows([{ kind: 'matrix', id: 't1', payload: '1:true' }]);
    const v2 = hashStoredApprovalRows([{ kind: 'matrix', id: 't1', payload: '2:true' }]);
    assert.notEqual(v1, v2);
  });
});

describe('accessVersionService approvalHash integration', () => {
  it('approvalHash included in composite av hash (TOKEN_STALE on change)', () => {
    const base = {
      tenantId: 't1',
      userId: 'u1',
      isActive: true,
      suspendedAt: null,
      accessVersion: 1,
      tenantRbacGlobalVersion: 1,
      activeAssignmentCount: 1,
      maxRoleVersion: 1,
      rolePermissionsHash: 'abc',
      scopeHash: 'scope',
      breakGlassSessionId: null,
    };
    const h1 = computeCompositeAccessVersionHash({ ...base, approvalHash: 'hash_a' });
    const h2 = computeCompositeAccessVersionHash({ ...base, approvalHash: 'hash_b' });
    assert.notEqual(h1, h2);
  });
});

describe('approvalEngine', () => {
  it('manual_journal always requires approval when matrix enabled', () => {
    process.env.RBAC_V2_APPROVAL_MATRIX = 'true';
    const matched = [rule({ id: 'r1', entityType: 'manual_journal', isMandatory: true })];
    assert.equal(requiresApproval('manual_journal', { entityType: 'manual_journal' }, matched), true);
    delete process.env.RBAC_V2_APPROVAL_MATRIX;
  });

  it('journal_reversal always requires approval when matrix enabled', () => {
    process.env.RBAC_V2_APPROVAL_MATRIX = 'true';
    assert.equal(
      requiresApproval('journal_reversal', { entityType: 'journal_reversal' }, []),
      true
    );
    delete process.env.RBAC_V2_APPROVAL_MATRIX;
  });

  it('vendor bill approval via matched rules', () => {
    process.env.RBAC_V2_APPROVAL_MATRIX = 'true';
    const rules = [rule({ id: 'b1', entityType: 'bill', requiredPermission: 'procurement.bills.approve' })];
    const matched = matchRules(rules, { entityType: 'bill', amount: 5000 });
    assert.equal(requiresApproval('bill', { entityType: 'bill', amount: 5000 }, matched), true);
    delete process.env.RBAC_V2_APPROVAL_MATRIX;
  });

  it('payment approval chain multi-level', () => {
    const rules = [
      rule({ id: 'p1', entityType: 'payment', approvalLevel: 1, priority: 100, requiredPermission: 'approve.payments' }),
      rule({ id: 'p2', entityType: 'payment', approvalLevel: 2, priority: 200, requiredPermission: 'administration.approvals.final' }),
    ];
    const matched = matchRules(rules, { entityType: 'payment', amount: 100000 });
    const chain = approvalChain(matched);
    assert.equal(chain.length, 2);
    assert.equal(chain[0]!.level, 1);
    assert.equal(chain[1]!.level, 2);
  });

  it('purchase order approval entity coverage', () => {
    process.env.RBAC_V2_APPROVAL_MATRIX = 'true';
    const rules = [
      rule({
        id: 'po1',
        entityType: 'purchase_order',
        requiredPermission: 'procurement.purchase_orders.approve',
      }),
    ];
    const matched = matchRules(rules, { entityType: 'purchase_order' });
    assert.ok(matched.length >= 1);
    delete process.env.RBAC_V2_APPROVAL_MATRIX;
  });

  it('payroll and rental agreement rules match', () => {
    const payroll = matchRules(
      [rule({ id: 'pr1', entityType: 'payroll_run', requiredPermission: 'payroll.runs.approve' })],
      { entityType: 'payroll_run' }
    );
    const rental = matchRules(
      [rule({ id: 'ra1', entityType: 'rental_agreement', requiredPermission: 'rental.agreements.approve' })],
      { entityType: 'rental_agreement' }
    );
    assert.equal(payroll.length, 1);
    assert.equal(rental.length, 1);
  });

  it('invalid workflow transition fails', () => {
    assert.throws(() => assertValidApprovalTransition('Approved', 'Pending Approval'), /Invalid approval transition/);
  });

  it('valid workflow transitions', () => {
    assert.doesNotThrow(() => assertValidApprovalTransition('Draft', 'Pending Approval'));
    assert.doesNotThrow(() => assertValidApprovalTransition('Pending Approval', 'Approved'));
    assert.doesNotThrow(() => assertValidApprovalTransition('Pending Approval', 'Rejected'));
  });
});

describe('SoD enforcement on approval pairs', () => {
  it('journal create + approve is SoD violation', () => {
    const perms = new Set(['accounting.journals.create', 'accounting.journals.approve']);
    assert.ok(findSodViolation(perms, 'test'));
  });

  it('payment create + approve is SoD violation', () => {
    const perms = new Set(['accounting.transactions.create', 'approve.payments']);
    assert.ok(findSodViolation(perms, 'test'));
  });

  it('PO create + approve is SoD violation', () => {
    const perms = new Set(['procurement.purchase_orders.create', 'procurement.purchase_orders.approve']);
    assert.ok(findSodViolation(perms, 'test'));
  });

  it('approve-only permission set has no SoD violation', () => {
    const perms = new Set(['accounting.journals.approve', 'procurement.bills.approve']);
    assert.equal(findSodViolation(perms, 'test'), null);
  });
});
