import type pg from 'pg';
import {
  PurchaseOrderRepository,
  type PurchaseOrderRow,
} from '../../purchase-orders/repositories/PurchaseOrderRepository.js';
import { rowToPurchaseOrderApi } from '../../purchase-orders/services/purchaseOrderService.js';
import {
  getBillById,
  rowToBillApi,
  type BillRow,
} from '../../vendors/services/billsService.js';
import {
  getContractById,
  rowToContractApi,
  type ContractRow,
} from '../../vendors/services/contractsService.js';
import {
  getTransactionById,
  rowToTransactionApi,
  postTransactionAfterApproval,
  type TransactionRow,
} from '../../accounting/services/transactionsService.js';
import type { WorkflowEntityType } from '../../../workflow/workflowTypes.js';
import { isApprovalGated } from '../../../workflow/approvalLifecycle.js';
import {
  getApprovalAuditRow,
  setApprovalLifecycleStatus,
  transactionRequiresPaymentApproval,
} from './approvalLifecycleService.js';

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

function emitRealtime(
  tenantId: string,
  entityType: import('../../../core/realtime.js').RealtimeEntityType,
  entityId: string,
  snapshot: Record<string, unknown>,
  sourceUserId?: string | null
) {
  void import('../../../core/realtime.js').then(({ emitEntityEvent }) => {
    emitEntityEvent(tenantId, 'updated', entityType, {
      id: entityId,
      sourceUserId: sourceUserId ?? undefined,
      data: snapshot,
      version: typeof snapshot.version === 'number' ? snapshot.version : undefined,
    });
  });
}

function billToContext(row: BillRow): WorkflowEntityContext {
  const approvalStatus = String((row as BillRow & { approval_status?: string }).approval_status ?? 'Approved');
  return {
    entityRef: row.bill_number,
    amount: Number(row.amount),
    departmentId: null,
    projectId: row.project_id,
    previousStatus: approvalStatus,
    pendingStatus: 'Submitted',
    approvedStatus: 'Approved',
    returnedStatus: 'Draft',
    snapshot: rowToBillApi(row),
  };
}

function contractToContext(row: ContractRow): WorkflowEntityContext {
  const approvalStatus = String((row as ContractRow & { approval_status?: string }).approval_status ?? 'Approved');
  return {
    entityRef: row.contract_number,
    amount: Number(row.total_amount),
    departmentId: null,
    projectId: row.project_id,
    previousStatus: approvalStatus,
    pendingStatus: 'Submitted',
    approvedStatus: 'Approved',
    returnedStatus: 'Draft',
    snapshot: rowToContractApi(row),
  };
}

function paymentToContext(row: TransactionRow): WorkflowEntityContext {
  const approvalStatus = String((row as TransactionRow & { approval_status?: string }).approval_status ?? 'Approved');
  return {
    entityRef: row.reference?.trim() || row.id,
    amount: Number(row.amount),
    departmentId: null,
    projectId: row.project_id,
    previousStatus: approvalStatus,
    pendingStatus: 'Submitted',
    approvedStatus: 'Approved',
    returnedStatus: 'Draft',
    snapshot: rowToTransactionApi(row),
  };
}

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
    emitRealtime(tenantId, 'purchase_order', entityId, snapshot, sourceUserId);
  },
};

