import type { ReactNode } from 'react';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';

export type ExecutiveNavItem = {
  id: ExecutiveModuleId | 'quickTransaction' | 'approvals' | 'notifications';
  label: string;
  icon: ReactNode;
  summaryKey?: ExecutiveModuleId | 'dashboard';
  enabled: boolean;
  phase?: string;
};

export const EXECUTIVE_MODULE_NAV: ExecutiveNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ICONS.home, summaryKey: 'dashboard', enabled: true },
  { id: 'sales', label: 'Sales', icon: ICONS.trendingUp, summaryKey: 'sales', enabled: true },
  { id: 'crm', label: 'CRM', icon: ICONS.users, summaryKey: 'crm', enabled: true },
  { id: 'projects', label: 'Projects', icon: ICONS.archive, summaryKey: 'projects', enabled: true },
  { id: 'construction', label: 'Construction', icon: ICONS.briefcase, summaryKey: 'construction', enabled: true },
  { id: 'propertySelling', label: 'Property Selling', icon: ICONS.building, summaryKey: 'propertySelling', enabled: true },
  { id: 'rentals', label: 'Rentals', icon: ICONS.building, summaryKey: 'rentals', enabled: true },
  { id: 'finance', label: 'Finance', icon: ICONS.dollarSign, summaryKey: 'finance', enabled: true },
  { id: 'hr', label: 'HR', icon: ICONS.users, summaryKey: 'hr', enabled: true },
  { id: 'inventory', label: 'Inventory', icon: ICONS.package, summaryKey: 'inventory', enabled: false, phase: 'Coming soon' },
  { id: 'approvals', label: 'Approvals', icon: ICONS.checkCircle, enabled: true },
  { id: 'quickTransaction', label: 'Quick Transactions', icon: ICONS.plus, enabled: true },
  { id: 'notifications', label: 'Notifications', icon: ICONS.bell, enabled: true },
];

export const EXECUTIVE_MODULE_LABELS: Record<ExecutiveModuleId, string> = {
  dashboard: 'Executive Dashboard',
  sales: 'Sales Dashboard',
  crm: 'CRM Dashboard',
  projects: 'Project Dashboard',
  construction: 'Construction Dashboard',
  propertySelling: 'Property Selling Dashboard',
  rentals: 'Rental Dashboard',
  finance: 'Finance Dashboard',
  hr: 'HR Dashboard',
  inventory: 'Inventory Dashboard',
};

export const EXECUTIVE_REPORT_LINKS = [
  { id: 'pl', label: 'Profit & Loss', page: 'accounting' as const, tab: 'Profit & Loss' },
  { id: 'bs', label: 'Balance Sheet', page: 'accounting' as const, tab: 'Balance Sheet' },
  { id: 'cf', label: 'Cash Flow', page: 'accounting' as const, tab: 'Cash Flow' },
  { id: 'collections', label: 'Collections', page: 'rentalManagement' as const, tab: 'Analytics' },
  { id: 'projects', label: 'Project Reports', page: 'projectManagement' as const, tab: 'Reports' },
];
