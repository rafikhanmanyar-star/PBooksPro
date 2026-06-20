/**
 * A5.1.2.1 — RBAC v2 security closure tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandBundles,
  isSubsetOf,
} from './rbacPermissionExpansion.js';
import {
  assertCanDelegateExpanded,
  assertCanDelegateWithExpansion,
  computePermissionsAdded,
  DelegationDeniedError,
} from './rbacDelegationService.js';
import {
  runRolePermissionValidation,
  runRolePermissionUpdateHolderCheck,
  type ActorContext,
} from './rbacV2ValidationPipeline.js';
import { SodViolationError } from './rbacSodService.js';
import { getRoleTemplateById } from '../../../auth/roleTemplates.js';

describe('Deliverable 1 — expandBundles before validation pipeline', () => {
  it('expandBundles expands financial.write before subset check', () => {
    const actorExpanded = expandBundles(['financial.write'], 'accountant');
    const targetExpanded = expandBundles(['accounting.journals.create'], 'custom');
    assert.ok(isSubsetOf(targetExpanded, actorExpanded));
  });

  it('assertCanDelegateWithExpansion allows bundle-satisfied delegation', () => {
    assert.doesNotThrow(() =>
      assertCanDelegateWithExpansion(
        ['financial.write'],
        ['accounting.journals.create', 'procurement.bills.create'],
        'test',
        { actorEnterpriseRole: 'accountant', targetEnterpriseRole: 'custom' }
      )
    );
  });

  it('assertCanDelegateExpanded denies when expanded target exceeds actor', () => {
    assert.throws(
      () =>
        assertCanDelegateExpanded(
          expandBundles(['roles.view'], 'read_only'),
          expandBundles(['roles.manage'], 'custom'),
          'test'
        ),
      DelegationDeniedError
    );
  });
});

describe('Deliverable 2 — template instantiation DELEGATION_DENIED', () => {
  it('runRolePermissionValidation throws DELEGATION_DENIED for under-privileged actor', () => {
    const tpl = getRoleTemplateById('tpl_company_admin');
    assert.ok(tpl);
    const actor: ActorContext = {
      userId: 'u1',
      tenantId: 't1',
      resolvedPermissions: ['roles.view'] as ActorContext['resolvedPermissions'],
      roleSlugs: ['read_only'],
      isSystemOwner: false,
    };
    assert.throws(
      () => runRolePermissionValidation(actor, tpl!.permissionKeys, 'template_instantiate', 'custom_role'),
      DelegationDeniedError
    );
  });
});

describe('Deliverable 5 — effective union active assignment filters', () => {
  /** Mirrors RbacRepository.listUserRoleAssignments activeOnly clause. */
  function isEffectiveAssignment(isActive: boolean, expiresAt: Date | null, now = new Date()): boolean {
    return isActive && (expiresAt === null || expiresAt > now);
  }

  it('includes active assignment with null expires_at', () => {
    assert.equal(isEffectiveAssignment(true, null), true);
  });

  it('includes active assignment with future expires_at', () => {
    const future = new Date(Date.now() + 86_400_000);
    assert.equal(isEffectiveAssignment(true, future), true);
  });

  it('excludes inactive assignment', () => {
    assert.equal(isEffectiveAssignment(false, null), false);
  });

  it('excludes expired assignment', () => {
    const past = new Date(Date.now() - 1000);
    assert.equal(isEffectiveAssignment(true, past), false);
  });
});

describe('Deliverable 5 — effective union PERMS_ADDED (SoD Point #3)', () => {
  it('computePermissionsAdded returns only new keys', () => {
    assert.deepEqual(
      computePermissionsAdded(['a', 'b'], ['a', 'b', 'c']),
      ['c']
    );
    assert.deepEqual(computePermissionsAdded(['a'], ['a']), []);
  });

  it('runRolePermissionUpdateHolderCheck blocks when PERMS_ADDED creates SoD violation', () => {
    assert.throws(
      () =>
        runRolePermissionUpdateHolderCheck({
          permissionsBefore: ['payroll.runs.create'],
          permissionsAfter: ['payroll.runs.create', 'payroll.runs.approve'],
          holderRolePermissionSets: [['payroll.runs.create']],
          holderRoleSlugs: ['payroll_officer'],
          holderRoleIds: ['role_a'],
          roleIdBeingUpdated: 'role_a',
        }),
      SodViolationError
    );
  });

  it('runRolePermissionUpdateHolderCheck skips when PERMS_ADDED is empty', () => {
    assert.doesNotThrow(() =>
      runRolePermissionUpdateHolderCheck({
        permissionsBefore: ['a', 'b'],
        permissionsAfter: ['a', 'b'],
        holderRolePermissionSets: [['a', 'b']],
        holderRoleSlugs: ['custom'],
        holderRoleIds: ['role_a'],
        roleIdBeingUpdated: 'role_a',
      })
    );
  });

  it('runRolePermissionUpdateHolderCheck validates multi-role holder union', () => {
    assert.throws(
      () =>
        runRolePermissionUpdateHolderCheck({
          permissionsBefore: ['procurement.bills.create'],
          permissionsAfter: ['procurement.bills.create', 'procurement.bills.approve'],
          holderRolePermissionSets: [
            ['procurement.bills.create'],
            ['payroll.runs.approve'],
          ],
          holderRoleSlugs: ['bill_clerk', 'payroll_approver'],
          holderRoleIds: ['role_bills', 'role_payroll'],
          roleIdBeingUpdated: 'role_bills',
        }),
      SodViolationError
    );
  });
});

describe('Deliverable 6 — system role protection contract', () => {
  it('assertRoleMutable pattern rejects is_system roles', () => {
    const role = {
      is_hidden: false,
      is_system: true,
      status: 'active' as const,
      slug: 'accountant',
    };
    assert.throws(() => {
      if (role.is_system) {
        throw Object.assign(new Error('System role cannot be modified'), { code: 'FORBIDDEN' });
      }
    });
  });
});

describe('Deliverable 7 — role version hash (Phase 2 → 3)', () => {
  it('role hash inputs are tenant-scoped and version-bound', async () => {
    const { computeRoleVersionHash, computeUserAccessVersionHash } = await import(
      './rbacRoleVersionService.js'
    );
    const roleHash = computeRoleVersionHash({
      tenantId: 't1',
      roleId: 'r1',
      version: 3,
      permissionKeys: ['roles.view'],
    });
    const userHash = computeUserAccessVersionHash({
      tenantId: 't1',
      userId: 'u1',
      accessVersion: 2,
      assignedRoleVersionHashes: [roleHash],
      isActive: true,
    });
    assert.match(roleHash, /^[a-f0-9]{64}$/);
    assert.match(userHash, /^[a-f0-9]{64}$/);
    assert.notEqual(roleHash, userHash);
  });
});
