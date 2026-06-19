import type {
  AppAction,
  AppState,
  Bill,
  Contact,
  Contract,
  InstallmentPlan,
  Invoice,
  PlanAmenity,
  Project,
  Transaction,
  TransactionType,
  Unit,
  Vendor,
} from '../../types';
import type { RealtimeEntityPayload } from './realtimePayload';
import {
  normalizeRemoteContactRow,
  normalizeRemoteContractRow,
  normalizeRemoteProjectRow,
  normalizeRemoteVendorRow,
  resolveDeletedEntityId,
  shouldApplyRemoteEntityPatch,
} from './normalizeRemoteEntity';

export type EntityReducerPatchContext = {
  latestState: AppState;
  dispatch: (action: AppAction) => void;
};

/** Normalize API / WebSocket transaction payloads (camelCase or snake_case) for reducer merge. */
export function normalizeRemoteTransactionRow(raw: Record<string, unknown>): Transaction {
  const t = raw;
  return {
    id: String(t.id),
    type: t.type as TransactionType,
    subtype: (t.subtype as string | undefined) || undefined,
    amount: typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount ?? '0')),
    date: String(t.date),
    description: (t.description as string | undefined) || undefined,
    accountId: String(t.accountId ?? t.account_id ?? ''),
    fromAccountId: (t.fromAccountId ?? t.from_account_id ?? undefined) as string | undefined,
    toAccountId: (t.toAccountId ?? t.to_account_id ?? undefined) as string | undefined,
    categoryId: (t.categoryId ?? t.category_id ?? undefined) as string | undefined,
    contactId: (t.contactId ?? t.contact_id ?? undefined) as string | undefined,
    vendorId: (t.vendorId ?? t.vendor_id ?? undefined) as string | undefined,
    projectId: (t.projectId ?? t.project_id ?? undefined) as string | undefined,
    buildingId: (t.buildingId ?? t.building_id ?? undefined) as string | undefined,
    propertyId: (t.propertyId ?? t.property_id ?? undefined) as string | undefined,
    unitId: (t.unitId ?? t.unit_id ?? undefined) as string | undefined,
    invoiceId: (t.invoiceId ?? t.invoice_id ?? undefined) as string | undefined,
    billId: (t.billId ?? t.bill_id ?? undefined) as string | undefined,
    contractId: (t.contractId ?? t.contract_id ?? undefined) as string | undefined,
    agreementId: (t.agreementId ?? t.agreement_id ?? undefined) as string | undefined,
    batchId: (t.batchId ?? t.batch_id ?? undefined) as string | undefined,
    projectAssetId: (t.projectAssetId ?? t.project_asset_id ?? undefined) as string | undefined,
    ownerId: (t.ownerId ?? t.owner_id ?? undefined) as string | undefined,
    isSystem: t.isSystem === true || t.is_system === true || t.is_system === 1,
    userId: (t.userId ?? t.user_id ?? undefined) as string | undefined,
    payslipId: (t.payslipId ?? t.payslip_id ?? undefined) as string | undefined,
    reference: (t.reference as string | undefined) || undefined,
    version:
      typeof t.version === 'number'
        ? t.version
        : t.version != null
          ? parseInt(String(t.version), 10)
          : undefined,
  };
}

/** Normalize API / WebSocket unit payloads (camelCase or snake_case) for reducer merge. */
export function normalizeRemoteUnitRow(raw: Record<string, unknown>): Unit {
  const u = raw;
  const label = String(u.unitNumber ?? u.unit_number ?? u.name ?? '').trim() || String(u.id);
  return {
    id: String(u.id),
    name: label,
    unitNumber: String(u.unitNumber ?? u.unit_number ?? label),
    projectId: String(u.projectId ?? u.project_id ?? ''),
    contactId: (u.contactId ?? u.contact_id ?? u.ownerContactId ?? u.owner_contact_id ?? undefined) as
      | string
      | undefined,
    ownerContactId: (u.ownerContactId ?? u.owner_contact_id ?? undefined) as string | undefined,
    salePrice: (() => {
      const price = u.salePrice ?? u.sale_price;
      if (price == null) return undefined;
      return typeof price === 'number' ? price : parseFloat(String(price));
    })(),
    description: (u.description as string | undefined) || undefined,
    type: (u.unitType ?? u.unit_type ?? u.type ?? undefined) as string | undefined,
    size: u.size != null && u.size !== '' ? String(u.size) : undefined,
    area: (() => {
      const areaValue = u.area;
      if (areaValue == null) return undefined;
      return typeof areaValue === 'number' ? areaValue : parseFloat(String(areaValue));
    })(),
    floor: (u.floor as string | undefined) || undefined,
    status: (u.status as Unit['status']) || 'available',
    version:
      typeof u.version === 'number'
        ? u.version
        : u.version != null
          ? parseInt(String(u.version), 10)
          : undefined,
  };
}

