import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  permissionSetHas,
  isSystemOwnerSlug,
  SECURITY_ADMINISTRATOR_PERMISSIONS,
  roleHasPermission,
} from '../../../auth/permissions.js';

describe('rbac permission helpers', () => {
  it('permissions.view and permissions.read are equivalent', () => {
    const granted = new Set(['permissions.read'] as const);
    assert.equal(permissionSetHas(granted, 'permissions.view'), true);
    assert.equal(permissionSetHas(granted, 'permissions.manage'), false);
  });

  it('SYSTEM_OWNER slug is recognized', () => {
    assert.equal(isSystemOwnerSlug('SYSTEM_OWNER'), true);
    assert.equal(isSystemOwnerSlug('system_owner'), true);
    assert.equal(isSystemOwnerSlug('Admin'), false);
  });

  it('super admin has RBAC admin permissions', () => {
    assert.equal(roleHasPermission('SUPER_ADMIN', 'permissions.manage'), true);
    assert.equal(roleHasPermission('SUPER_ADMIN', 'roles.manage'), true);
    assert.equal(roleHasPermission('SUPER_ADMIN', 'users.role.assign'), true);
  });

  it('company admin does not have roles.manage by default', () => {
    assert.equal(roleHasPermission('Admin', 'roles.manage'), false);
    assert.equal(roleHasPermission('Admin', 'permissions.manage'), false);
  });

  it('security administrator permission bundle is defined', () => {
    assert.ok(SECURITY_ADMINISTRATOR_PERMISSIONS.includes('permissions.manage'));
    assert.ok(SECURITY_ADMINISTRATOR_PERMISSIONS.includes('users.role.assign'));
  });
});
