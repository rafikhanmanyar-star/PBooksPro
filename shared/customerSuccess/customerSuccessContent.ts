/**
 * Customer Success Center — searchable content catalog.
 */

export type SuccessSectionId =
  | 'getting-started'
  | 'video-tutorials'
  | 'knowledge-base'
  | 'product-updates'
  | 'feature-requests'
  | 'training-resources'
  | 'community-links'
  | 'contact-support';

export type SuccessSection = {
  id: SuccessSectionId;
  label: string;
  description: string;
  icon: 'rocket' | 'play' | 'book' | 'sparkles' | 'lightbulb' | 'graduation' | 'users' | 'headphones';
};

export const SUCCESS_SECTIONS: SuccessSection[] = [
  { id: 'getting-started', label: 'Getting Started', description: 'Quick wins for your first week', icon: 'rocket' },
  { id: 'video-tutorials', label: 'Video Tutorials', description: 'Watch and learn at your pace', icon: 'play' },
  { id: 'knowledge-base', label: 'Knowledge Base', description: 'In-depth guides by module', icon: 'book' },
  { id: 'product-updates', label: 'Product Updates', description: 'Release notes and improvements', icon: 'sparkles' },
  { id: 'feature-requests', label: 'Feature Requests', description: 'Tell us what to build next', icon: 'lightbulb' },
  { id: 'training-resources', label: 'Training Resources', description: 'Webinars, checklists, and docs', icon: 'graduation' },
  { id: 'community-links', label: 'Community Links', description: 'Connect with peers and updates', icon: 'users' },
  { id: 'contact-support', label: 'Contact Support', description: 'Reach our customer success team', icon: 'headphones' },
];

export type GettingStartedStep = {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
  settingsTab?: string;
  tags: string[];
};

export const GETTING_STARTED_STEPS: GettingStartedStep[] = [
  {
    id: 'setup-wizard',
    title: 'Complete the setup wizard',
    description: 'Walk through company profile, chart of accounts, and module configuration.',
    actionLabel: 'Open Setup Wizard',
    settingsTab: 'setup-wizard',
    tags: ['onboarding', 'wizard', 'setup'],
  },
  {
    id: 'accounts',
    title: 'Create bank & cash accounts',
    description: 'Add your operating accounts so transactions update balances automatically.',
    actionLabel: 'Chart of Accounts',
    settingsTab: 'accounts',
    tags: ['accounts', 'bank', 'cash'],
  },
  {
    id: 'categories',
    title: 'Configure income & expense categories',
    description: 'Organize transactions for accurate P&L and budget reporting.',
    tags: ['categories', 'chart'],
  },
  {
    id: 'contacts',
    title: 'Add tenants, vendors & owners',
    description: 'Contacts power invoices, agreements, ledgers, and payouts.',
    actionLabel: 'Manage Contacts',
    settingsTab: 'contacts',
    tags: ['contacts', 'tenants', 'vendors'],
  },
  {
    id: 'rental-setup',
    title: 'Set up rental properties',
    description: 'Create buildings, units, and your first rental agreement.',
    tags: ['rental', 'property', 'agreements'],
  },
  {
    id: 'first-transaction',
    title: 'Record your first transaction',
    description: 'Post an income or expense in the General Ledger to validate your chart.',
    tags: ['ledger', 'transactions', 'journal'],
  },
  {
    id: 'product-tours',
    title: 'Take a guided product tour',
    description: 'Interactive walkthroughs highlight key controls in each module.',
    tags: ['tour', 'walkthrough', 'demo'],
  },
  {
    id: 'backup',
    title: 'Schedule your first backup',
    description: 'Protect financial data with automated PostgreSQL backups.',
    actionLabel: 'Backup Center',
    settingsTab: 'backup',
    tags: ['backup', 'security', 'restore'],
  },
];

export type VideoTutorial = {
  id: string;
  title: string;
  description: string;
  duration: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  module: string;
  url?: string;
  tags: string[];
};

