import { ICONS } from '../../../constants';
import { UNPOSTED_TRANSACTION_TYPES } from '../../../types/executiveMobile.types';
import type { ReactNode } from 'react';

export const WIZARD_STEPS = [
  { id: 1, key: 'type', title: 'What happened?', subtitle: 'Pick the closest match' },
  { id: 2, key: 'amount', title: 'How much?', subtitle: 'Enter the amount in PKR' },
  { id: 3, key: 'details', title: 'Who & why?', subtitle: 'Help finance identify the party' },
  { id: 4, key: 'receipt', title: 'Receipt photo', subtitle: 'Optional — snap or upload' },
  { id: 5, key: 'review', title: 'Review & submit', subtitle: 'Confirm before sending to finance' },
] as const;

export const QUICK_AMOUNT_PRESETS = [5_000, 10_000, 25_000, 50_000, 100_000] as const;

const TYPE_ICONS: Record<string, ReactNode> = {
  supplier_payment: ICONS.wallet,
  employee_payment: ICONS.users,
  material_purchase: ICONS.package,
  customer_collection: ICONS.arrowDownCircle,
  fuel_expense: ICONS.activity,
  site_expense: ICONS.building,
  travel_expense: ICONS.mapPin,
  office_expense: ICONS.briefcase,
  other: ICONS.fileText,
};

export const OUTFLOW_TYPE_IDS = new Set([
  'supplier_payment',
  'employee_payment',
  'material_purchase',
  'fuel_expense',
  'site_expense',
  'travel_expense',
  'office_expense',
  'other',
]);

export function transactionTypeIcon(id: string): ReactNode {
  return TYPE_ICONS[id] ?? ICONS.fileText;
}

export function transactionTypeLabel(id: string): string {
  return UNPOSTED_TRANSACTION_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function partyPlaceholder(transactionType: string): string {
  switch (transactionType) {
    case 'supplier_payment':
      return 'Supplier name';
    case 'employee_payment':
      return 'Worker / contractor name';
    case 'material_purchase':
      return 'Vendor or shop name';
    case 'customer_collection':
      return 'Customer name';
    case 'fuel_expense':
      return 'Fuel station (optional)';
    case 'site_expense':
      return 'Site or vendor (optional)';
    case 'travel_expense':
      return 'Driver / agency (optional)';
    case 'office_expense':
      return 'Vendor (optional)';
    default:
      return 'Party name (optional)';
  }
}

export function isInflowType(id: string): boolean {
  return id === 'customer_collection';
}
