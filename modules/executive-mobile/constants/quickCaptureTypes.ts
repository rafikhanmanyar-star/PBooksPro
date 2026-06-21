import { ICONS } from '../../../constants';
import type { ReactNode } from 'react';

export type CoreCaptureKind = 'suppliers' | 'staff' | 'site' | 'misc';

export type CaptureType = {
  id: string;
  label: string;
  kind: CoreCaptureKind | 'custom';
};

export const CORE_CAPTURE_TYPES: CaptureType[] = [
  { id: 'suppliers', label: 'Suppliers', kind: 'suppliers' },
  { id: 'staff', label: 'Staff', kind: 'staff' },
  { id: 'site', label: 'Site', kind: 'site' },
  { id: 'misc', label: 'Misc', kind: 'misc' },
];

const CAPTURE_ICONS: Record<string, ReactNode> = {
  suppliers: ICONS.shoppingCart,
  staff: ICONS.users,
  site: ICONS.building,
  misc: ICONS.fileText,
  custom: ICONS.layers,
};

export function captureTypeIcon(type: CaptureType): ReactNode {
  if (type.kind === 'custom') return CAPTURE_ICONS.custom;
  return CAPTURE_ICONS[type.kind] ?? ICONS.fileText;
}

export function isEntityPickerKind(kind: CaptureType['kind']): boolean {
  return kind === 'suppliers' || kind === 'staff';
}

export function isNameInputKind(kind: CaptureType['kind']): boolean {
  return kind === 'site' || kind === 'misc' || kind === 'custom';
}

export function defaultCaptureType(): CaptureType {
  return CORE_CAPTURE_TYPES[0]!;
}
