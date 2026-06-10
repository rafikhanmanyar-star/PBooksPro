/**
 * Context-aware module help — used by the header Help modal and Customer Success deep links.
 */

export type ModuleHelpSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  ordered?: string[];
};

export type ModuleHelpEntry = {
  id: string;
  title: string;
  /** Breadcrumb-style path shown in the help modal header */
  modulePath: string;
  summary: string;
  sections: ModuleHelpSection[];
  /** Knowledge base article id in shared/customerSuccess/customerSuccessContent.ts */
  knowledgeArticleId?: string;
  keywords: string[];
};

export const MODULE_HELP: Record<string, ModuleHelpEntry> = {
  dashboard: {
    id: 'dashboard',
    title: 'Dashboard',
    modulePath: 'Home → Dashboard',
    summary: 'Overview of financial KPIs, quick actions, and recent activity.',
    knowledgeArticleId: 'kb-dashboard',
    keywords: ['dashboard', 'kpi', 'overview'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'The Dashboard provides an overview of your financial KPIs and quick access to key features.',
        ],
      },
      {
        heading: 'Key features',
        bullets: [
          'KPI Cards — Total Balance, Accounts Receivable, Accounts Payable, Outstanding Loans, and more',
          'KPI Panel — Click the chart icon to customize visible KPIs and open reports',
          'Quick Actions — Create transactions, invoices, bills, or jump to modules',
          'Recent Transactions — Glance at latest ledger activity',
        ],
      },
      {
        heading: 'Navigation',
        paragraphs: [
          'Use the sidebar (desktop) or footer (mobile) to open Rental, Project Management, General Ledger, and other modules.',
        ],
      },
    ],
  },
  'general-ledger': {
    id: 'general-ledger',
    title: 'General Ledger',
    modulePath: 'Financials → Accounting',
    summary: 'Record and analyze all income, expense, transfer, and loan transactions.',
    knowledgeArticleId: 'kb-ledger',
    keywords: ['ledger', 'transactions', 'journal'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['The General Ledger records all financial transactions including income, expenses, transfers, and loans.'],
      },
      {
        heading: 'Key features',
        bullets: [
          'View modes — Switch between “This Month” and “All Time”',
          'Search — Find transactions by description, account, category, or contact',
          'Filters — Date range, account, category, project, contact, or transaction type',
          'Sort & export — Click column headers to sort; export to Excel',
          'Edit/delete — Click any row to update or remove an entry',
        ],
      },
      {
        heading: 'Transaction types',
        bullets: [
          'Income — Money received; increases account balance',
          'Expense — Money spent; decreases account balance',
          'Transfer — Move money between accounts',
          'Loan — Give, receive, repay, or collect loans',
        ],
      },
    ],
  },
  bills: {
    id: 'bills',
    title: 'Bill Management',
    modulePath: 'Financials → Bill Management',
    summary: 'Manage vendor bills, track payments, and monitor outstanding balances.',
    knowledgeArticleId: 'kb-project-bills',
    keywords: ['bills', 'vendor', 'payables'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Manage vendor bills, track payments, and monitor outstanding balances.'],
      },
      {
        heading: 'Key features',
        bullets: [
          'Tree view — Browse bills by project, building, or vendor',
          'Search & filters — Bill number, vendor, date range, status',
          'Status — Unpaid, Partially Paid, or Paid with running balance',
          'Payments — Record payments from the bill detail screen',
          'Export — Excel for reporting',
        ],
      },
      {
        heading: 'Workflow',
        ordered: [
          'Create a bill for a vendor',
          'Link to project or contract when applicable',
          'Record payments as they are made',
          'Track remaining balance until paid',
        ],
      },
    ],
  },
  'project-expenses': {
    id: 'project-expenses',
    title: 'Petty Cash',
    modulePath: 'Construction → Petty Cash',
    summary:
      'Record site expenses paid from bank or petty cash. Each entry posts immediately to the project and general ledger.',
    knowledgeArticleId: 'kb-project-expenses',
    keywords: ['project expenses', 'site expenses', 'voucher', 'petty cash', 'construction'],
    sections: [
      {
        heading: 'What this module does',
        paragraphs: [
          'Petty Cash is a fast data-entry grid for construction site spending. Every saved row creates a posted expense tied to a project, expense category, and bank or cash account.',
          'Amounts reduce the selected payment account and appear in project cost reports, PM fee calculations, and the General Ledger.',
        ],
      },
      {
        heading: 'Before you start',
        bullets: [
          'Projects — Create projects under Settings or Project Management setup',
          'Chart of Accounts — Add expense categories in Settings → Chart of Accounts',
          'Bank & cash accounts — Operating accounts used for site payments',
          'Vendors (optional) — Add suppliers in Contacts for vendor-level reporting',
        ],
      },
      {
        heading: 'Recording an expense',
        ordered: [
          'Use the blank row at the top of the table',
          'Enter date, project, category, amount, and bank/cash account',
          'Optionally pick a vendor and add a note',
          'Click Save — the entry posts immediately (no separate approval step in this view)',
        ],
      },
      {
        heading: 'Column guide',
        bullets: [
          'Date — Expense date (defaults to today)',
          'Project — Required; drives job costing',
          'Vendor — Optional; helps vendor ledger and expense-by-vendor reports',
          'Category — Expense category from Chart of Accounts; type a new name to add one inline',
          'Amount — Payment amount in your base currency',
          'Bank Account — Bank or cash account debited for the payment',
          'Note — Free-text description shown in reports and the ledger',
        ],
      },
      {
        heading: 'Tips & permissions',
        bullets: [
          'Filter by project when not inside a single-project context',
          'Delete removes the expense and reverses the ledger impact (requires create permission)',
          'Categories with no expense types show a warning — add categories in Settings → Chart of Accounts',
          'Related reports — Petty cash report under Construction → Reports',
        ],
      },
    ],
  },
  'project-bills': {
    id: 'project-bills',
    title: 'Project Bills',
    modulePath: 'Construction → Bills',
    summary: 'Vendor bills linked to construction projects with payment tracking.',
    knowledgeArticleId: 'kb-project-bills',
    keywords: ['project bills', 'vendor', 'construction'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Record and pay vendor bills against construction projects. Bills feed job costing and vendor ledgers.'],
      },
      {
        heading: 'Key features',
        bullets: [
          'Create bills with vendor, amount, category, and project',
          'Track Unpaid, Partially Paid, and Paid status',
          'Bulk payment for multiple bills at once',
          'Link bills to contracts for contract-based analysis',
        ],
      },
    ],
  },
  'project-management': {
    id: 'project-management',
    title: 'Project Management',
    modulePath: 'Construction → Project Management',
    summary: 'Construction projects — contracts, bills, site expenses, PM fees, and reports.',
    knowledgeArticleId: 'kb-project-bills',
    keywords: ['project', 'construction', 'costing'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Manage construction projects, vendor contracts, bills, site expenses, and financial reports.'],
      },
      {
        heading: 'Construction modules',
        bullets: [
          'Contracts — Vendor agreements and contract values',
          'Bills — Vendor invoices with payment tracking',
          'Expense Analytics — Visual breakdown of project spending',
          'Petty Cash — Fast grid for site expenses from bank/cash',
          'PM Fee Log — Project management fee accruals and payouts',
          'Reports — P&L, budget vs actual, vendor ledger, expense registers, and more',
        ],
      },
    ],
  },
  'project-selling': {
    id: 'project-selling',
    title: 'Project Selling',
    modulePath: 'Selling → Project Selling',
    summary: 'Unit sales, agreements, installments, invoices, and collections.',
    keywords: ['selling', 'agreements', 'installments'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Manage off-plan or unit sales with agreements, installment plans, and client invoicing.'],
      },
      {
        heading: 'Key modules',
        bullets: [
          'Marketing — Leads and sales pipeline',
          'Agreements — Client purchase agreements with installment schedules',
          'Invoices — Down payments and installment billing',
          'Collections Analytics — Receivables and collection performance',
          'Reports — Revenue, owner ledger, broker commissions, and unit status',
        ],
      },
    ],
  },
  'rental-management': {
    id: 'rental-management',
    title: 'Rental Management',
    modulePath: 'Rental → Rental Management',
    summary: 'Properties, tenants, invoices, owner payouts, and rental reports.',
    knowledgeArticleId: 'kb-rental-agreements',
    keywords: ['rental', 'tenant', 'property'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Manage rental properties, tenants, invoices, and owner payouts.'],
      },
      {
        heading: 'Key modules',
        bullets: [
          'Agreements — Tenant leases and rent terms',
          'Invoices — Rent billing and payment collection',
          'Bills & expenses — Property operating costs',
          'Payouts — Owner income distribution',
          'Reports — Building analysis, tenant ledger, security deposits, and more',
        ],
      },
    ],
  },
  loans: {
    id: 'loans',
    title: 'Loan Manager',
    modulePath: 'Financials → Loan Manager',
    summary: 'Track loans given to or received from contacts.',
    keywords: ['loans', 'lending', 'borrowing'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Track loans given to or received from contacts, including repayments and balances.'],
      },
      {
        heading: 'Key features',
        bullets: [
          'Loan summary by contact',
          'Full transaction history per loan',
          'Search by contact name',
          'Export loan statements to Excel',
        ],
      },
    ],
  },
  contacts: {
    id: 'contacts',
    title: 'Contacts',
    modulePath: 'People → Contacts',
    summary: 'Tenants, owners, vendors, staff, brokers, and clients.',
    keywords: ['contacts', 'tenants', 'vendors'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Manage all contacts including tenants, owners, vendors, staff, and brokers.'],
      },
      {
        heading: 'Key features',
        bullets: [
          'Organize by contact type',
          'Search by name',
          'Open a contact ledger for transaction history',
          'Filter tabs by type',
        ],
      },
    ],
  },
  'vendor-directory': {
    id: 'vendor-directory',
    title: 'Vendor Directory',
    modulePath: 'People → Vendor Directory',
    summary: 'Vendor profiles, quotations, bills, and payment history.',
    keywords: ['vendor', 'supplier', 'directory'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Manage vendor information, quotations, bills, and payments.'],
      },
      {
        heading: 'Key features',
        bullets: [
          'Create vendor/supplier profiles',
          'Search by name',
          'View quotations, bills, and payment history per vendor',
        ],
      },
    ],
  },
  settings: {
    id: 'settings',
    title: 'Configuration',
    modulePath: 'System → Configuration',
    summary: 'Accounts, categories, users, backups, and application preferences.',
    keywords: ['settings', 'configuration', 'setup'],
    sections: [
      {
        heading: 'Overview',
        paragraphs: ['Configure accounts, categories, contacts, projects, and application settings.'],
      },
      {
        heading: 'Key sections',
        bullets: [
          'Chart of Accounts — Bank, cash, income, and expense categories',
          'Customer Success — Full guides, tours, and support',
          'Data Management — Export, import, and maintenance',
          'Backup Center — Scheduled database backups',
        ],
      },
    ],
  },
  general: {
    id: 'general',
    title: 'Help',
    modulePath: 'PBooks Pro',
    summary: 'Context-sensitive help for the module you are viewing.',
    keywords: ['help', 'support'],
    sections: [
      {
        heading: 'Quick tips',
        bullets: [
          'Press Ctrl+K (Cmd+K on Mac) to search pages, reports, and records',
          'Use the sidebar to switch modules; sub-menus appear inside Rental, Projects, and Accounting',
          'Open Configuration → Customer Success for guides, tours, and support tickets',
        ],
      },
    ],
  },
};