export const VIDEO_TUTORIALS: VideoTutorial[] = [
  {
    id: 'vid-overview',
    title: 'PBooks Pro platform overview',
    description: 'Dashboard, rental, construction, ledger, and reporting in one tour.',
    duration: '12 min',
    level: 'Beginner',
    module: 'Overview',
    url: 'https://www.pbookspro.com/demo.html',
    tags: ['overview', 'dashboard', 'intro'],
  },
  {
    id: 'vid-rental',
    title: 'Rental agreements & invoicing',
    description: 'Create agreements, auto-generate invoices, and collect rent.',
    duration: '18 min',
    level: 'Beginner',
    module: 'Rental',
    tags: ['rental', 'invoice', 'tenant'],
  },
  {
    id: 'vid-ledger',
    title: 'General ledger & double-entry',
    description: 'Income, expenses, transfers, filters, and reconciliation.',
    duration: '15 min',
    level: 'Intermediate',
    module: 'Finance',
    tags: ['ledger', 'transactions', 'accounting'],
  },
  {
    id: 'vid-projects',
    title: 'Construction project costing',
    description: 'Bills, contracts, installments, and job profitability.',
    duration: '20 min',
    level: 'Intermediate',
    module: 'Projects',
    tags: ['construction', 'bills', 'costing'],
  },
  {
    id: 'vid-reports',
    title: 'Financial reports deep dive',
    description: 'Trial balance, P&L, balance sheet, and rental dashboards.',
    duration: '16 min',
    level: 'Advanced',
    module: 'Reports',
    tags: ['reports', 'trial balance', 'analytics'],
  },
  {
    id: 'vid-payroll',
    title: 'Payroll runs & allocations',
    description: 'Staff setup, salary runs, and project cost allocation.',
    duration: '14 min',
    level: 'Intermediate',
    module: 'Payroll',
    tags: ['payroll', 'salary', 'hr'],
  },
];

export type KnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  body: string;
  tags: string[];
};

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: 'kb-ledger',
    title: 'General Ledger & Transactions',
    category: 'Finance',
    excerpt: 'Record income, expenses, transfers, and journal entries with filters and exports.',
    body: 'The General Ledger is your source of truth. Use New Transaction to post income or expenses, link entries to projects, properties, or contacts, and filter by date, account, or category. Transfer transactions move funds between accounts. Toggle system transactions to view auto-generated invoice payments.',
    tags: ['ledger', 'transactions', 'journal', 'filter'],
  },
  {
    id: 'kb-dashboard',
    title: 'Dashboard & KPIs',
    category: 'Getting Started',
    excerpt: 'Customize KPI cards, quick actions, and drill into financial metrics.',
    body: 'The Dashboard surfaces Total Balance, receivables, payables, and other KPIs. Open the KPI panel from the chart icon to add category-based metrics and launch reports. Quick action buttons create transactions, invoices, and bills without leaving the home screen.',
    tags: ['dashboard', 'kpi', 'metrics', 'overview'],
  },
  {
    id: 'kb-rental-agreements',
    title: 'Rental Agreements & Invoicing',
    category: 'Rental',
    excerpt: 'Tenant leases, recurring rent, security deposits, and payment tracking.',
    body: 'Create agreements from Rental Management → Agreements. The system generates initial invoices and recurring rent templates. Record payments from the invoice screen; partial payments are supported. Owner payouts calculate collected rent minus deductions.',
    tags: ['rental', 'agreement', 'invoice', 'tenant'],
  },
  {
    id: 'kb-owner-payouts',
    title: 'Owner Payouts & Income Distribution',
    category: 'Rental',
    excerpt: 'Calculate and distribute rental income to property owners.',
    body: 'Assign owners to properties, track collected rent and service charges, deduct expenses, and create payout transactions. Use Owner Rental Income and Security Deposit reports for period-end reconciliation.',
    tags: ['owner', 'payout', 'distribution'],
  },
  {
    id: 'kb-project-bills',
    title: 'Project Bills & Vendor Payments',
    category: 'Projects',
    excerpt: 'Vendor bills, bulk payments, and job cost tracking.',
    body: 'Record bills against projects and categories from Project Management → Bills. Link bills to contracts for vendor analysis. Bulk payment processes multiple bills in one transaction.',
    tags: ['bills', 'vendor', 'construction'],
  },
  {
    id: 'kb-project-expenses',
    title: 'Project Expenses (Site Expenses)',
    category: 'Projects',
    excerpt: 'Fast grid entry for construction site expenses paid from bank or petty cash.',
    body: 'Project Expenses records site spending that posts immediately to the project and general ledger. Each row needs a date, project, expense category (from Settings → Chart of Accounts), amount, and bank or cash account. Optionally link a vendor and note for reporting. Saved entries reduce the payment account balance and feed project cost reports, PM fee calculations, and expense registers under Construction → Reports. Add expense categories in Settings before first use, or type a new category name in the grid to create one inline. Delete reverses the ledger entry when you have create permission.',
    tags: ['project expenses', 'site expenses', 'voucher', 'construction', 'petty cash'],
  },
  {
    id: 'kb-reports',
    title: 'Reports & Analytics',
    category: 'Reports',
    excerpt: '30+ real-estate reports including trial balance, P&L, and rental dashboards.',
    body: 'Access reports from module sidebars or the KPI panel. Export most reports to Excel or PDF. Filter by date range, project, building, or owner for tailored analysis.',
    tags: ['reports', 'analytics', 'export'],
  },
  {
    id: 'kb-backup',
    title: 'Backup & Data Security',
    category: 'Admin',
    excerpt: 'Scheduled backups, restore procedures, and data protection.',
    body: 'Use Settings → Backup Center to schedule PostgreSQL backups and store off-site copies. Test restores periodically. Enterprise audit trail captures sensitive changes for compliance.',
    tags: ['backup', 'restore', 'security'],
  },
  {
    id: 'kb-import',
    title: 'Importing Existing Data',
    category: 'Getting Started',
    excerpt: 'Excel templates for contacts, opening balances, and transactions.',
    body: 'Open Data Management → Import to upload Excel files. Map columns in the wizard, review validation errors, and import in batches. Always back up before large imports.',
    tags: ['import', 'excel', 'migration'],
  },
  {
    id: 'kb-budgets',
    title: 'Budget Planner',
    category: 'Finance',
    excerpt: 'Set annual budgets by category and track variance.',
    body: 'Budget Planner lets you set monthly or annual targets per category. Dashboard and budget reports compare actual ledger activity against planned amounts.',
    tags: ['budget', 'planning', 'variance'],
  },
  {
    id: 'kb-payroll',
    title: 'Payroll System',
    category: 'Payroll',
    excerpt: 'Employees, salary runs, deductions, and project allocations.',
    body: 'Configure departments and grades in Payroll settings. Run monthly salary creation, approve payslips, and post payments to the ledger. Payroll transactions can allocate costs to projects.',
    tags: ['payroll', 'salary', 'staff'],
  },
  {
    id: 'kb-mfa',
    title: 'Two-Factor Authentication',
    category: 'Security',
    excerpt: 'Protect admin accounts with TOTP authenticator apps.',
    body: 'Enable MFA under Settings → Two-Factor Auth. Admins are required in production. Save backup codes in a secure location — they are shown only once at setup.',
    tags: ['mfa', 'security', '2fa'],
  },
];

