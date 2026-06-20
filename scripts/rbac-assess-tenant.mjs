/**
 * RBAC V2 tenant assessment — parity, SoD report, and optional bootstrap backfill.
 *
 * Usage:
 *   node --import tsx scripts/rbac-assess-tenant.mjs --tenant pakland --env staging --parity
 *   node --import tsx scripts/rbac-assess-tenant.mjs --tenant pakland --env staging --sod-report
 *   node --import tsx scripts/rbac-assess-tenant.mjs --tenant pakland --env staging --bootstrap [--dry-run]
 *
 * Requires DATABASE_URL in .env.staging / .env.production (or .env.production.render).
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { permissionsForRole, resolveEnterpriseRole, ALL_PERMISSIONS } from '../shared/rbac/permissions.ts';
import { expandPermissionKeys, unionExpandedPermissionKeys } from '../backend/src/modules/rbac/services/rbacPermissionExpansion.ts';
import { findSodViolation } from '../backend/src/modules/rbac/services/rbacSodService.ts';
import { RESTRICTED_PERMISSION_KEYS } from '../shared/rbac/restrictedPermissions.ts';

const RESTRICTED_SET = new Set(RESTRICTED_PERMISSION_KEYS);

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const hasFlag = (name) => args.includes(name);

const tenantQuery = flag('--tenant');
const envName = flag('--env') || 'staging';
const modeParity = hasFlag('--parity');
const modeSod = hasFlag('--sod-report');
const modeBootstrap = hasFlag('--bootstrap');
const dryRun = hasFlag('--dry-run');
const gainThreshold = Number(flag('--gain-threshold') ?? '0');

if (!tenantQuery) {
  console.error(`Usage:
  node --import tsx scripts/rbac-assess-tenant.mjs --tenant <name-or-id> [--env staging|production] --parity
  node --import tsx scripts/rbac-assess-tenant.mjs --tenant <name-or-id> [--env staging|production] --sod-report
  node --import tsx scripts/rbac-assess-tenant.mjs --tenant <name-or-id> [--env staging|production] --bootstrap [--dry-run]

Options:
  --gain-threshold N   Flag permission gain review when v1-level gain count > N (default 0)
`);
  process.exit(1);
}

if (!modeParity && !modeSod && !modeBootstrap) {
  console.error('Specify one of: --parity, --sod-report, --bootstrap');
  process.exit(1);
}

const envFile =
  envName === 'production'
    ? existsSync(resolve(process.cwd(), '.env.production.render'))
      ? '.env.production.render'
      : '.env.production'
    : '.env.staging';
const envPath = resolve(process.cwd(), envFile);
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const url = process.env.DATABASE_URL || process.env.PG_URL;
if (!url) {
  console.error(`DATABASE_URL missing — set ${envFile} or export DATABASE_URL`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

function normalizeRoleKey(role) {
  return String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

async function resolveTenantId() {
  const tenants = await pool.query(
    `SELECT id, COALESCE(NULLIF(TRIM(company_name), ''), name) AS display_name
     FROM tenants
     WHERE id ILIKE $1 OR name ILIKE $1 OR company_name ILIKE $1
     ORDER BY LOWER(COALESCE(NULLIF(TRIM(company_name), ''), name))`,
    [`%${tenantQuery}%`]
  );
  if (tenants.rows.length === 0) {
    console.error(`No tenant matching "${tenantQuery}"`);
    process.exit(1);
  }
  if (tenants.rows.length > 1) {
    console.log('Multiple tenants matched — use exact tenant id:');
    for (const t of tenants.rows) {
      console.log(`  ${t.id}  ${t.display_name}`);
    }
    process.exit(1);
  }
  return tenants.rows[0];
}

async function loadActiveUsers(tenantId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.role,
            COALESCE(ut.role, u.role) AS tenant_role
     FROM users u
     LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = u.tenant_id AND ut.is_default = TRUE
     WHERE u.tenant_id = $1 AND COALESCE(u.is_active, TRUE) = TRUE
     ORDER BY u.username`,
    [tenantId]
  );
  return rows;
}

async function loadRolesBySlug(tenantId) {
  const { rows } = await pool.query(
    `SELECT id, slug, name FROM rbac_roles WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId]
  );
  const map = new Map();
  for (const r of rows) map.set(r.slug, r);
  return map;
}

async function loadUserAssignments(tenantId) {
  const { rows } = await pool.query(
    `SELECT ur.user_id, ur.role_id, rr.slug, rr.name AS role_name
     FROM rbac_user_roles ur
     INNER JOIN rbac_roles rr ON rr.id = ur.role_id AND rr.tenant_id = ur.tenant_id
     WHERE ur.tenant_id = $1
       AND COALESCE(ur.is_active, TRUE) = TRUE
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
    [tenantId]
  );
  const byUser = new Map();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }
  return byUser;
}

async function loadRolePermissionKeys(tenantId, roleId) {
  const { rows } = await pool.query(
    `SELECT permission_key FROM rbac_role_permissions WHERE tenant_id = $1 AND role_id = $2`,
    [tenantId, roleId]
  );
  return rows.map((r) => r.permission_key);
}

async function resolveRbacV1Permissions(tenantId, userId, assignments) {
  if (!assignments || assignments.length === 0) return null;

  for (const a of assignments) {
    if (a.slug === 'SYSTEM_OWNER' || a.slug === 'super_admin') {
      return [...ALL_PERMISSIONS];
    }
  }

  const merged = new Set();
  for (const a of assignments) {
    const dbPerms = await loadRolePermissionKeys(tenantId, a.role_id);
    if (dbPerms.length > 0) {
      for (const k of dbPerms) merged.add(k);
    } else {
      for (const p of permissionsForRole(a.slug)) merged.add(p);
    }
  }
  return merged.size > 0 ? [...merged] : null;
}

async function runBootstrap(tenantId, tenantName) {
  const users = await loadActiveUsers(tenantId);
  const rolesBySlug = await loadRolesBySlug(tenantId);
  const assignmentsByUser = await loadUserAssignments(tenantId);

  let inserted = 0;
  let skipped = 0;
  let unmapped = 0;

  console.log(`\n=== RBAC User Assignment Bootstrap ===`);
  console.log(`Tenant: ${tenantName} (${tenantId})`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`Active users: ${users.length}\n`);

  for (const user of users) {
    const legacyRole = user.tenant_role ?? user.role;
    const roleKey = String(legacyRole ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');
    const enterpriseSlug =
      roleKey === 'security_administrator'
        ? 'security_administrator'
        : resolveEnterpriseRole(legacyRole);
    const roleRow = rolesBySlug.get(enterpriseSlug);

    if (!roleRow) {
      console.log(`  SKIP (no rbac_roles row): ${user.username} → ${enterpriseSlug}`);
      unmapped++;
      continue;
    }

    const existing = assignmentsByUser.get(user.id) ?? [];
    const hasSuperAdmin = existing.some((a) => a.slug === 'super_admin' || a.slug === 'SYSTEM_OWNER');
    if (hasSuperAdmin && enterpriseSlug === 'company_admin') {
      skipped++;
      continue;
    }
    const alreadyHas = existing.some((a) => a.role_id === roleRow.id);
    if (alreadyHas) {
      skipped++;
      continue;
    }

    console.log(`  INSERT: ${user.username} (${legacyRole} → ${enterpriseSlug}) role_id=${roleRow.id}`);
    if (!dryRun) {
      await pool.query(
        `INSERT INTO rbac_user_roles (tenant_id, user_id, role_id, assigned_by)
         VALUES ($1, $2, $3, 'rbac-assess-tenant-bootstrap')
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [tenantId, user.id, roleRow.id]
      );
    }
    inserted++;
  }

  console.log(`\nBootstrap summary: inserted=${inserted}, skipped=${skipped}, unmapped=${unmapped}`);
  if (dryRun) console.log('(dry run — no rows written)');
  return inserted === 0 && unmapped === 0 ? 0 : unmapped > 0 ? 2 : 0;
}

async function runParity(tenantId, tenantName) {
  const users = await loadActiveUsers(tenantId);
  const assignmentsByUser = await loadUserAssignments(tenantId);

  const losses = [];
  const gains = [];
  const gainReview = [];
  let ok = 0;

  console.log(`\n=== RBAC Parity Report ===`);
  console.log(`Tenant: ${tenantName} (${tenantId})`);
  console.log(`Users: ${users.length}\n`);

  for (const user of users) {
    const legacyRole = user.tenant_role ?? user.role;
    const enterpriseSlug = resolveEnterpriseRole(legacyRole);
    const legacyV1 = new Set(permissionsForRole(legacyRole));
    const assignments = assignmentsByUser.get(user.id) ?? [];
    const rbacV1List = await resolveRbacV1Permissions(tenantId, user.id, assignments);

    if (!rbacV1List) {
      losses.push({
        user: user.username,
        userId: user.id,
        issue: 'NO_RBAC_ASSIGNMENT',
        legacyRole,
        missing: [...legacyV1],
      });
      continue;
    }

    const rbacV1 = new Set(rbacV1List);
    const missing = [...legacyV1].filter((k) => !rbacV1.has(k));
    const extra = [...rbacV1].filter((k) => !legacyV1.has(k));

    const legacyExpanded = expandPermissionKeys([...legacyV1], enterpriseSlug);
    const rbacExpanded = expandPermissionKeys([...rbacV1], enterpriseSlug);
    const expandedExtra = [...rbacExpanded].filter((k) => !legacyExpanded.has(k));
    const restrictedGain = expandedExtra.filter((k) => RESTRICTED_SET.has(k));

    if (missing.length > 0) {
      losses.push({ user: user.username, userId: user.id, legacyRole, missing, extra });
    } else if (extra.length > gainThreshold || restrictedGain.length > 0) {
      gainReview.push({
        user: user.username,
        userId: user.id,
        legacyRole,
        enterpriseSlug,
        v1Gain: extra,
        expandedGainCount: expandedExtra.length,
        restrictedGain,
        legacyV1Count: legacyV1.size,
        rbacV1Count: rbacV1.size,
        legacyExpandedCount: legacyExpanded.size,
        rbacExpandedCount: rbacExpanded.size,
      });
      gains.push({ user: user.username, extra });
    } else {
      ok++;
    }
  }

  console.log(`OK: ${ok}`);
  console.log(`Permission loss: ${losses.length}`);
  console.log(`Permission gain (review required): ${gainReview.length}`);

  if (losses.length > 0) {
    console.log('\n--- Permission Loss ---');
    for (const row of losses) {
      if (row.issue === 'NO_RBAC_ASSIGNMENT') {
        console.log(`  ${row.user} (${row.legacyRole}): NO rbac_user_roles — run --bootstrap`);
      } else {
        console.log(`  ${row.user} (${row.legacyRole}): missing v1 keys: ${row.missing.join(', ')}`);
      }
    }
  }

  if (gainReview.length > 0) {
    console.log('\n--- Permission Gain Review (human sign-off required) ---');
    for (const row of gainReview) {
      console.log(
        `  ${row.user} (${row.legacyRole}): v1 +${row.v1Gain.length} [${row.v1Gain.slice(0, 5).join(', ')}${row.v1Gain.length > 5 ? '…' : ''}]`
      );
      console.log(
        `    expanded: ${row.legacyExpandedCount} → ${row.rbacExpandedCount} (+${row.expandedGainCount})`
      );
      if (row.restrictedGain.length > 0) {
        console.log(`    RESTRICTED GAIN: ${row.restrictedGain.join(', ')}`);
      }
    }
  }

  const summary = {
    tenantId,
    tenantName,
    users: users.length,
    ok,
    permissionLoss: losses.length,
    permissionGainReview: gainReview.length,
    losses,
    gainReview,
  };
  console.log('\n--- JSON summary ---');
  console.log(JSON.stringify(summary, null, 2));

  return losses.length > 0 ? 1 : gainReview.some((g) => g.restrictedGain.length > 0) ? 2 : 0;
}

async function runSodReport(tenantId, tenantName) {
  const users = await loadActiveUsers(tenantId);
  const assignmentsByUser = await loadUserAssignments(tenantId);
  const violations = [];

  console.log(`\n=== RBAC SoD Report ===`);
  console.log(`Tenant: ${tenantName} (${tenantId})`);
  console.log(`Users: ${users.length}\n`);

  for (const user of users) {
    const legacyRole = user.tenant_role ?? user.role;
    const assignments = assignmentsByUser.get(user.id) ?? [];

    let roleSets;
    let slugs;

    if (assignments.length === 0) {
      roleSets = [permissionsForRole(legacyRole)];
      slugs = [resolveEnterpriseRole(legacyRole)];
    } else {
      roleSets = [];
      slugs = [];
      for (const a of assignments) {
        slugs.push(a.slug);
        const dbPerms = await loadRolePermissionKeys(tenantId, a.role_id);
        roleSets.push(dbPerms.length > 0 ? dbPerms : permissionsForRole(a.slug));
      }
    }

    const effective = unionExpandedPermissionKeys(roleSets, slugs);
    const violation = findSodViolation(effective, `user:${user.id}`);
    if (violation) {
      violations.push({
        user: user.username,
        userId: user.id,
        legacyRole,
        roleSlugs: slugs,
        ...violation,
      });
    }
  }

  console.log(`SoD violations: ${violations.length}`);

  if (violations.length > 0) {
    console.log('\n--- Violations ---');
    for (const v of violations) {
      console.log(
        `  ${v.user} (${v.roleSlugs.join('+')}): ${v.permissionA} + ${v.permissionB} [${v.category}] ${v.domain}`
      );
    }
  } else {
    console.log('No SoD violations detected.');
  }

  console.log('\n--- JSON summary ---');
  console.log(JSON.stringify({ tenantId, tenantName, violations: violations.length, rows: violations }, null, 2));

  return violations.length > 0 ? 1 : 0;
}

try {
  const tenant = await resolveTenantId();
  console.log(`Environment: ${envName} via ${envFile}`);

  let exitCode = 0;
  if (modeBootstrap) {
    exitCode = Math.max(exitCode, await runBootstrap(tenant.id, tenant.display_name));
  }
  if (modeParity) {
    exitCode = Math.max(exitCode, await runParity(tenant.id, tenant.display_name));
  }
  if (modeSod) {
    exitCode = Math.max(exitCode, await runSodReport(tenant.id, tenant.display_name));
  }

  process.exit(exitCode);
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await pool.end();
}
