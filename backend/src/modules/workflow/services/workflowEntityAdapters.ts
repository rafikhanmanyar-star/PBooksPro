import type pg from 'pg';
import {
  PurchaseOrderRepository,
  type PurchaseOrderRow,
} from '../../purchase-orders/repositories/PurchaseOrderRepository.js';
import { rowToPurchaseOrderApi } from '../../purchase-orders/services/purchaseOrderService.js';
import type { WorkflowEntityType } from '../../../workflow/workflowTypes.js';

export type WorkflowEntityContext = {
  entityRef: string;
  amount: number;
  departmentId?: string | null;
  projectId?: string | null;
  previousStatus: string;
  pendingStatus: string;
  approvedStatus: string;
  returnedStatus: string;
  snapshot: Record<string, unknown>;
};

export type WorkflowEntityAdapter = {
  entityType: WorkflowEntityType;
  load(client: pg.PoolClient, tenantId: string, entityId: string): Promise<WorkflowEntityContext | null>;
  applyPending(
    client: pg.PoolClient,
    tenantId: string,
    entityId: string,
    userId: string | null
  ): Promise<{ previousStatus: string; newStatus: string; snapshot: Record<string, unknown> }>;
  applyApproved(
    client: pg.PoolClient,
    tenantId: string,
    entityId: string,
    userId: string | null
  ): Promise<{ previousStatus: string; newStatus: string; snapshot: Record<string, unknown> }>;
  applyReturned(
    client: pg.PoolClient,
    tenantId: string,
    entityId: string,
    userId: string | null
  ): Promise<{ previousStatus: string; newStatus: string; snapshot: Record<string, unknown> }>;
  emitEntityUpdate(
    tenantId: string,
    entityId: string,
    snapshot: Record<string, unknown>,
    sourceUserId?: string | null
  ): void;
  auditModule: string;
};

const purchaseOrderAdapter: WorkflowEntityAdapter = {
  entityType: 'purchase_order',
  auditModule: 'purchase_orders',

  async load(client, tenantId, entityId) {
    const repo = new PurchaseOrderRepository(tenantId);
    const row = await repo.getById(client, entityId);
    if (!row) return null;
    return poToContext(row);
  },

  async applyPending(client, tenantId, entityId, userId) {
    const repo = new PurchaseOrderRepository(tenantId);
    const row = await repo.getByIdForUpdate(client, entityId);
    if (!row) throw new Error('Purchase order not found.');
    if (row.status !== 'Draft') throw new Error('Only Draft purchase orders can be submitted for approval.');
    const updated = await repo.setStatus(client, entityId, {
      status: 'Submitted',
      submitted_at: new Date(),
      submitted_by: userId,
    });
    if (!updated) throw new Error('Failed to submit purchase order.');
    return {
      previousStatus: row.status,
      newStatus: updated.status,
      snapshot: rowToPurchaseOrderApi(updated),
    };
  },

  async applyApproved(client, tenantId, entityId, userId) {
    const repo = new PurchaseOrderRepository(tenantId);
    const row = await repo.getByIdForUpdate(client, entityId);
    if (!row) throw new Error('Purchase order not found.');
    const allowed = row.status === 'Submitted' || row.status === 'Draft';
    if (!allowed) throw new Error(`Purchase order cannot be approved from status ${row.status}.`);
    const updated = await repo.setStatus(client, entityId, {
      status: 'Approved',
      approved_at: new Date(),
      approved_by: userId,
      ...(row.status === 'Draft'
        ? { submitted_at: new Date(), submitted_by: userId }
        : {}),
    });
    if (!updated) throw new Error('Failed to approve purchase order.');
    return {
      previousStatus: row.status,
      newStatus: updated.status,
      snapshot: rowToPurchaseOrderApi(updated),
    };
  },

  async applyReturned(client, tenantId, entityId, userId) {
    const repo = new PurchaseOrderRepository(tenantId);
    const row = await repo.getByIdForUpdate(client, entityId);
    if (!row) throw new Error('Purchase order not found.');
    if (row.status !== 'Submitted') throw new Error('Only Submitted purchase orders can be returned.');
    const updated = await repo.setStatus(client, entityId, { status: 'Draft' });
    if (!updated) throw new Error('Failed to return purchase order.');
    return {
      previousStatus: row.status,
      newStatus: updated.status,
      snapshot: rowToPurchaseOrderApi(updated),
    };
  },

  emitEntityUpdate(tenantId, entityId, snapshot, sourceUserId) {
    void import('../../../core/realtime.js').then(({ emitEntityEvent }) => {
      emitEntityEvent(tenantId, 'updated', 'purchase_order', {
        id: entityId,
        sourceUserId: sourceUserId ?? undefined,
        data: snapshot,
        version: typeof snapshot.version === 'number' ? snapshot.version : undefined,
      });
    });
  },
};

