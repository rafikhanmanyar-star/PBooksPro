import { ICONS } from '../../../constants';
import type { QuickActionId } from '../../../types/executiveMobile.types';
import type { ReactNode } from 'react';

export type QuickActionDef = {
  id: QuickActionId;
  label: string;
  icon: ReactNode;
  iconClass: string;
};

export const DEFAULT_QUICK_ACTIONS: QuickActionDef[] = [
  { id: 'approve_all', label: 'Approve All', icon: ICONS.checkCircle, iconClass: 'executive-qa-icon--green' },
  { id: 'review_contracts', label: 'Review Contracts', icon: ICONS.fileText, iconClass: 'executive-qa-icon--blue' },
  { id: 'view_collections', label: 'View Collections', icon: ICONS.handDollar, iconClass: 'executive-qa-icon--amber' },
  { id: 'review_vendor_bills', label: 'Review Vendor Bills', icon: ICONS.clipboard, iconClass: 'executive-qa-icon--violet' },
  { id: 'retention_releases', label: 'Retention Releases', icon: ICONS.wallet, iconClass: 'executive-qa-icon--rose' },
];

export const QUICK_ACTIONS_STORAGE_KEY = 'executive_mobile_quick_actions_v2';
