import { ICONS } from '../../../constants';
import type { ReactNode } from 'react';

export type MoneyFlow = 'out' | 'in';

export type OutflowCaptureKind = 'suppliers' | 'staff' | 'site' | 'misc';
export type InflowCaptureKind = 'customer_collection' | 'cash_deposit';
export type CoreCaptureKind = OutflowCaptureKind | InflowCaptureKind;

export type CaptureType = {
  id: string;
  label: string;
  kind: CoreCaptureKind | 'custom';
  flow?: MoneyFlow;
};

/** Expense types (Money Out). */
export const OUTFLOW_CAPTURE_TYPES: CaptureType[] = [
  { id: 'suppliers', label: 'Suppliers', kind: 'suppliers' },
  { id: 'staff', label: 'Staff', kind: 'staff' },
  { id: 'site', label: 'Site', kind: 'site' },
  { id: 'misc', label: 'Misc', kind: 'misc' },
];

/** Income types (Money In). */
export const INFLOW_CAPTURE_TYPES: CaptureType[] = [
  { id: 'customer_collection', label: 'Customer Collection', kind: 'customer_collection' },
  { id: 'cash_deposit', label: 'Cash Deposit', kind: 'cash_deposit' },
];

/** @deprecated Use OUTFLOW_CAPTURE_TYPES */
export const CORE_CAPTURE_TYPES = OUTFLOW_CAPTURE_TYPES;

const CAPTURE_ICONS: Record<string, ReactNode> = {
  suppliers: ICONS.shoppingCart,
  staff: ICONS.users,
  site: ICONS.building,
  misc: ICONS.fileText,
  customer_collection: ICONS.users,
  cash_deposit: ICONS.wallet,
  custom: ICONS.layers,
};

export function captureTypesForFlow(moneyFlow: MoneyFlow): CaptureType[] {
  return moneyFlow === 'in' ? INFLOW_CAPTURE_TYPES : OUTFLOW_CAPTURE_TYPES;
}

export function captureTypeDisplayLabel(type: CaptureType, _moneyFlow: MoneyFlow): string {
  if (type.kind === 'custom') return type.label;
  return type.label;
}

export function captureTypeIcon(type: CaptureType, _moneyFlow: MoneyFlow): ReactNode {
  if (type.kind === 'custom') return CAPTURE_ICONS.custom;
  return CAPTURE_ICONS[type.kind] ?? ICONS.fileText;
}

export function isEntityPickerKind(kind: CaptureType['kind'], _moneyFlow: MoneyFlow): boolean {
  return kind === 'staff' || kind === 'suppliers' || kind === 'customer_collection';
}

export function isCustomerPickerKind(kind: CaptureType['kind'], _moneyFlow: MoneyFlow): boolean {
  return kind === 'customer_collection';
}

export function isVendorPickerKind(kind: CaptureType['kind'], moneyFlow: MoneyFlow): boolean {
  return moneyFlow === 'out' && kind === 'suppliers';
}

export function isNameInputKind(kind: CaptureType['kind']): boolean {
  return kind === 'site' || kind === 'misc' || kind === 'cash_deposit' || kind === 'custom';
}

export function defaultCaptureType(moneyFlow: MoneyFlow = 'out'): CaptureType {
  return captureTypesForFlow(moneyFlow)[0]!;
}

export function moneyFlowLabel(flow: MoneyFlow): string {
  return flow === 'in' ? 'Money In' : 'Money Out';
}

export function moneyFlowDirectionLabel(flow: MoneyFlow): string {
  return flow === 'in' ? 'Income' : 'Expense';
}