/**
 * Apply immediate reducer patches for remote entity events (multi-user live state).
 * Caller must skip own-mutation events before invoking.
 */
export function applyEntityReducerPatch(payload: RealtimeEntityPayload, ctx: EntityReducerPatchContext): void {
  const { latestState, dispatch } = ctx;
  const d = payload?.data;

  if (payload.type === 'unit' && payload.action === 'deleted') {
    const deletedId = resolveDeletedEntityId(payload, d);
    if (deletedId) {
      dispatch({ type: 'DELETE_UNIT', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }
  if (payload.type === 'contract' && payload.action === 'deleted') {
    const deletedId = resolveDeletedEntityId(payload, d);
    if (deletedId) {
      dispatch({ type: 'DELETE_CONTRACT', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }
  if (payload.type === 'vendor' && payload.action === 'deleted') {
    const deletedId = resolveDeletedEntityId(payload, d);
    if (deletedId) {
      dispatch({ type: 'DELETE_VENDOR', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }
  if (payload.type === 'contact' && payload.action === 'deleted') {
    const deletedId = resolveDeletedEntityId(payload, d);
    if (deletedId) {
      dispatch({ type: 'DELETE_CONTACT', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }
  if (payload.type === 'project' && payload.action === 'deleted') {
    const deletedId = resolveDeletedEntityId(payload, d);
    if (deletedId) {
      dispatch({ type: 'DELETE_PROJECT', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }
  if (payload.type === 'bill' && payload.action === 'deleted' && typeof payload.id === 'string') {
    dispatch({ type: 'DELETE_BILL', payload: payload.id, _isRemote: true } as AppAction);
    return;
  }
  if (payload.type === 'transaction' && payload.action === 'deleted') {
    const deletedId =
      typeof payload.id === 'string'
        ? payload.id
        : d && typeof d === 'object' && d !== null && 'id' in d && typeof (d as { id: unknown }).id === 'string'
          ? (d as { id: string }).id
          : undefined;
    if (deletedId) {
      dispatch({ type: 'DELETE_TRANSACTION', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }
  if (payload.type === 'invoice' && payload.action === 'deleted') {
    const deletedId =
      typeof payload.id === 'string'
        ? payload.id
        : d && typeof d === 'object' && d !== null && 'id' in d && typeof (d as { id: unknown }).id === 'string'
          ? (d as { id: string }).id
          : undefined;
    if (deletedId) {
      dispatch({ type: 'DELETE_INVOICE', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }
  if (payload.type === 'installment_plan' && payload.action === 'deleted') {
    const deletedId =
      typeof payload.id === 'string'
        ? payload.id
        : d && typeof d === 'object' && d !== null && 'id' in d && typeof (d as { id: unknown }).id === 'string'
          ? (d as { id: string }).id
          : undefined;
    if (deletedId) {
      dispatch({ type: 'DELETE_INSTALLMENT_PLAN', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }
  if (payload.type === 'plan_amenity' && payload.action === 'deleted') {
    const deletedId =
      typeof payload.id === 'string'
        ? payload.id
        : d && typeof d === 'object' && d !== null && 'id' in d && typeof (d as { id: unknown }).id === 'string'
          ? (d as { id: string }).id
          : undefined;
    if (deletedId) {
      dispatch({ type: 'DELETE_PLAN_AMENITY', payload: deletedId, _isRemote: true } as AppAction);
    }
    return;
  }

  if (
    payload.action !== 'deleted' &&
    d &&
    typeof d === 'object' &&
    d !== null &&
    'id' in d &&
    typeof (d as { id: unknown }).id === 'string'
  ) {
    if (payload.type === 'bill') {
      dispatch({ type: 'UPDATE_BILL', payload: d as Bill, _isRemote: true } as AppAction);
    } else if (payload.type === 'invoice') {
      const inv = d as Invoice;
      const exists = latestState.invoices.some((i) => i.id === inv.id);
      dispatch({
        type: exists ? 'UPDATE_INVOICE' : 'ADD_INVOICE',
        payload: inv,
        _isRemote: true,
      } as AppAction);
    } else if (payload.type === 'transaction') {
      const tx = normalizeRemoteTransactionRow(d as Record<string, unknown>);
      const exists = latestState.transactions.some((t) => t.id === tx.id);
      dispatch({
        type: exists ? 'UPDATE_TRANSACTION' : 'ADD_TRANSACTION',
        payload: tx,
        _isRemote: true,
      } as AppAction);
    } else if (payload.type === 'unit') {
      const unit = normalizeRemoteUnitRow(d as Record<string, unknown>);
      const exists = latestState.units.some((u) => u.id === unit.id);
      dispatch({
        type: exists ? 'UPDATE_UNIT' : 'ADD_UNIT',
        payload: unit,
        _isRemote: true,
      } as AppAction);
    } else if (payload.type === 'installment_plan') {
      const plan = d as InstallmentPlan;
      const exists = latestState.installmentPlans.some((p) => p.id === plan.id);
      dispatch({
        type: exists ? 'UPDATE_INSTALLMENT_PLAN' : 'ADD_INSTALLMENT_PLAN',
        payload: plan,
        _isRemote: true,
      } as AppAction);
    } else if (payload.type === 'plan_amenity') {
      const amenity = d as PlanAmenity;
      const exists = latestState.planAmenities.some((a) => a.id === amenity.id);
      dispatch({
        type: exists ? 'UPDATE_PLAN_AMENITY' : 'ADD_PLAN_AMENITY',
        payload: amenity,
        _isRemote: true,
      } as AppAction);
    } else if (payload.type === 'contract') {
      const contract = normalizeRemoteContractRow(d as Record<string, unknown>);
      const existing = latestState.contracts?.find((c) => c.id === contract.id);
      if (!shouldApplyRemoteEntityPatch(existing, contract.version)) {
        return;
      }
      const exists = !!existing;
      dispatch({
        type: exists ? 'UPDATE_CONTRACT' : 'ADD_CONTRACT',
        payload: contract,
        _isRemote: true,
      } as AppAction);
    } else if (payload.type === 'vendor') {
      const vendor = normalizeRemoteVendorRow(d as Record<string, unknown>);
      const existing = latestState.vendors?.find((v) => v.id === vendor.id);
      if (!shouldApplyRemoteEntityPatch(existing, vendor.version)) {
        return;
      }
      const exists = !!existing;
      dispatch({
        type: exists ? 'UPDATE_VENDOR' : 'ADD_VENDOR',
        payload: vendor,
        _isRemote: true,
      } as AppAction);
    } else if (payload.type === 'contact') {
      const contact = normalizeRemoteContactRow(d as Record<string, unknown>);
      const existing = latestState.contacts?.find((c) => c.id === contact.id);
      if (!shouldApplyRemoteEntityPatch(existing, contact.version)) {
        return;
      }
      const exists = !!existing;
      dispatch({
        type: exists ? 'UPDATE_CONTACT' : 'ADD_CONTACT',
        payload: contact,
        _isRemote: true,
      } as AppAction);
    } else if (payload.type === 'project') {
      const project = normalizeRemoteProjectRow(d as Record<string, unknown>);
      const existing = latestState.projects?.find((p) => p.id === project.id);
      if (!shouldApplyRemoteEntityPatch(existing, project.version)) {
        return;
      }
      const exists = !!existing;
      dispatch({
        type: exists ? 'UPDATE_PROJECT' : 'ADD_PROJECT',
        payload: project,
        _isRemote: true,
      } as AppAction);
    }
  }
}