export function getModuleHelp(contextKey: string): ModuleHelpEntry {
  return MODULE_HELP[contextKey] ?? MODULE_HELP.general;
}

export type HelpDeepLink = {
  section: 'knowledge-base';
  articleId: string;
};

export function getHelpDeepLink(entry: ModuleHelpEntry): HelpDeepLink | null {
  if (!entry.knowledgeArticleId) return null;
  return { section: 'knowledge-base', articleId: entry.knowledgeArticleId };
}

export const OPEN_HELP_ARTICLE_KEY = 'openHelpArticle';
export const OPEN_SETTINGS_CATEGORY_KEY = 'openSettingsCategory';

export function storeHelpDeepLink(link: HelpDeepLink): void {
  sessionStorage.setItem(OPEN_SETTINGS_CATEGORY_KEY, 'help');
  sessionStorage.setItem(OPEN_HELP_ARTICLE_KEY, JSON.stringify(link));
}

export function consumeHelpDeepLink(): HelpDeepLink | null {
  const raw = sessionStorage.getItem(OPEN_HELP_ARTICLE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(OPEN_HELP_ARTICLE_KEY);
  try {
    const parsed = JSON.parse(raw) as HelpDeepLink;
    if (parsed?.section === 'knowledge-base' && typeof parsed.articleId === 'string') {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}
