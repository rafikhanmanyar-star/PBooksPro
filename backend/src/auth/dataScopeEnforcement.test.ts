/**
 * A5.1.4 — data scope resolver, enforcement, and scopeHash tests.
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashStoredDataScopeRows,
  resolveDataScopeMaterial,
  mergeEffectiveDataScopeGrants,
} from './dataScopeResolver.js';
import type { DataScopeGrant } from './dataScopeTypes.js';
import {
  applyDataScope,
  applyDepartmentScope,
  applyProjectScope,
  applyPropertyScope,
  rowMatchesScope,
} from './tenantRepositoryScope.js';
import { assertRbacV2DataScopeConfiguration } from './rbacDataScopeFeatureFlag.js';
import { hashScopeGrants, computeCompositeAccessVersionHash, buildAccessVersionMaterial } from './accessVersionService.js';
import type { ActiveRoleAssignment } from './rbacPermissionResolver.js';

describe('dataScopeResolver — hashStoredDataScopeRows', () => {
  it('changes hash when scope rows change', () => {
    const before = hashStoredDataScopeRows([
      { source: 'user', dimension: 'department', entityId: 'dept_a' },
    ]);
    const after = hashStoredDataScopeRows([
      { source: 'user', dimension: 'department', entityId: 'dept_b' },
    ]);
    assert.notEqual(before, after);
  });

  it('all marker (null entityId) affects hash', () => {
    const assigned = hashStoredDataScopeRows([
      { source: 'user', dimension: 'project', entityId: 'p1' },
    ]);
    const all = hashStoredDataScopeRows([
      { source: 'user', dimension: 'project', entityId: null },
    ]);
    assert.notEqual(assigned, all);
  });
});

describe('tenantRepositoryScope — applyDataScope', () => {
  const disabled = { enabled: false, scopes: [] as readonly DataScopeGrant[] };
  const deptA: DataScopeGrant = { dimension: 'department', mode: 'assigned', entityIds: ['dept_a'] };
  const enabledDeptA = { enabled: true, scopes: [deptA] as readonly DataScopeGrant[] };

  it('returns null when data scope flag off', () => {
    assert.equal(applyDepartmentScope(disabled, 'department_id', 2), null);
  });

  it('returns null for mode all', () => {
    const ctx = { enabled: true, scopes: [{ dimension: 'department' as const, mode: 'all' as const }] };
    assert.equal(applyDepartmentScope(ctx, 'department_id', 2), null);
  });

  it('generates IN clause for assigned department', () => {
    const frag = applyDepartmentScope(enabledDeptA, 'department_id', 2)!;
    assert.match(frag.clause, /department_id = ANY\(\$2::text\[\]\)/);
    assert.deepEqual(frag.params, [['dept_a']]);
  });

  it('deny-all when assigned with empty entityIds', () => {
    const ctx = {
      enabled: true,
      scopes: [{ dimension: 'department' as const, mode: 'assigned' as const, entityIds: [] }],
    };
    const frag = applyDepartmentScope(ctx, 'department_id', 2)!;
    assert.equal(frag.clause, '1=0');
  });

  it('rowMatchesScope blocks out-of-scope department', () => {
    assert.equal(rowMatchesScope(enabledDeptA, 'department', 'dept_b'), false);
    assert.equal(rowMatchesScope(enabledDeptA, 'department', 'dept_a'), true);
  });

  it('applyProjectScope and applyPropertyScope use correct dimension', () => {
    const ctx = {
      enabled: true,
      scopes: [
        { dimension: 'project' as const, mode: 'assigned' as const, entityIds: ['proj_1'] },
        { dimension: 'property' as const, mode: 'assigned' as const, entityIds: ['prop_x'] },
      ],
    };
    assert.match(applyProjectScope(ctx, 'project_id', 2)!.clause, /project_id/);
    assert.match(applyPropertyScope(ctx, 'id', 3)!.clause, /id = ANY/);
  });
});

describe('scopeHash — access version invalidation', () => {
  const baseAssignment: ActiveRoleAssignment = {
    roleId: 'r1',
    slug: 'read_only',
    roleVersion: 1,
    permissionKeys: ['roles.view'],
    status: 'active',
  };

  it('scopeHash change produces different composite av', () => {
    const materialA = buildAccessVersionMaterial({
      tenantId: 't1',
      userId: 'u1',
      isActive: true,
      accessVersion: 1,
      tenantRbacGlobalVersion: 1,
      assignments: [baseAssignment],
      scopeHash: hashStoredDataScopeRows([]),
    });
    const materialB = buildAccessVersionMaterial({
      tenantId: 't1',
      userId: 'u1',
      isActive: true,
      accessVersion: 1,
      tenantRbacGlobalVersion: 1,
      assignments: [baseAssignment],
      scopeHash: hashStoredDataScopeRows([
        { source: 'user', dimension: 'department', entityId: 'dept_a' },
      ]),
    });
    assert.notEqual(
      computeCompositeAccessVersionHash(materialA),
      computeCompositeAccessVersionHash(materialB)
    );
  });

  it('hashScopeGrants aligns with stored row hash for assigned scopes', () => {
    const grants: DataScopeGrant[] = [
      { dimension: 'department', mode: 'assigned', entityIds: ['d1', 'd2'] },
    ];
    const fromGrants = hashScopeGrants(grants);
    const fromRows = hashStoredDataScopeRows([
      { source: 'user', dimension: 'department', entityId: 'd1' },
      { source: 'user', dimension: 'department', entityId: 'd2' },
    ]);
    assert.equal(fromGrants, fromRows);
  });
});

describe('dataScopeResolver — merge defaults', () => {
  it('break-glass yields all dimensions', async () => {
    const material = await resolveDataScopeMaterial({
      tenantId: 't1',
      userId: 'u1',
      assignments: [],
      isBreakGlass: true,
    });
    assert.equal(material.scopes.length, 4);
    assert.ok(material.scopes.every((s) => s.mode === 'all'));
  });
});

describe('dataScopeResolver — union precedence (M5)', () => {
  it('user-level ALL overrides role-level ASSIGNED for same dimension', () => {
    const grants = mergeEffectiveDataScopeGrants(
      [{ source: 'user', dimension: 'department', entityId: null }],
      [{ source: 'role', roleId: 'r1', dimension: 'department', entityId: 'dept_a' }]
    );
    const dept = grants.find((g) => g.dimension === 'department');
    assert.equal(dept?.mode, 'all');
  });

  it('union merges assigned entity ids from user and role when no ALL marker', () => {
    const grants = mergeEffectiveDataScopeGrants(
      [{ source: 'user', dimension: 'project', entityId: 'p1' }],
      [{ source: 'role', roleId: 'r1', dimension: 'project', entityId: 'p2' }]
    );
    const proj = grants.find((g) => g.dimension === 'project');
    assert.equal(proj?.mode, 'assigned');
    assert.deepEqual([...(proj?.entityIds ?? [])].sort(), ['p1', 'p2']);
  });
});

describe('tenantRepositoryScope — fail closed (M1)', () => {
  it('applyDataScope returns deny-all when failClosed is set', () => {
    const ctx = { enabled: true, scopes: [], failClosed: true };
    const frag = applyDepartmentScope(ctx, 'department_id', 2)!;
    assert.equal(frag.clause, '1=0');
  });

  it('rowMatchesScope denies when failClosed', () => {
    const ctx = { enabled: true, scopes: [{ dimension: 'department' as const, mode: 'all' as const }], failClosed: true };
    assert.equal(rowMatchesScope(ctx, 'department', 'dept_a'), false);
  });
});

describe('rbacDataScopeFeatureFlag — configuration (M1)', () => {
  const origDataScope = process.env.RBAC_V2_DATA_SCOPE;
  const origEngine = process.env.RBAC_V2_AUTHORIZATION_ENGINE;

  afterEach(() => {
    if (origDataScope === undefined) delete process.env.RBAC_V2_DATA_SCOPE;
    else process.env.RBAC_V2_DATA_SCOPE = origDataScope;
    if (origEngine === undefined) delete process.env.RBAC_V2_AUTHORIZATION_ENGINE;
    else process.env.RBAC_V2_AUTHORIZATION_ENGINE = origEngine;
  });

  it('flags misconfiguration when data scope on without authorization engine', () => {
    process.env.RBAC_V2_DATA_SCOPE = 'true';
    process.env.RBAC_V2_AUTHORIZATION_ENGINE = 'false';
    const result = assertRbacV2DataScopeConfiguration();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'CONFIGURATION_ERROR');
    }
  });
});
