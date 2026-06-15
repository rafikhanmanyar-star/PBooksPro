import type { ReactNode } from 'react';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';

export type ExecutiveNavItem = {
  id: ExecutiveModuleId | 'quickTransaction' | 'approvals' | 'notifications';
  label: string;
  icon: ReactNode;
  summaryKey?: ExecutiveModuleId | 'dashboard';
  /** API / feature ready */
  enabled: boolean;
  /** Visible in Executive Mobile Mode (monitoring dashboards only) */
  showInExecutiveApp: boolean;
  /** License module key — when set, requires hasModule(licenseKey) */
  licenseKey?: string;
  phase?: string;
  accordionGroup?: 'crm' | 'projects' | 'accounts' | 'inventory' | 'hr' | 'sales' | 'rentals';
};

export const EXECUTIVE_MODULE_NAV: ExecutiveNavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: ICONS.home,
    summaryKey: 'dashboard',
    enabled: true,
    showInExecutiveApp: true,
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: ICONS.trendingUp,
    summaryKey: 'sales',
    enabled: true,
    showInExecutiveApp: true,
    licenseKey: 'real_estate',
    accordionGroup: 'sales',
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: ICONS.users,
    summaryKey: 'crm',
    enabled: true,
    showInExecutiveApp: false,
    licenseKey: 'real_estate',
    accordionGroup: 'crm',
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: ICONS.briefcase,
    summaryKey: 'projects',
    enabled: true,
    showInExecutiveApp: true,
    licenseKey: 'real_estate',
    accordionGroup: 'projects',
  },
  {
    id: 'construction',
    label: 'Construction',
    icon: ICONS.briefcase,
    summaryKey: 'construction',
    enabled: true,
    showInExecutiveApp: true,
    licenseKey: 'real_estate',
    accordionGroup: 'projects',
  },
  {
    id: 'propertySelling',
    label: 'Property Selling',
    icon: ICONS.building,
    summaryKey: 'propertySelling',
    enabled: true,
    showInExecutiveApp: true,
    licenseKey: 'real_estate',
    accordionGroup: 'sales',
  },
  {
    id: 'rentals',
    label: 'Rentals',
    icon: ICONS.building,
    summaryKey: 'rentals',
    enabled: true,
    showInExecutiveApp: true,
    licenseKey: 'rental',
    accordionGroup: 'rentals',
  },
  {
    id: 'finance',
    label: 'Accounts',
    icon: ICONS.dollarSign,
    summaryKey: 'finance',
    enabled: true,
    showInExecutiveApp: true,
    accordionGroup: 'accounts',
  },
  {
    id: 'hr',
    label: 'HR',
    icon: ICONS.users,
    summaryKey: 'hr',
    enabled: true,
    showInExecutiveApp: true,
    accordionGroup: 'hr',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: ICONS.package,
    summaryKey: 'inventory',
    enabled: false,
    showInExecutiveApp: false,
    phase: 'Coming soon',
    accordionGroup: 'inventory',
  },
  {
    id: 'approvals',
    label: 'Approvals',
    icon: ICONS.checkCircle,
    enabled: true,
    showInExecutiveApp: true,
  },
  {
    id: 'quickTransaction',
    label: 'Quick Capture',
    icon: ICONS.plus,
    enabled: true,
    showInExecutiveApp: true,
  },
  {
    id: 'notifications',
    label: 'Alerts',
    icon: ICONS.bell,
    enabled: true,
    showInExecutiveApp: true,
  },
];

export const EXECUTIVE_MODULE_LABELS: Record<ExecutiveModuleId, string> = {
  dashboard: 'Executive Dashboard',
  sales: 'Sales Dashboard',
  crm: 'CRM Dashboard',
  projects: 'Project Dashboard',
  construction: 'Construction Dashboard',
  propertySelling: 'Property Selling Dashboard',
  rentals: 'Rental Dashboard',
  finance: 'Accounts Dashboard',
  hr: 'HR Dashboard',
  inventory: 'Inventory Dashboard',
};

/** Accordion sections on the home dashboard */
export const EXECUTIVE_ACCORDION_SECTIONS = [
  { id: 'crm' as const, label: 'CRM', moduleId: 'crm' as ExecutiveModuleId },
  { id: 'projects' as const, label: 'Projects', moduleId: 'projects' as ExecutiveModuleId },
  { id: 'accounts' as const, label: 'Accounts', moduleId: 'finance' as ExecutiveModuleId },
  { id: 'hr' as const, label: 'HR', moduleId: 'hr' as ExecutiveModuleId },
];

export const EXECUTIVE_REPORT_LINKS = [
  { id: 'executive_summary' as const, label: 'Executive Summary', page: 'accounting' as const, tab: 'Profit & Loss' },
  { id: 'pl' as const, label: 'Profit & Loss', page: 'accounting' as const, tab: 'Profit & Loss' },
  { id: 'bs' as const, label: 'Balance Sheet', page: 'accounting' as const, tab: 'Balance Sheet' },
  { id: 'cf' as const, label: 'Cash Flow', page: 'accounting' as const, tab: 'Cash Flows' },
  { id: 'collections' as const, label: 'Collections', page: 'rentalManagement' as const, tab: 'Analytics' },
  { id: 'projects' as const, label: 'Project Reports', page: 'projectManagement' as const, tab: 'Reports' },
];

export type ExecutiveReportId = (typeof EXECUTIVE_REPORT_LINKS)[number]['id'];
