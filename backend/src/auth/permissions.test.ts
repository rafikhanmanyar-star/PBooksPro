import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEnterpriseRole,
  roleHasPermission,
  permissionsForRole,
  buildPermissionMatrix,
  roleCanWriteProjectSelling,
  roleCanReadProjectSellingCatalog,
  roleCanWriteProjectSellingCatalog,
  roleCanViewAllMarketingPlans,
  roleCanApproveMarketingPlans,
} from './permissions.js';

describe('permissions matrix', () => {
  it('maps legacy Admin to company_admin', () => {
    assert.equal(resolveEnterpriseRole('Admin'), 'company_admin');
  });

  it('super admin has all permissions including permissions.manage', () => {
    assert.equal(roleHasPermission('SUPER_ADMIN', 'permissions.manage'), true);
    assert.equal(roleHasPermission('SUPER_ADMIN', 'permissions.view'), true);
    assert.equal(roleHasPermission('SUPER_ADMIN', 'roles.manage'), true);
    assert.equal(roleHasPermission('SUPER_ADMIN', 'reports.trial_balance.read'), true);
  });

  it('sales user has project selling permissions but not full financial write', () => {
    assert.equal(roleHasPermission('Sales User', 'reports.trial_balance.read'), false);
    assert.equal(roleHasPermission('Sales User', 'reports.balance_sheet.read'), false);
    assert.equal(roleHasPermission('Sales User', 'reports.profit_loss.read'), false);
    assert.equal(roleHasPermission('Sales User', 'financial.write'), false);
    assert.equal(roleHasPermission('Sales User', 'project_selling.read'), true);
    assert.equal(roleHasPermission('Sales User', 'project_selling.catalog.write'), true);
    assert.equal(roleHasPermission('Sales User', 'project_selling.marketing_plans.write'), true);
    assert.equal(roleHasPermission('Sales User', 'project_selling.agreements.write'), true);
    assert.equal(roleHasPermission('Sales User', 'project_selling.invoices.write'), true);
    assert.equal(roleHasPermission('Sales User', 'project_selling.payments.receive'), true);
    assert.equal(roleCanWriteProjectSelling('Sales User'), true);
    assert.equal(roleCanReadProjectSellingCatalog('Sales User'), true);
    assert.equal(roleCanWriteProjectSellingCatalog('Sales User'), true);
  });

  it('maps legacy Sales role to sales_user permissions', () => {
    assert.equal(resolveEnterpriseRole('Sales'), 'sales_user');
    assert.equal(roleHasPermission('Sales', 'project_selling.catalog.write'), true);
    assert.equal(roleHasPermission('Sales', 'project_selling.read'), true);
  });

  it('marketing plan visibility roles', () => {
    assert.equal(roleCanViewAllMarketingPlans('Admin'), true);
    assert.equal(roleCanViewAllMarketingPlans('Project Manager'), true);
    assert.equal(roleCanViewAllMarketingPlans('Sales User'), false);
    assert.equal(roleCanApproveMarketingPlans('Admin'), true);
    assert.equal(roleCanApproveMarketingPlans('Sales User'), false);
  });

  it('read only user can read reports but not write', () => {
    assert.equal(roleHasPermission('Read Only User', 'reports.profit_loss.read'), true);
    assert.equal(roleHasPermission('Read Only User', 'financial.write'), false);
    assert.equal(roleHasPermission('Read Only User', 'payroll.read'), true);
    assert.equal(roleHasPermission('Read Only User', 'payroll.write'), false);
  });

  it('accountant can read audit logs but not manage users', () => {
    assert.equal(roleHasPermission('Accountant', 'audit_logs.read'), true);
    assert.equal(roleHasPermission('Accountant', 'users.manage'), false);
    assert.equal(roleHasPermission('Accounts', 'users.manage'), false);
  });

  it('project manager can read P&L only among financial statements', () => {
    assert.equal(roleHasPermission('Project Manager', 'reports.profit_loss.read'), true);
    assert.equal(roleHasPermission('Project Manager', 'reports.trial_balance.read'), false);
    assert.equal(roleHasPermission('Project Manager', 'reports.balance_sheet.read'), false);
  });

  it('company admin can manage users', () => {
    assert.equal(roleHasPermission('Admin', 'users.manage'), true);
    assert.equal(roleHasPermission('Admin', 'users.read'), true);
    assert.equal(roleHasPermission('Admin', 'payroll.read'), true);
  });

  it('buildPermissionMatrix covers six enterprise roles', () => {
    const matrix = buildPermissionMatrix();
    assert.equal(matrix.length, 6);
    assert.ok(permissionsForRole('Admin').includes('reports.trial_balance.read'));
  });
});