export type ProductUpdate = {
  id: string;
  version: string;
  date: string;
  title: string;
  highlights: string[];
  tags: string[];
};

export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: 'upd-referrals',
    version: '1.2.297',
    date: '2026-06-07',
    title: 'Referral program & customer success',
    highlights: [
      'Referral codes, invitations, and reward tracking',
      'Customer Success Center with global search',
      'Guided product tours across all modules',
    ],
    tags: ['referral', 'success', 'tours'],
  },
  {
    id: 'upd-onboarding',
    version: '1.2.290',
    date: '2026-05-15',
    title: 'Professional onboarding wizard',
    highlights: [
      '9-step setup wizard with save & resume',
      'Admin onboarding dashboard',
      'Progress tracker in Settings',
    ],
    tags: ['onboarding', 'wizard'],
  },
  {
    id: 'upd-billing',
    version: '1.2.280',
    date: '2026-04-20',
    title: 'Paddle billing & subscription lifecycle',
    highlights: [
      'Grace period and past-due handling',
      'Customer billing portal',
      'Super-admin subscription dashboard',
    ],
    tags: ['billing', 'paddle', 'subscription'],
  },
  {
    id: 'upd-enterprise',
    version: '1.2.260',
    date: '2026-03-01',
    title: 'Enterprise audit & fiscal periods',
    highlights: [
      'Accounting period close controls',
      'Enterprise audit trail viewer',
      'RBAC permission matrix',
    ],
    tags: ['audit', 'enterprise', 'rbac'],
  },
];

export type TrainingResource = {
  id: string;
  title: string;
  type: 'Webinar' | 'Video' | 'Guide' | 'Checklist' | 'Docs';
  duration: string;
  description: string;
  url: string;
  tags: string[];
};

