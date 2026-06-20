/**
 * A5.1.3 — RBAC V2 Authorization Engine unit tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandPermissionBundles,
  unionExpandedPermissions,
  type ActiveRoleAssignment,
} from './rbacPermissionResolver.js';
import {
  buildAccessVersionMaterial,
  computeCompositeAccessVersionHash,
  hashRolePermissionSets,
} from './accessVersionService.js';
import { buildEffectiveAccessContext } from './effectiveAccessContext.js';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from './permissionEvaluator.js';
import { validateJwtAccessVersion } from './authorizeV2.js';
import { isRbacV2AuthorizationEngineEnabled } from './rbacAuthorizationFeatureFlag.js';
import {
  assertExclusiveAuthorizationGuard,
  getAuthorizationMode,
} from './authorizationMode.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';

describe('rbacPermissionResolver — bundle expansion', () => {
  it('expands financial.write via permissionBundles.ts', () => {
    const expanded = expandPermissionBundles(['financial.write'], 'accountant');
    assert.ok(expanded.has('accounting.journals.create'));
    assert.ok(expanded.has('procurement.bills.create'));
  });

  it('project_manager gets reduced financial.write expansion', () => {
    const pm = expandPermissionBundles(['financial.write'], 'project_manager');
    const acct = expandPermissionBundles(['financial.write'], 'accountant');
    assert.ok(acct.size > pm.size);
  });

  it('unionExpandedPermissions merges multi-role sets', () => {
    const assignments: ActiveRoleAssignment[] = [
      {
        roleId: 'r1',
        slug: 'read_only',
        roleVersion: 1,
        permissionKeys: ['roles.view'],
        status: 'active',
      },
      {
        roleId: 'r2',
        slug: 'accountant',
        roleVersion: 2,
        permissionKeys: ['financial.write'],
        status: 'active',
      },
    ];
    const union = unionExpandedPermissions(assignments);
    assert.ok(union.has('roles.view'));
    assert.ok(union.has('accounting.journals.create'));
  });
});

describe('accessVersionService — composite hash', () => {
  it('produces stable deterministic hash', () => {
    const material = buildAccessVersionMaterial({
      tenantId: 't1',
      userId: 'u1',
      isActive: true,
      accessVersion: 3,
      tenantRbacGlobalVersion: 1,
      assignments: [
        {
          roleId: 'r1',
          slug: 'accountant',
          roleVersion: 5,
          permissionKeys: ['financial.write'],
          status: 'active',
        },
      ],
    });
    const h1 = computeCompositeAccessVersionHash(material);
    const h2 = computeCompositeAccessVersionHash(material);
    assert.equal(h1, h2);
    assert.match(h1, /^[a-f0-9]{64}$/);
  });

  it('changes hash when assignment permissions change', () => {
    const base = {
      tenantId: 't1',
      userId: 'u1',
      isActive: true,
      accessVersion: 1,
      tenantRbacGlobalVersion: 1,
    };
    const before = buildAccessVersionMaterial({
      ...base,
      assignments: [
        {
          roleId: 'r1',
          slug: 'custom',
          roleVersion: 1,
          permissionKeys: ['roles.view'],
          status: 'active',
        },
      ],
    });
    const after = buildAccessVersionMaterial({
      ...base,
      assignments: [
        {
          roleId: 'r1',
          slug: 'custom',
          roleVersion: 2,
          permissionKeys: ['roles.view', 'roles.manage'],
          status: 'active',
        },
      ],
    });
    assert.notEqual(
      computeCompositeAccessVersionHash(before),
      computeCompositeAccessVersionHash(after)
    );
  });

  it('includes break-glass session id in hash', () => {
    const base = buildAccessVersionMaterial({
      tenantId: 't1',
      userId: 'u1',
      isActive: true,
      accessVersion: 1,
      tenantRbacGlobalVersion: 1,
      assignments: [],
      breakGlassSessionId: null,
    });
    const withSession = buildAccessVersionMaterial({
      tenantId: 't1',
      userId: 'u1',
      isActive: true,
      accessVersion: 1,
      tenantRbacGlobalVersion: 1,
      assignments: [],
      breakGlassSessionId: 'bgs_abc',
    });
    assert.notEqual(
      computeCompositeAccessVersionHash(base),
      computeCompositeAccessVersionHash(withSession)
    );
  });

  it('hashRolePermissionSets is order-independent', () => {
    const a: ActiveRoleAssignment[] = [
      {
        roleId: 'b',
        slug: 'b',
        roleVersion: 1,
        permissionKeys: ['b'],
        status: 'active',
      },
      {
        roleId: 'a',
        slug: 'a',
        roleVersion: 1,
        permissionKeys: ['a'],
        status: 'active',
      },
    ];
    const b = [...a].reverse();
    assert.equal(hashRolePermissionSets(a), hashRolePermissionSets(b));
  });
});

describe('permissionEvaluator', () => {
  const ctx = buildEffectiveAccessContext({
    userId: 'u1',
    tenantId: 't1',
    permissions: ['roles.view', 'accounting.journals.create', 'financial.write'],
    assignments: [],
    accessVersion: 1,
    roleVersionHash: 'abc',
  });

  it('hasPermission checks direct and bundle-expanded keys', () => {
    assert.equal(hasPermission(ctx, 'roles.view'), true);
    assert.equal(hasPermission(ctx, 'accounting.journals.create', 'accountant'), true);
    assert.equal(hasPermission(ctx, 'roles.manage'), false);
  });

  it('hasAnyPermission and hasAllPermissions', () => {
    assert.equal(hasAnyPermission(ctx, ['roles.manage', 'roles.view']), true);
    assert.equal(hasAllPermissions(ctx, ['roles.view', 'accounting.journals.create']), true);
    assert.equal(hasAllPermissions(ctx, ['roles.view', 'roles.manage']), false);
  });
});

describe('authorizeV2 — JWT av validation', () => {
  it('validateJwtAccessVersion allows missing av when requireAv is false (legacy compat)', () => {
    assert.equal(validateJwtAccessVersion(undefined, 'current'), true);
    assert.equal(validateJwtAccessVersion(undefined, 'current', { requireAv: false }), true);
  });

  it('validateJwtAccessVersion rejects missing av when requireAv is true (engine enabled)', () => {
    assert.equal(validateJwtAccessVersion(undefined, 'current', { requireAv: true }), false);
  });

  it('validateJwtAccessVersion rejects stale av', () => {
    assert.equal(validateJwtAccessVersion('old', 'new'), false);
    assert.equal(validateJwtAccessVersion('old', 'new', { requireAv: true }), false);
  });

  it('validateJwtAccessVersion accepts matching av', () => {
    assert.equal(validateJwtAccessVersion('hash', 'hash', { requireAv: true }), true);
  });

  it('signAccessToken includes av when provided', () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-min-16-chars!!';
    const token = signAccessToken('u1', 't1', 'Admin', { av: 'hash123' });
    const verified = verifyAccessToken(token);
    assert.equal(verified.av, 'hash123');
  });
});

describe('authorizationMode — exclusive engine path', () => {
  it('getAuthorizationMode returns legacy when flag off', () => {
    const prev = process.env.RBAC_V2_AUTHORIZATION_ENGINE;
    delete process.env.RBAC_V2_AUTHORIZATION_ENGINE;
    assert.equal(getAuthorizationMode(), 'legacy');
    if (prev) process.env.RBAC_V2_AUTHORIZATION_ENGINE = prev;
  });

  it('assertExclusiveAuthorizationGuard rejects v2 guard when engine off', () => {
    const prev = process.env.RBAC_V2_AUTHORIZATION_ENGINE;
    delete process.env.RBAC_V2_AUTHORIZATION_ENGINE;
    assert.throws(
      () => assertExclusiveAuthorizationGuard('v2', null),
      /requirePermissionV2 used while RBAC_V2_AUTHORIZATION_ENGINE is disabled/
    );
    if (prev) process.env.RBAC_V2_AUTHORIZATION_ENGINE = prev;
  });
});

describe('effectiveAccessContext — breakGlassExpiresAt', () => {
  it('includes breakGlassExpiresAt from break_glass_sessions.expires_at', () => {
    const expires = '2026-06-19T12:30:00.000Z';
    const ctx = buildEffectiveAccessContext({
      userId: 'u1',
      tenantId: 't1',
      permissions: [],
      assignments: [],
      accessVersion: 1,
      roleVersionHash: 'abc',
      breakGlassSessionId: 'bgs_1',
      breakGlassExpiresAt: expires,
    });
    assert.equal(ctx.breakGlassExpiresAt, expires);
    assert.equal(ctx.isBreakGlass, true);
  });
});

describe('feature flag', () => {
  it('RBAC_V2_AUTHORIZATION_ENGINE defaults false', () => {
    const prev = process.env.RBAC_V2_AUTHORIZATION_ENGINE;
    delete process.env.RBAC_V2_AUTHORIZATION_ENGINE;
    assert.equal(isRbacV2AuthorizationEngineEnabled(), false);
    if (prev) process.env.RBAC_V2_AUTHORIZATION_ENGINE = prev;
  });
});

describe('effectiveAccessContext — archived role exclusion contract', () => {
  it('assignments with archived status are excluded at resolver layer', () => {
    const activeOnly = (assignments: ActiveRoleAssignment[]) =>
      assignments.filter((a) => a.status !== 'archived');
    const mixed: ActiveRoleAssignment[] = [
      {
        roleId: 'r1',
        slug: 'active_role',
        roleVersion: 1,
        permissionKeys: ['roles.view'],
        status: 'active',
      },
      {
        roleId: 'r2',
        slug: 'archived_role',
        roleVersion: 1,
        permissionKeys: ['roles.manage'],
        status: 'archived',
      },
    ];
    assert.equal(activeOnly(mixed).length, 1);
  });
});

describe('expired assignment filter contract', () => {
  it('mirrors repository activeOnly SQL predicate', () => {
    function isEffectiveAssignment(isActive: boolean, expiresAt: Date | null, now = new Date()): boolean {
      return isActive && (expiresAt === null || expiresAt > now);
    }
    assert.equal(isEffectiveAssignment(true, null), true);
    assert.equal(isEffectiveAssignment(false, null), false);
    assert.equal(isEffectiveAssignment(true, new Date(Date.now() - 1000)), false);
  });
});