const billAdapter: WorkflowEntityAdapter = {
  entityType: 'bill',
  auditModule: 'bills',

  async load(client, tenantId, entityId) {
    const row = await getBillById(client, tenantId, entityId);
    if (!row) return null;
    return billToContext(row);
  },

  async applyPending(client, tenantId, entityId, userId) {
    const row = await getBillById(client, tenantId, entityId);
    if (!row) throw new Error('Bill not found.');
    const approval = String((row as BillRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Draft') {
      throw new Error('Only draft bills can be submitted for approval.');
    }
    await setApprovalLifecycleStatus(client, tenantId, 'bills', entityId, 'Submitted', userId);
    const updated = await getBillById(client, tenantId, entityId);
    if (!updated) throw new Error('Bill not found after submit.');
    return {
      previousStatus: approval,
      newStatus: 'Submitted',
      snapshot: rowToBillApi(updated),
    };
  },

  async applyApproved(client, tenantId, entityId, userId) {
    const row = await getBillById(client, tenantId, entityId);
    if (!row) throw new Error('Bill not found.');
    const approval = String((row as BillRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Submitted' && approval !== 'Draft') {
      throw new Error(`Bill cannot be approved from approval status ${approval}.`);
    }
    const paymentStatus = row.status === 'Draft' ? 'Unpaid' : row.status;
    await setApprovalLifecycleStatus(client, tenantId, 'bills', entityId, 'Approved', userId, {
      paymentStatus,
    });
    const { postBillAfterApproval } = await import('../../vendors/services/billsService.js');
    const updated = await postBillAfterApproval(client, tenantId, entityId, userId);
    return {
      previousStatus: approval,
      newStatus: 'Approved',
      snapshot: rowToBillApi(updated),
    };
  },

  async applyReturned(client, tenantId, entityId, userId) {
    const row = await getBillById(client, tenantId, entityId);
    if (!row) throw new Error('Bill not found.');
    const approval = String((row as BillRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Submitted') throw new Error('Only submitted bills can be returned.');
    await setApprovalLifecycleStatus(client, tenantId, 'bills', entityId, 'Draft', userId, {
      paymentStatus: 'Draft',
    });
    const updated = await getBillById(client, tenantId, entityId);
    if (!updated) throw new Error('Bill not found after return.');
    return {
      previousStatus: approval,
      newStatus: 'Draft',
      snapshot: rowToBillApi(updated),
    };
  },

  emitEntityUpdate(tenantId, entityId, snapshot, sourceUserId) {
    emitRealtime(tenantId, 'bill', entityId, snapshot, sourceUserId);
  },
};

const contractAdapter: WorkflowEntityAdapter = {
  entityType: 'contract',
  auditModule: 'contracts',

  async load(client, tenantId, entityId) {
    const row = await getContractById(client, tenantId, entityId);
    if (!row) return null;
    return contractToContext(row);
  },

  async applyPending(client, tenantId, entityId, userId) {
    const row = await getContractById(client, tenantId, entityId);
    if (!row) throw new Error('Contract not found.');
    const approval = String((row as ContractRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Draft') throw new Error('Only draft contracts can be submitted for approval.');
    await setApprovalLifecycleStatus(client, tenantId, 'contracts', entityId, 'Submitted', userId);
    const updated = await getContractById(client, tenantId, entityId);
    if (!updated) throw new Error('Contract not found after submit.');
    return {
      previousStatus: approval,
      newStatus: 'Submitted',
      snapshot: rowToContractApi(updated),
    };
  },

  async applyApproved(client, tenantId, entityId, userId) {
    const row = await getContractById(client, tenantId, entityId);
    if (!row) throw new Error('Contract not found.');
    const approval = String((row as ContractRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Submitted' && approval !== 'Draft') {
      throw new Error(`Contract cannot be approved from approval status ${approval}.`);
    }
    const contractStatus = row.status === 'Pending' || row.status === 'Draft' ? 'Active' : row.status;
    await setApprovalLifecycleStatus(client, tenantId, 'contracts', entityId, 'Approved', userId, {
      contractStatus,
    });
    const updated = await getContractById(client, tenantId, entityId);
    if (!updated) throw new Error('Contract not found after approve.');
    return {
      previousStatus: approval,
      newStatus: 'Approved',
      snapshot: rowToContractApi(updated),
    };
  },

  async applyReturned(client, tenantId, entityId, userId) {
    const row = await getContractById(client, tenantId, entityId);
    if (!row) throw new Error('Contract not found.');
    const approval = String((row as ContractRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Submitted') throw new Error('Only submitted contracts can be returned.');
    await setApprovalLifecycleStatus(client, tenantId, 'contracts', entityId, 'Draft', userId, {
      contractStatus: 'Pending',
    });
    const updated = await getContractById(client, tenantId, entityId);
    if (!updated) throw new Error('Contract not found after return.');
    return {
      previousStatus: approval,
      newStatus: 'Draft',
      snapshot: rowToContractApi(updated),
    };
  },

  emitEntityUpdate(tenantId, entityId, snapshot, sourceUserId) {
    emitRealtime(tenantId, 'contract', entityId, snapshot, sourceUserId);
  },
};

const paymentAdapter: WorkflowEntityAdapter = {
  entityType: 'payment',
  auditModule: 'transactions',

  async load(client, tenantId, entityId) {
    const row = await getTransactionById(client, tenantId, entityId);
    if (!row) return null;
    if (!transactionRequiresPaymentApproval(row)) {
      throw new Error('This transaction does not require payment approval workflow.');
    }
    return paymentToContext(row);
  },

  async applyPending(client, tenantId, entityId, userId) {
    const row = await getTransactionById(client, tenantId, entityId);
    if (!row) throw new Error('Payment not found.');
    if (!transactionRequiresPaymentApproval(row)) {
      throw new Error('This transaction does not require payment approval workflow.');
    }
    const approval = String((row as TransactionRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Draft') throw new Error('Only draft payments can be submitted for approval.');
    await setApprovalLifecycleStatus(client, tenantId, 'transactions', entityId, 'Submitted', userId);
    const updated = await getTransactionById(client, tenantId, entityId);
    if (!updated) throw new Error('Payment not found after submit.');
    return {
      previousStatus: approval,
      newStatus: 'Submitted',
      snapshot: rowToTransactionApi(updated),
    };
  },

  async applyApproved(client, tenantId, entityId, userId) {
    const row = await getTransactionById(client, tenantId, entityId);
    if (!row) throw new Error('Payment not found.');
    if (!transactionRequiresPaymentApproval(row)) {
      throw new Error('This transaction does not require payment approval workflow.');
    }
    const approval = String((row as TransactionRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Submitted' && approval !== 'Draft') {
      throw new Error(`Payment cannot be approved from approval status ${approval}.`);
    }
    await setApprovalLifecycleStatus(client, tenantId, 'transactions', entityId, 'Approved', userId);
    const updated = await postTransactionAfterApproval(client, tenantId, entityId, userId);
    return {
      previousStatus: approval,
      newStatus: 'Approved',
      snapshot: rowToTransactionApi(updated),
    };
  },

  async applyReturned(client, tenantId, entityId, userId) {
    const row = await getTransactionById(client, tenantId, entityId);
    if (!row) throw new Error('Payment not found.');
    const approval = String((row as TransactionRow & { approval_status?: string }).approval_status ?? 'Approved');
    if (approval !== 'Submitted') throw new Error('Only submitted payments can be returned.');
    await setApprovalLifecycleStatus(client, tenantId, 'transactions', entityId, 'Draft', userId);
    const updated = await getTransactionById(client, tenantId, entityId);
    if (!updated) throw new Error('Payment not found after return.');
    return {
      previousStatus: approval,
      newStatus: 'Draft',
      snapshot: rowToTransactionApi(updated),
    };
  },

  emitEntityUpdate(tenantId, entityId, snapshot, sourceUserId) {
    emitRealtime(tenantId, 'transaction', entityId, snapshot, sourceUserId);
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

/** Generic adapter for variation/retention entities (contract table proxy). */
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
      const audit = await getApprovalAuditRow(client, tenantId, table as 'contracts', entityId);
      const status = String(audit?.approval_status ?? row[statusColumn] ?? 'Draft');
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
    async applyPending(client, tenantId, entityId, userId) {
      const ctx = await this.load(client, tenantId, entityId);
      if (!ctx) throw new Error(`${entityType} not found.`);
      await setApprovalLifecycleStatus(client, tenantId, 'contracts', entityId, 'Submitted', userId);
      return { previousStatus: ctx.previousStatus, newStatus: 'Submitted', snapshot: ctx.snapshot };
    },
    async applyApproved(client, tenantId, entityId, userId) {
      const ctx = await this.load(client, tenantId, entityId);
      if (!ctx) throw new Error(`${entityType} not found.`);
      await setApprovalLifecycleStatus(client, tenantId, 'contracts', entityId, 'Approved', userId);
      return { previousStatus: ctx.previousStatus, newStatus: approvedValue, snapshot: ctx.snapshot };
    },
    async applyReturned(client, tenantId, entityId, userId) {
      const ctx = await this.load(client, tenantId, entityId);
      if (!ctx) throw new Error(`${entityType} not found.`);
      await setApprovalLifecycleStatus(client, tenantId, 'contracts', entityId, 'Draft', userId);
      return { previousStatus: ctx.previousStatus, newStatus: 'Draft', snapshot: ctx.snapshot };
    },
    emitEntityUpdate(tenantId, entityId, snapshot, sourceUserId) {
      emitRealtime(tenantId, 'contract', entityId, snapshot, sourceUserId);
    },
  };
}

const ADAPTERS: Record<WorkflowEntityType, WorkflowEntityAdapter> = {
  purchase_order: purchaseOrderAdapter,
  contract: contractAdapter,
  bill: billAdapter,
  payment: paymentAdapter,
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

export { isApprovalGated };