export const TRAINING_RESOURCES: TrainingResource[] = [
  {
    id: 'tr-onboarding',
    title: 'Live onboarding session',
    type: 'Webinar',
    duration: '60 min',
    description: 'Walkthrough of property setup, chart of accounts, and daily workflows with our team.',
    url: 'https://www.pbookspro.com/demo.html',
    tags: ['onboarding', 'live', 'webinar'],
  },
  {
    id: 'tr-checklist',
    title: 'Property accounting checklist',
    type: 'Checklist',
    duration: 'PDF',
    description: 'Step-by-step checklist for rental operations and month-end close.',
    url: 'https://www.pbookspro.com/assets/checklists/property-management-accounting-checklist.html',
    tags: ['checklist', 'rental', 'accounting'],
  },
  {
    id: 'tr-help',
    title: 'Website documentation',
    type: 'Docs',
    duration: 'Reference',
    description: 'Full public help guide covering every module.',
    url: 'https://www.pbookspro.com/help.html',
    tags: ['documentation', 'help'],
  },
  {
    id: 'tr-blog',
    title: 'Best practices blog',
    type: 'Guide',
    duration: 'Articles',
    description: 'Real estate finance tips, reporting guides, and product news.',
    url: 'https://www.pbookspro.com/blog.html',
    tags: ['blog', 'best practices'],
  },
  {
    id: 'tr-pricing',
    title: 'Plan comparison guide',
    type: 'Guide',
    duration: '5 min read',
    description: 'Understand Starter, Professional, and Enterprise capabilities.',
    url: 'https://www.pbookspro.com/pricing.html',
    tags: ['pricing', 'plans'],
  },
];

export type CommunityLink = {
  id: string;
  title: string;
  description: string;
  url: string;
  platform: string;
  tags: string[];
};

export const COMMUNITY_LINKS: CommunityLink[] = [
  {
    id: 'com-website',
    title: 'PBooks Pro website',
    description: 'Product pages, pricing, and live demo.',
    url: 'https://www.pbookspro.com',
    platform: 'Website',
    tags: ['website', 'demo'],
  },
  {
    id: 'com-blog',
    title: 'Product blog',
    description: 'Release highlights and property finance insights.',
    url: 'https://www.pbookspro.com/blog.html',
    platform: 'Blog',
    tags: ['blog', 'news'],
  },
  {
    id: 'com-support',
    title: 'Public support center',
    description: 'Knowledge base and ticket submission for website visitors.',
    url: 'https://www.pbookspro.com/support.html',
    platform: 'Support',
    tags: ['support', 'help'],
  },
  {
    id: 'com-whatsapp',
    title: 'WhatsApp support',
    description: 'Chat with our team during business hours (PKT).',
    url: 'https://wa.me/923175505575?text=Hello%21%20I%20need%20help%20with%20PBooksPro.',
    platform: 'WhatsApp',
    tags: ['whatsapp', 'chat'],
  },
  {
    id: 'com-linkedin',
    title: 'LinkedIn updates',
    description: 'Follow product announcements and customer stories.',
    url: 'https://www.linkedin.com/company/pbookspro',
    platform: 'LinkedIn',
    tags: ['linkedin', 'social'],
  },
];

export const SUPPORT_CONTACT = {
  email: 'support@pbookspro.com',
  salesEmail: 'sales@pbookspro.com',
  whatsappUrl: 'https://wa.me/923175505575?text=Hello%21%20I%20need%20help%20with%20PBooksPro.',
  hours: 'Mon–Fri, 9:00 AM – 6:00 PM PKT',
};

export type SearchResultItem = {
  id: string;
  sectionId: SuccessSectionId;
  title: string;
  excerpt: string;
  tags: string[];
};

export function buildSearchIndex(): SearchResultItem[] {
  const items: SearchResultItem[] = [];

  GETTING_STARTED_STEPS.forEach((s) =>
    items.push({ id: s.id, sectionId: 'getting-started', title: s.title, excerpt: s.description, tags: s.tags })
  );
  VIDEO_TUTORIALS.forEach((v) =>
    items.push({ id: v.id, sectionId: 'video-tutorials', title: v.title, excerpt: v.description, tags: [...v.tags, v.module] })
  );
  KNOWLEDGE_ARTICLES.forEach((a) =>
    items.push({ id: a.id, sectionId: 'knowledge-base', title: a.title, excerpt: a.excerpt, tags: [...a.tags, a.category] })
  );
  PRODUCT_UPDATES.forEach((u) =>
    items.push({
      id: u.id,
      sectionId: 'product-updates',
      title: `${u.version} — ${u.title}`,
      excerpt: u.highlights.join(' '),
      tags: [...u.tags, u.version],
    })
  );
  TRAINING_RESOURCES.forEach((t) =>
    items.push({ id: t.id, sectionId: 'training-resources', title: t.title, excerpt: t.description, tags: [...t.tags, t.type] })
  );
  COMMUNITY_LINKS.forEach((c) =>
    items.push({ id: c.id, sectionId: 'community-links', title: c.title, excerpt: c.description, tags: [...c.tags, c.platform] })
  );

  return items;
}

export function matchesSearch(query: string, fields: string[]): boolean {
  if (!query.trim()) return true;
  const haystack = fields.join(' ').toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}
