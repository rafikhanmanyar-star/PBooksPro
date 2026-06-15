import type pg from 'pg';
import {
  buildRetentionSummary,
  calculateRetentionAmount,
  computeRetentionBalanceOnSave,
  normalizeRetentionType,
  roundMoney,
  validateRetentionThreshold,
} from '../../../contractRetention/contractRetentionCore.js';
import type {
  ContractRetentionFields,
  RetentionReleaseMethod,
  RetentionSummary,
  RetentionThresholdValidation,
  RetentionType,
} from '../../../contractRetention/types.js';
import { formatPgDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import type { ContractRow } from './contractsService.js';
import { createUserNotifications } from '../../notifications/services/userNotificationService.js';

export type ContractRetentionRowFields = {
  retention_type: string;
  retention_percentage: string | null;
  retention_amount: string | null;
  retention_release_method: string | null;
  retention_release_date: Date | null;
  retention_notes: string | null;
  retention_balance: string;
  retention_released: string;
  retention_release_by: string | null;
};

export function contractRowToRetentionFields(
  row: ContractRow & Partial<ContractRetentionRowFields>
): ContractRetentionFields {
  return {
    retentionType: normalizeRetentionType(row.retention_type) as RetentionType,
    retentionPercentage:
      row.retention_percentage != null && row.retention_percentage !== ''
        ? Number(row.retention_percentage)
        : null,
    retentionAmount:
      row.retention_amount != null && row.retention_amount !== ''
        ? Number(row.retention_amount)
        : null,
    retentionReleaseMethod: (row.retention_release_method as RetentionReleaseMethod) ?? null,
    retentionReleaseDate: row.retention_release_date
      ? formatPgDateToYyyyMmDd(row.retention_release_date)
      : null,
    retentionNotes: row.retention_notes ?? null,
    retentionBalance: Number(row.retention_balance ?? 0) || 0,
    retentionReleased: Number(row.retention_released ?? 0) || 0,
    retentionReleaseBy: row.retention_release_by ?? null,
  };
}

export function retentionFieldsToApi(fields: ContractRetentionFields): Record<string, unknown> {
  return {
    retentionType: fields.retentionType,
    retentionPercentage: fields.retentionPercentage ?? undefined,
    retentionAmount: fields.retentionAmount ?? undefined,
    retentionReleaseMethod: fields.retentionReleaseMethod ?? undefined,
    retentionReleaseDate: fields.retentionReleaseDate ?? undefined,
    retentionNotes: fields.retentionNotes ?? undefined,
    retentionBalance: fields.retentionBalance ?? 0,
    retentionReleased: fields.retentionReleased ?? 0,
    retentionReleaseBy: fields.retentionReleaseBy ?? undefined,
  };
}

export function pickRetentionFromBody(body: Record<string, unknown>): ContractRetentionFields {
  const type = normalizeRetentionType(body.retentionType ?? body.retention_type ?? 'NONE');
  const pctRaw = body.retentionPercentage ?? body.retention_percentage;
  const amtRaw = body.retentionAmount ?? body.retention_amount;
  const methodRaw = body.retentionReleaseMethod ?? body.retention_release_method;
  const dateRaw = body.retentionReleaseDate ?? body.retention_release_date;
  const notesRaw = body.retentionNotes ?? body.retention_notes;

  return {
    retentionType: type,
    retentionPercentage: (() => {
      if (pctRaw === undefined || pctRaw === null || pctRaw === '') return null;
      const n = Number(pctRaw);
      return Number.isFinite(n) ? n : null;
    })(),
    retentionAmount: (() => {
      if (amtRaw === undefined || amtRaw === null || amtRaw === '') return null;
      const n = Number(amtRaw);
      return Number.isFinite(n) ? n : null;
    })(),
    retentionReleaseMethod:
      methodRaw === undefined || methodRaw === null || methodRaw === ''
        ? null
        : (String(methodRaw).trim().toUpperCase() as RetentionReleaseMethod),
    retentionReleaseDate:
      dateRaw === undefined || dateRaw === null || dateRaw === ''
        ? null
        : String(dateRaw).slice(0, 10),
    retentionNotes:
      notesRaw === undefined || notesRaw === null ? null : String(notesRaw),
    retentionReleased: Number(body.retentionReleased ?? body.retention_released ?? 0) || 0,
    retentionReleaseBy:
      body.retentionReleaseBy === undefined && body.retention_release_by === undefined
        ? null
        : String(body.retentionReleaseBy ?? body.retention_release_by ?? '').trim() || null,
  };
}

export function retentionWriteParams(
  contractValue: number,
  fields: ContractRetentionFields
): {
  retention_type: string;
  retention_percentage: number | null;
  retention_amount: number | null;
  retention_release_method: string | null;
  retention_release_date: string | null;
  retention_notes: string | null;
  retention_balance: number;
  retention_released: number;
} {
  const balances = computeRetentionBalanceOnSave(contractValue, fields);
  const computedRetention = calculateRetentionAmount(contractValue, fields);

  return {
    retention_type: fields.retentionType,
    retention_percentage:
      fields.retentionType === 'PERCENTAGE' && fields.retentionPercentage != null
        ? fields.retentionPercentage
        : null,
    retention_amount:
      fields.retentionType === 'PERCENTAGE'
        ? computedRetention
        : fields.retentionType === 'FIXED_AMOUNT' && fields.retentionAmount != null
          ? fields.retentionAmount
          : null,
    retention_release_method: fields.retentionReleaseMethod ?? null,
    retention_release_date: fields.retentionReleaseDate ?? null,
    retention_notes: fields.retentionNotes ?? null,
    retention_balance: balances.retentionBalance,
    retention_released: balances.retentionReleased,
  };
}

export async function getContractPaidAmount(
  client: pg.PoolClient,
  tenantId: string,
  contractId: string
): Promise<number> {
  const r = await client.query<{ paid: string }>(
    `SELECT COALESCE(SUM(t.amount), 0)::text AS paid
     FROM transactions t
     WHERE t.tenant_id = $1 AND t.contract_id = $2 AND t.deleted_at IS NULL
       AND t.type = 'Expense'`,
    [tenantId, contractId]
  );
  return roundMoney(Number(r.rows[0]?.paid ?? 0));
}

export async function getContractRetentionSummary(
  client: pg.PoolClient,
  tenantId: string,
  contract: ContractRow & Partial<ContractRetentionRowFields>,
  projectedPaidAmount?: number
): Promise<RetentionSummary> {
  const fields = contractRowToRetentionFields(contract);
  const paid =
    projectedPaidAmount !== undefined
      ? projectedPaidAmount
      : await getContractPaidAmount(client, tenantId, contract.id);
  return buildRetentionSummary({
    contractValue: Number(contract.total_amount) || 0,
    paidAmount: paid,
    fields,
  });
}

export async function validateRetentionThresholdForContract(
  client: pg.PoolClient,
  tenantId: string,
  contract: ContractRow & Partial<ContractRetentionRowFields>,
  opts?: { additionalPayment?: number }
): Promise<RetentionThresholdValidation> {
  const fields = contractRowToRetentionFields(contract);
  const currentPaid = await getContractPaidAmount(client, tenantId, contract.id);
  const projected = roundMoney(currentPaid + (opts?.additionalPayment ?? 0));
  return validateRetentionThreshold({
    contractValue: Number(contract.total_amount) || 0,
    paidAmount: currentPaid,
    projectedPaidAmount: projected,
    fields,
  });
}

export type RetentionMonitoringFilters = {
  projectId?: string;
  vendorId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type RetentionMonitoringRow = RetentionSummary & {
  contractId: string;
  contractNumber: string;
  contractName: string;
  projectId: string;
  projectName: string;
  vendorId: string;
  vendorName: string;
  status: string;
  retentionType: RetentionType;
  retentionPercentage: number | null;
};

export type RetentionMonitoringDashboard = {
  nearLimit: RetentionMonitoringRow[];
  exceedingLimit: RetentionMonitoringRow[];
  totalRetentionHeld: number;
  totalRetentionReleased: number;
  outstandingRetentionLiability: number;
};

export async function getRetentionMonitoringDashboard(
  client: pg.PoolClient,
  tenantId: string,
  filters?: RetentionMonitoringFilters
): Promise<RetentionMonitoringDashboard> {
  const params: unknown[] = [tenantId];
  let q = `
    SELECT c.id, c.contract_number, c.name, c.project_id, c.vendor_id, c.status,
           c.total_amount, c.retention_type, c.retention_percentage, c.retention_amount,
           c.retention_release_method, c.retention_release_date, c.retention_notes,
           c.retention_balance, c.retention_released, c.retention_release_by,
           COALESCE(p.name, '') AS project_name,
           COALESCE(v.name, '') AS vendor_name
    FROM contracts c
    LEFT JOIN projects p ON p.id = c.project_id AND p.tenant_id = c.tenant_id
    LEFT JOIN vendors v ON v.id = c.vendor_id AND v.tenant_id = c.tenant_id
    WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
      AND c.retention_type <> 'NONE'`;

  if (filters?.projectId) {
    params.push(filters.projectId);
    q += ` AND c.project_id = $${params.length}`;
  }
  if (filters?.vendorId) {
    params.push(filters.vendorId);
    q += ` AND c.vendor_id = $${params.length}`;
  }
  if (filters?.status) {
    params.push(filters.status);
    q += ` AND c.status = $${params.length}`;
  }
  if (filters?.dateFrom) {
    params.push(filters.dateFrom);
    q += ` AND c.start_date >= $${params.length}::date`;
  }
  if (filters?.dateTo) {
    params.push(filters.dateTo);
    q += ` AND c.start_date <= $${params.length}::date`;
  }

  q += ' ORDER BY c.contract_number ASC';

  const r = await client.query(q, params);
  const nearLimit: RetentionMonitoringRow[] = [];
  const exceedingLimit: RetentionMonitoringRow[] = [];
  let totalRetentionHeld = 0;
  let totalRetentionReleased = 0;
  let outstandingRetentionLiability = 0;

  for (const row of r.rows) {
    const paid = await getContractPaidAmount(client, tenantId, row.id);
    const fields = contractRowToRetentionFields(row);
    const summary = buildRetentionSummary({
      contractValue: Number(row.total_amount) || 0,
      paidAmount: paid,
      fields,
    });

    const item: RetentionMonitoringRow = {
      ...summary,
      contractId: row.id,
      contractNumber: row.contract_number,
      contractName: row.name,
      projectId: row.project_id,
      projectName: row.project_name,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      status: row.status,
      retentionType: fields.retentionType,
      retentionPercentage: fields.retentionPercentage ?? null,
    };

    totalRetentionHeld += summary.retentionHeld;
    totalRetentionReleased += summary.retentionReleased;
    outstandingRetentionLiability += summary.remainingRetention;

    if (summary.alertLevel === 'critical') exceedingLimit.push(item);
    else if (summary.alertLevel === 'warning') nearLimit.push(item);
  }

  return {
    nearLimit,
    exceedingLimit,
    totalRetentionHeld: roundMoney(totalRetentionHeld),
    totalRetentionReleased: roundMoney(totalRetentionReleased),
    outstandingRetentionLiability: roundMoney(outstandingRetentionLiability),
  };
}

export async function releaseRetention(
  client: pg.PoolClient,
  tenantId: string,
  contractId: string,
  actorUserId: string | null,
  input: { amount?: number; fullRelease?: boolean; releaseDate?: string }
): Promise<ContractRow & Partial<ContractRetentionRowFields>> {
  const r = await client.query(
    `SELECT * FROM contracts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [contractId, tenantId]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Contract not found.');

  const fields = contractRowToRetentionFields(row);
  if (fields.retentionType === 'NONE') {
    throw new Error('Contract has no retention configured.');
  }

  const contractValue = Number(row.total_amount) || 0;
  const totalRetention = calculateRetentionAmount(contractValue, fields);
  const currentReleased = roundMoney(fields.retentionReleased ?? 0);
  const available = roundMoney(totalRetention - currentReleased);

  if (available <= 0) throw new Error('No retention balance available to release.');

  let releaseAmt: number;
  if (input.fullRelease) {
    releaseAmt = available;
  } else {
    releaseAmt = roundMoney(Number(input.amount));
    if (!Number.isFinite(releaseAmt) || releaseAmt <= 0) {
      throw new Error('Release amount must be positive.');
    }
    if (releaseAmt > available + 0.01) {
      throw new Error(`Release amount cannot exceed available retention (${available}).`);
    }
  }

  const newReleased = roundMoney(currentReleased + releaseAmt);
  const newBalance = roundMoney(totalRetention - newReleased);
  const releaseDate = input.releaseDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const upd = await client.query(
    `UPDATE contracts SET
       retention_released = $3,
       retention_balance = $4,
       retention_release_date = $5::date,
       retention_release_by = $6,
       version = version + 1,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [contractId, tenantId, newReleased, newBalance, releaseDate, actorUserId]
  );
  return upd.rows[0]!;
}

export async function notifyRetentionThresholdIfNeeded(
  client: pg.PoolClient,
  tenantId: string,
  contract: ContractRow & Partial<ContractRetentionRowFields>,
  validation: RetentionThresholdValidation,
  actorUserId: string | null
): Promise<void> {
  if (validation.alertLevel === 'none') return;

  const recipientIds = await listRetentionNotificationRecipients(client, tenantId, actorUserId);
  if (!recipientIds.length) return;

  const severity = validation.alertLevel === 'critical' ? 'urgent' : 'warning';
  const title =
    validation.alertLevel === 'critical'
      ? 'Retention threshold reached'
      : 'Contract nearing retention limit';

  await createUserNotifications(client, tenantId, recipientIds, {
    category: 'contract_retention',
    title,
    body: `Contract ${contract.contract_number} — ${validation.message ?? ''}`,
    severity,
    actionType: 'contract',
    actionId: contract.id,
    entityType: 'contract',
    entityId: contract.id,
  });
}

async function listRetentionNotificationRecipients(
  client: pg.PoolClient,
  tenantId: string,
  excludeUserId?: string | null
): Promise<string[]> {
  const r = await client.query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE tenant_id = $1 AND is_active = TRUE`,
    [tenantId]
  );
  const { roleHasPermission } = await import('../../../auth/permissions.js');
  return r.rows
    .filter((row) => {
      if (excludeUserId && row.id === excludeUserId) return false;
      return (
        roleHasPermission(row.role, 'contracts.retention.view') ||
        roleHasPermission(row.role, 'contracts.retention.edit')
      );
    })
    .map((row) => row.id);
}
