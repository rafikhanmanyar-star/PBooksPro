/**
 * RBAC 2.0 Phase 2 validation tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoSodViolation, SodViolationError } from './rbacSodService.js';
import { assertCanDelegate, DelegationDeniedError } from './rbacDelegationService.js';
import {
  assertWithinPrivilegeCeiling,
  PrivilegeCeilingExceededError,
  resolveActorTier,
} from './rbacPrivilegeCeilingService.js';
import { computeRoleVersionHash } from './rbacRoleVersionService.js';
import { expandPermissionKeys } from './rbacPermissionExpansion.js';
import { ROLE_TEMPLATE_DEFINITIONS } from '../../../auth/roleTemplates.js';
import { ALL_SOD_PAIRS } from '../../../auth/sodPairs.js';

describe('rbacSodService', () => {
  it('blocks mandatory payroll create + approve pair', () => {
    assert.throws(
      () => assertNoSodViolation(['payroll.runs.create', 'payroll.runs.approve'], 'test'),
      SodViolationError
    );
  });

  it('allows payroll create alone', () => {
    assert.doesNotThrow(() => assertNoSodViolation(['payroll.runs.create'], 'test'));
  });

  it('expands financial.write for SoD check context', () => {
    const expanded = expandPermissionKeys(['financial.write'], 'accountant');
    assert.ok(expanded.has('accounting.journals.create'));
    assert.ok(!expanded.has('accounting.journals.approve'));
  });
});

describe('rbacDelegationService', () => {
  it('denies delegation when actor lacks permission', () => {
    assert.throws(
      () => assertCanDelegate(['roles.view'], ['roles.manage'], 'test'),
      DelegationDeniedError
    );
  });

  it('allows super admin bypass', () => {
    assert.doesNotThrow(() =>
      assertCanDelegate([], ['roles.manage'], 'test', { actorIsSuperAdmin: true })
    );
  });
});

describe('rbacPrivilegeCeilingService', () => {
  it('blocks restricted permission for security admin tier', () => {
    const tier = resolveActorTier({
      isSystemOwner: false,
      roleSlugs: ['security_administrator'],
      hasPermissionsDelegate: false,
    });
    assert.equal(tier, 'T2');
    assert.throws(
      () => assertWithinPrivilegeCeiling(tier, ['roles.manage'], ['financial.write'], 'test'),
      PrivilegeCeilingExceededError
    );
  });

  it('allows super admin tier unrestricted grant', () => {
    assert.doesNotThrow(() =>
      assertWithinPrivilegeCeiling('T1', ['roles.manage'], ['billing.manage'], 'test')
    );
  });
});

describe('rbacRoleVersionService', () => {
  it('produces stable hash for same inputs', () => {
    const input = {
      tenantId: 't1',
      roleId: 'r1',
      version: 2,
      permissionKeys: ['a', 'b'],
    };
    const h1 = computeRoleVersionHash(input);
    const h2 = computeRoleVersionHash(input);
    assert.equal(h1, h2);
    assert.notEqual(h1, computeRoleVersionHash({ ...input, version: 3 }));
  });
});

describe('roleTemplates SoD safety', () => {
  for (const template of ROLE_TEMPLATE_DEFINITIONS) {
    it(`${template.slug} template has no SoD violation`, () => {
      assert.doesNotThrow(() =>
        assertNoSodViolation(template.permissionKeys, `template:${template.slug}`, template.slug)
      );
    });
  }
});

describe('SoD registry completeness', () => {
  it('has 11 pairs (6 mandatory + 5 extended)', () => {
    assert.equal(ALL_SOD_PAIRS.length, 11);
    assert.equal(ALL_SOD_PAIRS.filter((p) => p.category === 'mandatory').length, 6);
    assert.equal(ALL_SOD_PAIRS.filter((p) => p.category === 'extended').length, 5);
  });
});
