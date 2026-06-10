import type { Page } from '../../types';

const PROJECT_CONSTRUCTION_VIEW_MAP: Record<string, string> = {
  Contracts: 'project-management',
  Bills: 'project-bills',
  'Expense Analytics': 'project-management',
  'Expense Vouchers': 'project-expenses',
  'PM Payouts': 'project-management',
  'Project Expense Reports': 'project-expenses',
};

const PROJECT_SELLING_VIEW_MAP: Record<string, string> = {
  Marketing: 'project-selling',
  Agreements: 'project-selling',
  Invoices: 'project-selling',
  'Collections Analytics': 'project-selling',
  Assets: 'project-selling',
  'Sales Returns': 'project-selling',
};

function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseStoredView(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return raw;
  }
}

/**
 * Resolve the active module help key from the current page and optional sub-view (localStorage).
 */
export function resolveModuleHelpContext(page: Page, initialTabs?: string[]): string {
  if (initialTabs && initialTabs.length > 0) {
    const subTab = initialTabs[initialTabs.length - 1];
    if (page === 'projectManagement' || page === 'bills') {
      const mapped = PROJECT_CONSTRUCTION_VIEW_MAP[subTab];
      if (mapped) return mapped;
    }
    if (page === 'projectSelling' || page === 'projectInvoices') {
      const mapped = PROJECT_SELLING_VIEW_MAP[subTab];
      if (mapped) return mapped;
    }
  }

  switch (page) {
    case 'dashboard':
      return 'dashboard';
    case 'transactions':
      return 'general-ledger';
    case 'bills':
      return parseStoredView(readLocalStorage('projectManagement_activeView')) === 'Expense Vouchers'
        ? 'project-expenses'
        : 'project-bills';
    case 'loans':
      return 'loans';
    case 'rentalManagement':
    case 'rentalSettings':
    case 'rentalInvoices':
    case 'rentalAgreements':
    case 'ownerPayouts':
      return 'rental-management';
    case 'projectManagement': {
      const view = parseStoredView(readLocalStorage('projectManagement_activeView'));
      return (view && PROJECT_CONSTRUCTION_VIEW_MAP[view]) || 'project-management';
    }
    case 'projectSelling':
    case 'projectInvoices': {
      const view = parseStoredView(readLocalStorage('projectSelling_activeView'));
      return (view && PROJECT_SELLING_VIEW_MAP[view]) || 'project-selling';
    }
    case 'vendorDirectory':
      return 'vendor-directory';
    case 'contacts':
      return 'contacts';
    case 'settings':
      return 'settings';
    default:
      return 'general';
  }
}