function poToContext(row: PurchaseOrderRow): WorkflowEntityContext {
  return {
    entityRef: row.po_number,
    amount: Number(row.total_amount),
    departmentId: row.department_id,
    projectId: row.project_id,
    previousStatus: row.status,
    pendingStatus: 'Submitted',
    approvedStatus: 'Approved',
    returnedStatus: 'Draft',
    snapshot: rowToPurchaseOrderApi(row),
  };
}

/** Generic adapter for entities without full lifecycle integration yet. */
function stubAdapter(
  entityType: WorkflowEntityType,
  auditModule: string,
  table: string,
  refColumn = 'id',
  statusColumn = 'status',
  approvedValue = 'Approved'
): WorkflowEntityAdapter {
  return {
    entityType,
    auditModule,
    async load(client, tenantId, entityId) {
      const r = await client.query<Record<string, unknown>>(
        `SELECT * FROM ${table}
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, entityId]
      );
      const row = r.rows[0];
      if (!row) return null;
      const status = String(row[statusColumn] ?? 'Draft');
      return {
        entityRef: String(row[refColumn] ?? entityId),
        amount: Number(row.amount ?? row.total_amount ?? row.total ?? 0),
        departmentId: (row.department_id as string) ?? null,
        projectId: (row.project_id as string) ?? null,
        previousStatus: status,
        pendingStatus: 'Submitted',
        approvedStatus: approvedValue,
        returnedStatus: 'Draft',
        snapshot: row as Record<string, unknown>,
      };
    },
    async applyPending(client, tenantId, entityId, _userId) {
      const ctx = await this.load(client, tenantId, entityId);
      if (!ctx) throw new Error(`${entityType} not found.`);
      await client.query(
        `UPDATE ${table} SET ${statusColumn} = 'Submitted', updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, entityId]
      );
      return { previousStatus: ctx.previousStatus, newStatus: 'Submitted', snapshot: ctx.snapshot };
    },
    async applyApproved(client, tenantId, entityId, userId) {
      const ctx = await this.load(client, tenantId, entityId);
      if (!ctx) throw new Error(`${entityType} not found.`);
      await client.query(
        `UPDATE ${table} SET ${statusColumn} = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, entityId, approvedValue]
      );
      return { previousStatus: ctx.previousStatus, newStatus: approvedValue, snapshot: ctx.snapshot };
    },
    async applyReturned(client, tenantId, entityId, _userId) {
      const ctx = await this.load(client, tenantId, entityId);
      if (!ctx) throw new Error(`${entityType} not found.`);
      await client.query(
        `UPDATE ${table} SET ${statusColumn} = 'Draft', updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, entityId]
      );
      return { previousStatus: ctx.previousStatus, newStatus: 'Draft', snapshot: ctx.snapshot };
    },
    emitEntityUpdate(tenantId, entityId, snapshot, sourceUserId) {
      const realtimeType =
        entityType === 'variation_order' || entityType === 'retention_release'
          ? 'contract'
          : (entityType as import('../../../core/realtime.js').RealtimeEntityType);
      void import('../../../core/realtime.js').then(({ emitEntityEvent }) => {
        emitEntityEvent(tenantId, 'updated', realtimeType, {
          id: entityId,
          sourceUserId: sourceUserId ?? undefined,
          data: snapshot,
        });
      });
    },
  };
}

const ADAPTERS: Record<WorkflowEntityType, WorkflowEntityAdapter> = {
  purchase_order: purchaseOrderAdapter,
  contract: stubAdapter('contract', 'contracts', 'contracts', 'contract_number', 'status', 'Approved'),
  bill: stubAdapter('bill', 'bills', 'bills', 'bill_number', 'status', 'Approved'),
  payment: stubAdapter('payment', 'transactions', 'transactions', 'id', 'status', 'Approved'),
  retention_release: stubAdapter(
    'retention_release',
    'contracts',
    'contracts',
    'contract_number',
    'status',
    'Approved'
  ),
  variation_order: stubAdapter(
    'variation_order',
    'contracts',
    'contracts',
    'contract_number',
    'status',
    'Approved'
  ),
};

export function getWorkflowEntityAdapter(entityType: WorkflowEntityType): WorkflowEntityAdapter {
  const adapter = ADAPTERS[entityType];
  if (!adapter) throw new Error(`Unsupported workflow entity type: ${entityType}`);
  return adapter;
}

export function listWorkflowEntityTypes(): WorkflowEntityType[] {
  return Object.keys(ADAPTERS) as WorkflowEntityType[];
}
