/**
 * Tenant-scoped restore: dry-run validation, conflict detection, transactional rollback.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  TENANT_BACKUP_TABLES,
  isAllowedBackupTable,
  type TenantBackupTable,
} from './tenantBackupRegistry.js';
import {
  normalizeTenantBackupPayload,
  type TenantBackupPayload,
} from './tenantBackupService.js';
import { TenantBackupRepository } from '../modules/backup/repositories/TenantBackupRepository.js';
import { TenantRestoreRepository } from '../modules/backup/repositories/TenantRestoreRepository.js';

const backupRepo = new TenantBackupRepository();
const restoreRepo = new TenantRestoreRepository();

export type RestoreMode = 'existing_tenant' | 'new_tenant';
export type ConflictPolicy = 'replace' | 'skip' | 'merge';

export type ValidationIssue = {
  severity: 'error' | 'warning' | 'info';
  table: string;
  recordId?: string;
  code: string;
  message: string;
};

export type TableRestoreSummary = {
  table: string;
  total: number;
  toInsert: number;
  toUpdate: number;
  toSkip: number;
  crossTenantConflicts: number;
};

export type RestorePreview = {
  sourceTenantId: string;
  sourceTenantName?: string;
  exportedAt: string;
  mode: RestoreMode;
  targetTenantId: string;
  targetTenantName?: string;
  conflictPolicy: ConflictPolicy;
  tableSummaries: TableRestoreSummary[];
  issues: ValidationIssue[];
  canProceed: boolean;
  totalRecords: number;
};

export type RestoreResult = {
  restoreRunId: string;
  targetTenantId: string;
  targetTenantName?: string;
  mode: RestoreMode;
  tableSummaries: TableRestoreSummary[];
  issues: ValidationIssue[];
};

type RowAction = 'insert' | 'update' | 'skip' | 'cross_tenant_conflict';

const JSONB_COLUMNS = new Set([
  'earning_types',
  'deduction_types',
  'salary',
  'adjustments',
  'projects',
  'buildings',
  'allowance_details',
  'deduction_details',
  'items',
  'metadata',
]);

function asRecord(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  return row as Record<string, unknown>;
}

function remapRowForTarget(
  row: Record<string, unknown>,
  table: string,
  targetTenantId: string
): Record<string, unknown> {
  const copy = { ...row };
  if (table !== 'payroll_tenant_config') {
    copy.tenant_id = targetTenantId;
  } else {
    copy.tenant_id = targetTenantId;
  }
  return copy;
}

async function tableHasColumn(
  client: pg.PoolClient,
  table: string,
  column: string
): Promise<boolean> {
  return restoreRepo.tableHasColumn(client, table, column);
}

async function classifyRow(
  client: pg.PoolClient,
  table: string,
  row: Record<string, unknown>,
  targetTenantId: string,
  policy: ConflictPolicy
): Promise<RowAction> {
  const id = row.id;
  if (id == null || String(id).trim() === '') {
    return 'insert';
  }

  const existingTenant = await restoreRepo.getRowTenantId(client, table, String(id));
  if (existingTenant == null) return 'insert';

  if (existingTenant !== targetTenantId) {
    return 'cross_tenant_conflict';
  }

  if (policy === 'skip' || policy === 'merge') return 'skip';
  return 'update';
}

async function analyzeTable(
  client: pg.PoolClient,
  table: TenantBackupTable,
  rows: unknown[],
  targetTenantId: string,
  policy: ConflictPolicy,
  issues: ValidationIssue[]
): Promise<TableRestoreSummary> {
  const summary: TableRestoreSummary = {
    table,
    total: rows.length,
    toInsert: 0,
    toUpdate: 0,
    toSkip: 0,
    crossTenantConflicts: 0,
  };

  if (table === 'payroll_tenant_config') {
    const hasConfig = await restoreRepo.hasPayrollTenantConfig(client, targetTenantId);
    if (!hasConfig) {
      summary.toInsert = rows.length;
    } else if (policy === 'replace') {
      summary.toUpdate = rows.length;
    } else {
      summary.toSkip = rows.length;
    }
    return summary;
  }

  if (!(await tableHasColumn(client, table, 'id'))) {
    for (const raw of rows) {
      const row = asRecord(raw);
      if (!row) continue;
      summary.toInsert += 1;
    }
    return summary;
  }

  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) {
      issues.push({
        severity: 'warning',
        table,
        code: 'INVALID_ROW',
        message: 'Skipped invalid row (not an object).',
      });
      continue;
    }

    const action = await classifyRow(client, table, row, targetTenantId, policy);
    switch (action) {
      case 'insert':
        summary.toInsert += 1;
        break;
      case 'update':
        summary.toUpdate += 1;
        break;
      case 'skip':
        summary.toSkip += 1;
        break;
      case 'cross_tenant_conflict':
        summary.crossTenantConflicts += 1;
        issues.push({
          severity: 'error',
          table,
          recordId: String(row.id),
          code: 'CROSS_TENANT_CONFLICT',
          message: `Record ${row.id} already belongs to another organization.`,
        });
        break;
    }
  }

  return summary;
}

export async function buildRestorePreview(
  client: pg.PoolClient,
  payload: TenantBackupPayload,
  opts: {
    mode: RestoreMode;
    targetTenantId?: string;
    newTenantName?: string;
    conflictPolicy: ConflictPolicy;
  }
): Promise<RestorePreview> {
  const normalized = normalizeTenantBackupPayload(payload);
  const issues: ValidationIssue[] = [];

  if (Object.keys(normalized.tables).length === 0) {
    issues.push({
      severity: 'error',
      table: '*',
      code: 'EMPTY_BACKUP',
      message: 'Backup contains no restorable business data.',
    });
  }

  let targetTenantId = opts.targetTenantId?.trim() ?? '';
  let targetTenantName: string | undefined;

  if (opts.mode === 'new_tenant') {
    targetTenantId = targetTenantId || `tenant_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    targetTenantName = opts.newTenantName?.trim() || `${normalized.sourceTenantName ?? 'Restored'} (copy)`;
    issues.push({
      severity: 'info',
      table: 'tenants',
      code: 'NEW_TENANT',
      message: `Will create organization "${targetTenantName}" (${targetTenantId}).`,
    });
  } else {
    if (!targetTenantId) {
      issues.push({
        severity: 'error',
        table: 'tenants',
        code: 'MISSING_TARGET',
        message: 'Target organization is required for existing-tenant restore.',
      });
    } else {
      const t = await backupRepo.getTenantById(client, targetTenantId);
      if (!t) {
        issues.push({
          severity: 'error',
          table: 'tenants',
          code: 'TARGET_NOT_FOUND',
          message: 'Target organization does not exist.',
        });
      } else {
        targetTenantName = String(t.name ?? '');
      }
    }
  }

  const tableSummaries: TableRestoreSummary[] = [];
  let totalRecords = 0;

  if (targetTenantId) {
    for (const table of TENANT_BACKUP_TABLES) {
      const rows = normalized.tables[table];
      if (!rows?.length) continue;
      totalRecords += rows.length;
      const summary = await analyzeTable(
        client,
        table,
        rows,
        targetTenantId,
        opts.conflictPolicy,
        issues
      );
      tableSummaries.push(summary);
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    sourceTenantId: normalized.sourceTenantId,
    sourceTenantName: normalized.sourceTenantName,
    exportedAt: normalized.exportedAt,
    mode: opts.mode,
    targetTenantId,
    targetTenantName,
    conflictPolicy: opts.conflictPolicy,
    tableSummaries,
    issues,
    canProceed: !hasErrors && totalRecords > 0 && !!targetTenantId,
    totalRecords,
  };
}

async function upsertRow(
  client: pg.PoolClient,
  table: string,
  row: Record<string, unknown>,
  targetTenantId: string,
  policy: ConflictPolicy
): Promise<RowAction> {
  if (table === 'payroll_tenant_config') {
    const remapped = remapRowForTarget(row, table, targetTenantId);
    await restoreRepo.upsertPayrollTenantConfig(client, targetTenantId, remapped);
    return 'insert';
  }

  const action = await classifyRow(client, table, row, targetTenantId, policy);
  if (action === 'skip') return 'skip';
  if (action === 'cross_tenant_conflict') {
    throw new Error(`Cross-tenant conflict on ${table}.${row.id}`);
  }

  const remapped = remapRowForTarget(row, table, targetTenantId);
  const columns = Object.keys(remapped).filter((c) => remapped[c] !== undefined);
  const values = columns.map((c) => {
    const v = remapped[c];
    if (JSONB_COLUMNS.has(c) && v !== null && typeof v === 'object') {
      return JSON.stringify(v);
    }
    return v;
  });

  if (action === 'insert') {
    await restoreRepo.insertRow(client, table, columns, values);
    return 'insert';
  }

  await restoreRepo.upsertRow(client, table, columns, values);
  return 'update';
}

export async function executeTenantRestore(
  client: pg.PoolClient,
  payload: TenantBackupPayload,
  opts: {
    mode: RestoreMode;
    targetTenantId?: string;
    newTenantName?: string;
    conflictPolicy: ConflictPolicy;
    requestedBy?: string;
  }
): Promise<RestoreResult> {
  const preview = await buildRestorePreview(client, payload, opts);
  if (!preview.canProceed) {
    const firstError = preview.issues.find((i) => i.severity === 'error');
    throw new Error(firstError?.message ?? 'Restore validation failed.');
  }

  const restoreRunId = randomUUID();
  const startedAt = new Date().toISOString();
  const normalized = normalizeTenantBackupPayload(payload);
  const targetTenantId = preview.targetTenantId;

  await restoreRepo.insertRestoreRun(client, {
    id: restoreRunId,
    sourceTenantId: normalized.sourceTenantId,
    targetTenantId,
    mode: opts.mode,
    conflictPolicy: opts.conflictPolicy,
    previewReport: preview,
    requestedBy: opts.requestedBy ?? null,
    startedAt,
  });

  try {
    await client.query('BEGIN');

    if (opts.mode === 'new_tenant') {
      await restoreRepo.insertTenant(
        client,
        targetTenantId,
        preview.targetTenantName ?? 'Restored organization'
      );
    }

    const resultSummaries: TableRestoreSummary[] = [];

    for (const table of TENANT_BACKUP_TABLES) {
      const rows = normalized.tables[table];
      if (!rows?.length) continue;
      if (!isAllowedBackupTable(table)) continue;

      const summary: TableRestoreSummary = {
        table,
        total: rows.length,
        toInsert: 0,
        toUpdate: 0,
        toSkip: 0,
        crossTenantConflicts: 0,
      };

      for (const raw of rows) {
        const row = asRecord(raw);
        if (!row) continue;
        const action = await upsertRow(
          client,
          table,
          row,
          targetTenantId,
          opts.conflictPolicy
        );
        if (action === 'insert') summary.toInsert += 1;
        else if (action === 'update') summary.toUpdate += 1;
        else summary.toSkip += 1;
      }

      resultSummaries.push(summary);
    }

    await client.query('COMMIT');

    const result: RestoreResult = {
      restoreRunId,
      targetTenantId,
      targetTenantName: preview.targetTenantName,
      mode: opts.mode,
      tableSummaries: resultSummaries,
      issues: preview.issues.filter((i) => i.severity !== 'error'),
    };

    await restoreRepo.completeRestoreRun(client, restoreRunId, result);

    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    const reason = e instanceof Error ? e.message : String(e);
    await restoreRepo.failRestoreRun(client, restoreRunId, reason);
    throw new Error(`Restore rolled back: ${reason}`);
  }
}

export async function listTenantRestoreRuns(
  client: pg.PoolClient,
  targetTenantId: string,
  limit = 20
): Promise<unknown[]> {
  return restoreRepo.listRestoreRuns(client, targetTenantId, limit);
}
