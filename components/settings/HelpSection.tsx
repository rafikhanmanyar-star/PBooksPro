
import React, { useState, useMemo } from 'react';
import { ICONS } from '../../constants';
import Input from '../ui/Input';
import packageJson from '../../package.json';

// --- MOCK UI ENGINE (For Generating "Screenshots") ---

const MockWindow: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <div className={`bg-slate-50 border-2 border-slate-300 rounded-xl overflow-hidden shadow-sm select-none relative ${className}`}>
        <div className="bg-white border-b border-slate-200 px-3 py-2 flex justify-between items-center">
            <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                <div className="w-2 h-2 rounded-full bg-slate-300"></div>
            </div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</div>
            <div className="w-4"></div>
        </div>
        <div className="p-3 relative">
            {children}
        </div>
    </div>
);

const MockButton: React.FC<{ label: string; variant?: 'primary' | 'secondary' | 'danger' | 'floating'; icon?: React.ReactNode; className?: string }> = ({ label, variant = 'primary', icon, className = '' }) => {
    const base = "flex items-center justify-center gap-1 rounded shadow-sm text-[10px] font-semibold transition-transform";
    const variants = {
        primary: "bg-indigo-600 text-white px-3 py-1.5",
        secondary: "bg-white border border-slate-300 text-slate-700 px-3 py-1.5",
        danger: "bg-rose-600 text-white px-3 py-1.5",
        floating: "w-8 h-8 rounded-full bg-indigo-600 text-white shadow-lg"
    };
    return <div className={`${base} ${variants[variant]} ${className}`}>{icon}{label}</div>;
};

// --- DATA STRUCTURE ---

type HelpCategory = 'Getting Started' | 'General Finance' | 'Rental Management' | 'Project Management' | 'Payroll' | 'Advanced Tools';

interface HelpTopic {
    id: string;
    title: string;
    category: HelpCategory;
    keywords: string[];
    content: React.ReactNode;
    visual: React.ReactNode;
}

// Get app version from package.json
const APP_VERSION = packageJson.version;
const APP_NAME = 'PBooks Pro';

const HELP_TOPICS: HelpTopic[] = [
    // --- Getting Started ---
    {
        id: 'about-app',
        title: `About ${APP_NAME}`,
        category: 'Getting Started',
        keywords: ['about', 'version', 'info', 'description', 'purpose', 'overview'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p><strong>{APP_NAME}</strong> is a comprehensive financial management system tailored for real estate professionals, project developers, and small business owners. It unifies multiple financial domains into a single, intuitive interface.</p>
                <p>Key capabilities include:</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>General Ledger:</strong> Robust tracking of income, expenses, assets, and liabilities with double-entry principles.</li>
                    <li><strong>Rental Management:</strong> End-to-end workflow from tenant agreements to automated invoicing and owner payouts.</li>
                    <li><strong>Project Management:</strong> Advanced costing for construction projects, including installment plans and investor equity tracking.</li>
                    <li><strong>Payroll:</strong> Integrated staff management and salary processing with multi-project allocation.</li>
                    <li><strong>Reports & Analytics:</strong> Comprehensive reporting and KPI dashboard for real-time insights.</li>
                </ul>
                <p className="text-xs text-slate-400 mt-4 border-t pt-2">Version {APP_VERSION}</p>
            </div>
        ),
        visual: (
            <MockWindow title="About">
                <div className="flex flex-col items-center justify-center h-32 text-center bg-slate-50/50">
                    <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-2xl font-bold mb-2 shadow-lg transform -rotate-3">
                        PBP
                    </div>
                    <div className="font-bold text-slate-800 text-sm">{APP_NAME}</div>
                    <div className="text-[9px] text-slate-500 font-mono bg-slate-200 px-2 py-0.5 rounded mt-1">v{APP_VERSION}</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'navigation-basics',
        title: 'Navigation & Interface',
        category: 'Getting Started',
        keywords: ['navigation', 'sidebar', 'menu', 'interface', 'layout', 'tabs'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Learn how to navigate the application efficiently.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Sidebar:</strong> Desktop navigation is on the left. Click any module to switch pages.</li>
                    <li><strong>Mobile Footer:</strong> On mobile devices, use the bottom navigation bar for quick access.</li>
                    <li><strong>Header:</strong> Shows current page title and search functionality. User info displayed in sidebar.</li>
                    <li><strong>KPI Panel:</strong> Click the chart icon to open the right panel for KPIs, Reports, and Shortcuts.</li>
                    <li><strong>Multi-tab Modules:</strong> Rental and Project Management use tabs for Invoices, Agreements, Reports, etc.</li>
                    <li><strong>Search:</strong> Most pages have search/filter capabilities to quickly find records.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Navigation">
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <MockButton label="Dashboard" variant="primary" className="flex-1" />
                        <MockButton label="Rental" variant="secondary" className="flex-1" />
                        <MockButton label="Project" variant="secondary" className="flex-1" />
                    </div>
                    <div className="text-[9px] text-slate-500 text-center">Sidebar Navigation</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'initial-setup',
        title: 'Initial Setup Guide',
        category: 'Getting Started',
        keywords: ['setup', 'initialize', 'first time', 'configuration', 'accounts', 'categories'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Follow these steps to get started:</p>
                <ol className="list-decimal list-inside space-y-2 pl-2">
                    <li><strong>Login:</strong> Use your credentials. Contact admin if you need an account.</li>
                    <li><strong>Create Accounts:</strong> Go to Settings &gt; Accounts. Add your Bank, Cash, and Credit Card accounts.</li>
                    <li><strong>Setup Categories:</strong> Settings &gt; Categories. Create Income and Expense categories (e.g., "Rental Income", "Salaries", "Office Supplies").</li>
                    <li><strong>Add Contacts:</strong> Contacts page. Add Tenants, Vendors, Staff, and other parties.</li>
                    <li><strong>Configure Print Settings:</strong> Settings &gt; Print Settings. Add your company name, logo, and address for invoices.</li>
                    <li><strong>Setup Properties/Projects:</strong> In Rental Management, add Buildings and Properties. In Project Management, create Projects and Units.</li>
                </ol>
            </div>
        ),
        visual: (
            <MockWindow title="Setup Checklist">
                <div className="space-y-1 text-[10px]">
                    <div className="flex items-center gap-2"><span>✓</span> <span>Create Accounts</span></div>
                    <div className="flex items-center gap-2"><span>✓</span> <span>Setup Categories</span></div>
                    <div className="flex items-center gap-2"><span>✓</span> <span>Add Contacts</span></div>
                    <div className="flex items-center gap-2"><span>○</span> <span>Print Settings</span></div>
                    <div className="flex items-center gap-2"><span>○</span> <span>Properties/Projects</span></div>
                </div>
            </MockWindow>
        )
    },

    // --- General Finance ---
    {
        id: 'general-ledger',
        title: 'General Ledger & Transactions',
        category: 'General Finance',
        keywords: ['transactions', 'ledger', 'income', 'expense', 'double entry', 'journal'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>The General Ledger is the core of your financial tracking. It records all income and expense transactions.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Recording Transactions:</strong> Click "New Transaction" and select Income or Expense. Choose account, category, date, amount, and description.</li>
                    <li><strong>Linking to Entities:</strong> Transactions can be linked to Projects, Properties, Contacts (vendors/tenants), Bills, Invoices, or Payslips for detailed tracking.</li>
                    <li><strong>Account Impact:</strong> Income increases account balance; Expense decreases it. The system automatically updates account balances.</li>
                    <li><strong>Transfer Transactions:</strong> Use Transfer type to move money between accounts (e.g., Bank to Cash).</li>
                    <li><strong>System Transactions:</strong> Some transactions are auto-generated (like invoice payments). Toggle "Show System Transactions" to view/hide them.</li>
                    <li><strong>Filtering:</strong> Filter by date range, account, category, project, or contact. Export to Excel for analysis.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Transaction Form">
                <div className="space-y-2">
                    <MockButton label="Income" variant="primary" className="w-full" />
                    <MockButton label="Expense" variant="secondary" className="w-full" />
                    <div className="text-[9px] text-slate-500 text-center">Transaction Types</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'accounts-management',
        title: 'Accounts Management',
        category: 'General Finance',
        keywords: ['accounts', 'bank', 'cash', 'credit card', 'balance', 'account types'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Accounts represent your financial institutions and cash sources.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Account Types:</strong> Bank (checking/savings), Cash, Credit Card, Equity, Liability, Asset. Only Bank accounts affect Total Balance KPI.</li>
                    <li><strong>Creating Accounts:</strong> Settings &gt; Accounts &gt; Add Account. Enter name, type, and initial balance.</li>
                    <li><strong>Balance Tracking:</strong> Balances update automatically when transactions are recorded. Manually adjust if needed via "Adjust Balance".</li>
                    <li><strong>Internal Clearing:</strong> Special system account used for internal transfers. Not included in Total Balance calculations.</li>
                    <li><strong>Account Reports:</strong> View account statements and transaction history from the General Ledger page.</li>
                    <li><strong>Multiple Accounts:</strong> Track multiple banks, cash registers, or credit cards separately for better organization.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Accounts">
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>Bank Account 1</span><span className="font-bold">$10,000</span></div>
                    <div className="flex justify-between"><span>Cash</span><span className="font-bold">$500</span></div>
                    <div className="flex justify-between border-t pt-1"><span>Total</span><span className="font-bold">$10,500</span></div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'categories-budget',
        title: 'Categories & Budget Planning',
        category: 'General Finance',
        keywords: ['categories', 'budget', 'planning', 'income', 'expense', 'classification'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Categories organize transactions, and budgets help plan and track spending.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Creating Categories:</strong> Settings &gt; Categories. Categories must be Income or Expense type. Common examples: "Rental Income", "Salaries", "Office Rent".</li>
                    <li><strong>Special Categories:</strong> System uses categories like "Rental Income" for auto-categorization. Keep these for proper reporting.</li>
                    <li><strong>Budget Planning:</strong> Budget Planner page lets you set monthly/annual budgets per category. Track actual vs. budgeted amounts.</li>
                    <li><strong>Budget Reports:</strong> Dashboard shows budget status. Reports show variance (over/under budget).</li>
                    <li><strong>Category KPIs:</strong> Each category appears as a KPI in the dashboard panel for quick insights.</li>
                    <li><strong>Editing Categories:</strong> Rename or change category types, but be careful - existing transactions keep old category references.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Categories">
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>Rental Income</span><span className="text-green-600">Income</span></div>
                    <div className="flex justify-between"><span>Salaries</span><span className="text-red-600">Expense</span></div>
                    <div className="flex justify-between"><span>Office Supplies</span><span className="text-red-600">Expense</span></div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'loans-management',
        title: 'Loan Management',
        category: 'General Finance',
        keywords: ['loans', 'borrowing', 'lending', 'principal', 'interest', 'repayment'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Track loans you've given or received with detailed repayment tracking.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Creating Loans:</strong> Loan Manager page. Click "New Loan" and select "Given" (you lent) or "Received" (you borrowed).</li>
                    <li><strong>Loan Details:</strong> Enter principal amount, interest rate, start date, term, and frequency (Monthly, Quarterly, etc.).</li>
                    <li><strong>Repayment Tracking:</strong> Record repayments as transactions linked to the loan. System calculates outstanding balance automatically.</li>
                    <li><strong>Loan Status:</strong> View active, completed, and overdue loans. Filter by lender/borrower contact.</li>
                    <li><strong>Auto-categorization:</strong> Loan repayments can auto-link to appropriate categories (e.g., "Loan Interest Expense").</li>
                    <li><strong>Reports:</strong> View loan summaries, repayment schedules, and outstanding amounts in the Loan Manager.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Loan Manager">
                <div className="space-y-2">
                    <MockButton label="New Loan" variant="primary" className="w-full" />
                    <div className="text-[9px] text-slate-500 text-center">Track Borrowing & Lending</div>
                </div>
            </MockWindow>
        )
    },

    // --- Rental Management ---
    {
        id: 'rental-agreements',
        title: 'Rental Agreements',
        category: 'Rental Management',
        keywords: ['rental', 'agreement', 'lease', 'tenant', 'property', 'rent', 'deposit'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Manage tenant leases with automated invoicing and payment tracking.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Creating Agreements:</strong> Rental Management &gt; Agreements tab &gt; New Agreement. Select tenant, property/unit, set rent amount, start/end dates, and security deposit.</li>
                    <li><strong>Auto-Invoice Generation:</strong> System automatically creates initial rent invoice and security deposit invoice. Also creates a recurring invoice template for monthly rent.</li>
                    <li><strong>Broker Fees:</strong> If property has a broker, enter broker fee. Track and pay via Broker Payouts.</li>
                    <li><strong>Agreement Status:</strong> Active, Terminated, or Expired. Terminate agreements when tenants leave.</li>
                    <li><strong>Recurring Invoices:</strong> Monthly rent invoices are auto-generated from templates. Manually generate from Recurring Invoices tab if needed.</li>
                    <li><strong>Security Deposits:</strong> Tracked separately. Can be charged/refunded via invoices or transactions.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Rental Agreement">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Tenant:</strong> John Doe</div>
                    <div><strong>Property:</strong> Unit 101</div>
                    <div><strong>Rent:</strong> $1,000/month</div>
                    <div><strong>Deposit:</strong> $2,000</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'rental-invoices',
        title: 'Rental Invoices & Payments',
        category: 'Rental Management',
        keywords: ['rental invoice', 'tenant payment', 'rent collection', 'invoice payment', 'recurring'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Track rent collection and tenant payments efficiently.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Invoice Types:</strong> Rental invoices include monthly rent, security deposits, and one-time charges.</li>
                    <li><strong>Recurring Invoices:</strong> System generates monthly rent invoices automatically. View in Recurring Invoices tab. Generate manually if needed.</li>
                    <li><strong>Recording Payments:</strong> Click "Pay" on an invoice, select payment account and date. System creates transaction and updates invoice status.</li>
                    <li><strong>Partial Payments:</strong> Record partial payments. Invoice status shows "Partially Paid" until fully paid.</li>
                    <li><strong>Bulk Payments:</strong> Select multiple invoices and pay together for batch processing.</li>
                    <li><strong>Invoice Status:</strong> Unpaid, Partially Paid, Paid. Filter by status to see outstanding amounts.</li>
                    <li><strong>Service Charges:</strong> Add service charges to invoices. Tracked separately for owner payout calculations.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Rental Invoices">
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>INV-001</span><span className="text-green-600">Paid</span></div>
                    <div className="flex justify-between"><span>INV-002</span><span className="text-yellow-600">Partial</span></div>
                    <div className="flex justify-between"><span>INV-003</span><span className="text-red-600">Unpaid</span></div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'owner-payouts',
        title: 'Owner Payouts & Income Distribution',
        category: 'Rental Management',
        keywords: ['owner payout', 'owner income', 'distribution', 'property owner', 'payout calculation'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Calculate and distribute rental income to property owners.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Owner Setup:</strong> Properties must have an owner assigned (Contact type: Owner). Set owner percentage if co-owned.</li>
                    <li><strong>Payout Calculation:</strong> System calculates: Collected Rent + Service Charges - Deductions (maintenance, broker fees, etc.) = Owner Income.</li>
                    <li><strong>Creating Payouts:</strong> Owner Payouts tab &gt; Select owner &gt; Review calculated income &gt; Create payout transaction.</li>
                    <li><strong>Deductions:</strong> Expenses linked to property are automatically deducted. Service charges are added back to owner income.</li>
                    <li><strong>Payout Reports:</strong> View Owner Income Report to see detailed breakdown by property, period, and owner.</li>
                    <li><strong>Security Deposit Tracking:</strong> Security deposits held for owners are tracked separately. Use Owner Security Deposit Report.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Owner Payout">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Owner:</strong> Jane Smith</div>
                    <div><strong>Collected Rent:</strong> $5,000</div>
                    <div><strong>Deductions:</strong> -$200</div>
                    <div className="border-t pt-1"><strong>Payout:</strong> $4,800</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'rental-properties',
        title: 'Properties & Buildings Setup',
        category: 'Rental Management',
        keywords: ['properties', 'buildings', 'units', 'property setup', 'building management'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Organize your rental portfolio hierarchically.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Structure:</strong> Buildings contain Properties, Properties contain Units. Units are rented to tenants.</li>
                    <li><strong>Creating Buildings:</strong> Rental Management &gt; Properties tab &gt; Add Building. Enter name and address.</li>
                    <li><strong>Adding Properties:</strong> Select a building, then add properties (floors/apartments). Assign owner contact.</li>
                    <li><strong>Creating Units:</strong> Within properties, add units (rooms/spaces). Units are linked to rental agreements.</li>
                    <li><strong>Owner Assignment:</strong> Each property must have an owner for payout calculations. Set in property details.</li>
                    <li><strong>Visual Layout:</strong> Use Visual Layout report to see building structure and unit occupancy at a glance.</li>
                    <li><strong>Property Status:</strong> Track occupied/vacant units. Status updates automatically based on active agreements.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Properties">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Building A</strong></div>
                    <div className="pl-2">├─ Property 101 (Owner: John)</div>
                    <div className="pl-4">│  └─ Unit 101A (Occupied)</div>
                    <div className="pl-2">└─ Property 102 (Owner: Jane)</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'broker-payouts',
        title: 'Broker Fee Management',
        category: 'Rental Management',
        keywords: ['broker', 'commission', 'broker fee', 'payout', 'commission tracking'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Track and pay broker commissions for rental agreements.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Broker Assignment:</strong> Assign broker to rental agreements when creating them. Enter broker fee amount.</li>
                    <li><strong>Fee Tracking:</strong> System tracks broker fees per agreement. View outstanding fees in Broker Payouts tab.</li>
                    <li><strong>Paying Brokers:</strong> Broker Payouts &gt; Select broker &gt; Review agreements &gt; Select fees to pay &gt; Record payment.</li>
                    <li><strong>Partial Payments:</strong> Pay broker fees in installments. System tracks remaining balance per agreement.</li>
                    <li><strong>Reports:</strong> Broker Fee Report shows all fees, paid amounts, and outstanding balances by broker.</li>
                    <li><strong>Expense Category:</strong> Broker fee payments are recorded as expenses in your ledger, linked to the agreement.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Broker Payouts">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Broker:</strong> ABC Realty</div>
                    <div><strong>Total Fees:</strong> $2,000</div>
                    <div><strong>Paid:</strong> $1,000</div>
                    <div><strong>Outstanding:</strong> $1,000</div>
                </div>
            </MockWindow>
        )
    },

    // --- Project Management ---
    {
        id: 'project-setup',
        title: 'Projects & Units Setup',
        category: 'Project Management',
        keywords: ['projects', 'units', 'project setup', 'construction', 'development'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Organize construction or development projects with unit tracking.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Creating Projects:</strong> Project Management &gt; Projects tab &gt; New Project. Enter name, description, status, and color code.</li>
                    <li><strong>Adding Units:</strong> Within projects, add units (apartments, plots, shops). Units are sold via Project Agreements.</li>
                    <li><strong>Project Status:</strong> Active, Completed, On Hold. Status affects filtering and reporting.</li>
                    <li><strong>Installment Configuration:</strong> Set default installment plan (duration, down payment %, frequency) at project level.</li>
                    <li><strong>PM Cost Configuration:</strong> Set Project Management fee percentage and excluded categories per project.</li>
                    <li><strong>Visual Layout:</strong> Visual Layout report shows project structure and unit sale status.</li>
                    <li><strong>Project Reports:</strong> Access comprehensive reports: Summary, Revenue Analysis, PM Cost, Category Breakdown, etc.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Projects">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Project: Sky Tower</strong></div>
                    <div className="pl-2">├─ Unit 101 (Sold)</div>
                    <div className="pl-2">├─ Unit 102 (Available)</div>
                    <div className="pl-2">└─ Unit 103 (Sold)</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'project-agreements',
        title: 'Project Agreements & Installments',
        category: 'Project Management',
        keywords: ['project agreement', 'installment', 'down payment', 'sale', 'client', 'payment plan'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Track unit sales with flexible installment payment plans.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Creating Agreements:</strong> Project Management &gt; Agreements tab &gt; New Agreement. Select client, project, unit(s), and selling price.</li>
                    <li><strong>Installment Generation:</strong> System auto-generates invoices: Down Payment (if configured) + Installment invoices based on duration and frequency.</li>
                    <li><strong>Payment Plans:</strong> Configure duration (years), down payment percentage, and frequency (Monthly, Quarterly, Yearly).</li>
                    <li><strong>Discounts:</strong> Apply Customer Discount, Floor Discount, Lump Sum Discount, or Misc Discount. Tracked in reports.</li>
                    <li><strong>Multiple Units:</strong> One agreement can include multiple units. Total selling price is sum of all units.</li>
                    <li><strong>Invoice Tracking:</strong> All generated invoices appear in Project Invoices. Track payment status per installment.</li>
                    <li><strong>Client Ledger:</strong> View complete payment history for each client in Owner Ledger report.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Project Agreement">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Client:</strong> John Buyer</div>
                    <div><strong>Unit:</strong> 101</div>
                    <div><strong>Price:</strong> $100,000</div>
                    <div><strong>Down Payment:</strong> 20% ($20,000)</div>
                    <div><strong>Installments:</strong> 60 months @ $1,333</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'project-bills',
        title: 'Bills & Vendor Payments',
        category: 'Project Management',
        keywords: ['bills', 'vendor bills', 'expenses', 'project expenses', 'bill payment'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Manage project-related bills and vendor payments efficiently.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Creating Bills:</strong> Bills tab &gt; New Bill. Enter vendor, amount, date, description, category, and link to project.</li>
                    <li><strong>Bill Tracking:</strong> Bills show as Unpaid, Partially Paid, or Paid. Outstanding balance tracked automatically.</li>
                    <li><strong>Recording Payments:</strong> Pay individual bills or use bulk payment to pay multiple bills at once.</li>
                    <li><strong>Project Linking:</strong> Link bills to projects for cost tracking. Bills appear in project expense reports.</li>
                    <li><strong>Vendor Management:</strong> View all bills per vendor in Vendor Directory. Access vendor ledger for payment history.</li>
                    <li><strong>Categories:</strong> Categorize bills (Materials, Labor, etc.) for expense analysis and PM cost calculations.</li>
                    <li><strong>Contract Linking:</strong> Link bills to vendor contracts for contract-based expense tracking.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Bills">
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>BILL-001</span><span className="text-red-600">Unpaid</span></div>
                    <div className="flex justify-between"><span>BILL-002</span><span className="text-green-600">Paid</span></div>
                    <div className="flex justify-between"><span>Total Outstanding</span><span className="font-bold">$5,000</span></div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'pm-cost-tracking',
        title: 'Project Management Cost Tracking',
        category: 'Project Management',
        keywords: ['pm cost', 'project management fee', 'pm percentage', 'cost allocation'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Automatically calculate and track Project Management fees based on project expenses.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>PM Configuration:</strong> Set PM fee percentage per project (e.g., 5% of expenses). Configure in project settings.</li>
                    <li><strong>Excluded Categories:</strong> Exclude certain expense categories from PM cost calculation (e.g., PM fees themselves, taxes).</li>
                    <li><strong>Automatic Calculation:</strong> PM cost = (Total Project Expenses - Excluded Expenses) × PM Percentage. Updates automatically.</li>
                    <li><strong>PM Cost Report:</strong> View accrued PM costs, paid amounts, and outstanding balance per project.</li>
                    <li><strong>Paying PM Fees:</strong> Record PM fee payments as transactions. System tracks paid vs. accrued amounts.</li>
                    <li><strong>Cost Allocation:</strong> PM costs are allocated to project financials and appear in project profit/loss reports.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="PM Costs">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Project Expenses:</strong> $100,000</div>
                    <div><strong>PM Rate:</strong> 5%</div>
                    <div><strong>Accrued PM Cost:</strong> $5,000</div>
                    <div><strong>Paid:</strong> $2,000</div>
                    <div><strong>Balance:</strong> $3,000</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'investor-equity',
        title: 'Investor Equity & Profit Distribution',
        category: 'Project Management',
        keywords: ['investor', 'equity', 'profit', 'distribution', 'capital', 'dividend'],
        content: (
            <div className="space-y-3 text-slate-600 text-sm">
                <p>Track investor capital and distribute profits to equity holders.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Equity Accounts:</strong> Create Equity accounts (Account Type: Equity) for each investor. These represent capital contributed.</li>
                    <li><strong>Recording Capital:</strong> Use Transfer transactions from bank accounts to equity accounts to record investor contributions.</li>
                    <li><strong>Profit Calculation:</strong> System calculates project profit: Income - Operating Expenses (excluding equity transactions).</li>
                    <li><strong>Profit Distribution:</strong> Use Project Cycle Manager to distribute profits. Select project, enter distribution amount, system allocates proportionally based on equity.</li>
                    <li><strong>Distribution Reports:</strong> Investor Distribution report shows capital invested, profits received, and current equity balance per investor.</li>
                    <li><strong>Equity Tracking:</strong> View investor balances in project reports. Equity accounts show invested capital minus distributions.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Investor Equity">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Investor A:</strong> $50,000</div>
                    <div><strong>Investor B:</strong> $30,000</div>
                    <div className="border-t pt-1"><strong>Total Equity:</strong> $80,000</div>
                </div>
            </MockWindow>
        )
    },

    // --- Payroll ---
    {
        id: 'employee-management',
        title: 'Employee Management',
        category: 'Payroll',
        keywords: ['employee', 'staff', 'employee setup', 'salary', 'designation'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Manage employee records and salary structures comprehensively.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Adding Employees:</strong> Payroll &gt; Employee Management &gt; New Employee. Enter personal details, designation, department, and employment dates.</li>
                    <li><strong>Salary Structure:</strong> Assign salary components (Basic, Allowances, Deductions) to each employee. Use Salary Structure Manager for templates.</li>
                    <li><strong>Multi-Project Allocation:</strong> Assign employees to multiple projects with percentage or hours allocation for cost distribution.</li>
                    <li><strong>Employee Status:</strong> Active, On Leave, Terminated. Status affects payroll processing eligibility.</li>
                    <li><strong>Contact Linking:</strong> Employees are linked to Contacts. Ensure contact exists before creating employee.</li>
                    <li><strong>Employment History:</strong> Track join dates, promotions, transfers, and exits with lifecycle events.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Employee">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Name:</strong> John Doe</div>
                    <div><strong>Designation:</strong> Manager</div>
                    <div><strong>Basic Salary:</strong> $5,000</div>
                    <div><strong>Status:</strong> Active</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'salary-components',
        title: 'Salary Components & Structures',
        category: 'Payroll',
        keywords: ['salary components', 'allowances', 'deductions', 'salary structure', 'pay structure'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Define reusable salary components for consistent payroll processing.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Component Types:</strong> Basic Salary, Allowances (HRA, Transport, etc.), Bonuses, Deductions (Insurance, Loan), Tax Deductions, Statutory (EPF, ESI).</li>
                    <li><strong>Creating Components:</strong> Payroll &gt; Salary Structure Manager &gt; Components. Define name, type, calculation method, and tax status.</li>
                    <li><strong>Salary Structures:</strong> Create templates combining multiple components. Assign structures to employees for quick setup.</li>
                    <li><strong>Tax Configuration:</strong> Set up tax slabs and rules in Settings. System calculates tax deductions automatically during payroll.</li>
                    <li><strong>Statutory Setup:</strong> Configure EPF, ESI, and other statutory deductions. System applies rules during payroll processing.</li>
                    <li><strong>Component Assignment:</strong> Assign components to employees individually or via salary structures. Amounts can be fixed or percentage-based.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Salary Components">
                <div className="space-y-1 text-[10px]">
                    <div className="text-green-600">+ Basic Salary</div>
                    <div className="text-green-600">+ HRA</div>
                    <div className="text-green-600">+ Transport</div>
                    <div className="text-red-600">- Tax</div>
                    <div className="text-red-600">- EPF</div>
                    <div className="border-t pt-1"><strong>Net Salary</strong></div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'payroll-processing',
        title: 'Payroll Processing & Payslips',
        category: 'Payroll',
        keywords: ['payroll', 'payslip', 'salary processing', 'payroll cycle', 'generate payslip'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Process payroll cycles and generate payslips for all employees.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Payroll Cycles:</strong> Create cycles (Monthly, Bi-weekly, etc.) for each pay period. Define start date, end date, and payment date.</li>
                    <li><strong>Processing Payroll:</strong> Payroll Processing tab &gt; Select cycle &gt; Process Payroll. System generates payslips for all active employees.</li>
                    <li><strong>Proration:</strong> System automatically prorates salary for employees who joined/left mid-cycle based on days worked.</li>
                    <li><strong>Calculations:</strong> System calculates gross salary, deductions, tax, statutory contributions, and net salary automatically.</li>
                    <li><strong>Bonuses & Adjustments:</strong> Add bonuses and payroll adjustments before processing. They're included in payslip calculations.</li>
                    <li><strong>Attendance Integration:</strong> Link attendance records to adjust salary for leaves, overtime, etc.</li>
                    <li><strong>Payslip Management:</strong> Review, approve, and pay payslips. Record payments to update payslip status.</li>
                    <li><strong>Bulk Payments:</strong> Pay multiple payslips at once using bulk payment feature.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Payroll Cycle">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Cycle:</strong> January 2024</div>
                    <div><strong>Period:</strong> 1-31 Jan</div>
                    <div><strong>Employees:</strong> 25</div>
                    <div><strong>Total Payroll:</strong> $125,000</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'loans-advances',
        title: 'Employee Loans & Advances',
        category: 'Payroll',
        keywords: ['loan', 'advance', 'employee loan', 'salary advance', 'deduction'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Manage employee loans and salary advances with automatic deduction tracking.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Recording Loans:</strong> Payroll &gt; Loans & Advances &gt; New Loan. Enter employee, amount, interest rate, term, and deduction amount per cycle.</li>
                    <li><strong>Salary Advances:</strong> Record advances given to employees. Link to "Salary Advance" category for proper tracking.</li>
                    <li><strong>Automatic Deductions:</strong> Configure loan deductions in salary structure. System deducts automatically during payroll processing.</li>
                    <li><strong>Loan Balance Tracking:</strong> System tracks outstanding loan balance. View remaining principal and interest per employee.</li>
                    <li><strong>Repayment Schedule:</strong> View repayment schedule and track payments. Mark loans as completed when fully repaid.</li>
                    <li><strong>Loan Reports:</strong> Access employee loan reports to see all active loans, repayment history, and outstanding balances.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Loan Record">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Employee:</strong> John Doe</div>
                    <div><strong>Principal:</strong> $10,000</div>
                    <div><strong>Monthly Deduction:</strong> $500</div>
                    <div><strong>Balance:</strong> $8,000</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'attendance-bonuses',
        title: 'Attendance & Bonuses',
        category: 'Payroll',
        keywords: ['attendance', 'bonus', 'overtime', 'leave', 'incentive'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Track attendance and manage bonuses for accurate payroll calculations.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Attendance Records:</strong> Record employee attendance (Present, Absent, Leave, Overtime) per day. Link to payroll cycles.</li>
                    <li><strong>Leave Deduction:</strong> System calculates salary deduction for unpaid leaves based on attendance records during payroll processing.</li>
                    <li><strong>Overtime Calculation:</strong> Record overtime hours. Configure overtime rates in salary components to include in payroll.</li>
                    <li><strong>Bonus Management:</strong> Create bonus records (Annual, Performance, etc.). Approve bonuses before payroll processing to include in payslips.</li>
                    <li><strong>Payroll Adjustments:</strong> Create temporary adjustments (increment, penalty, etc.) for specific payroll cycles.</li>
                    <li><strong>Integration:</strong> Attendance and bonuses are automatically considered during payroll processing for accurate salary calculation.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Attendance">
                <div className="space-y-1 text-[10px]">
                    <div><strong>Employee:</strong> John Doe</div>
                    <div><strong>Days Present:</strong> 22</div>
                    <div><strong>Leaves:</strong> 2</div>
                    <div><strong>Overtime:</strong> 5 hours</div>
                </div>
            </MockWindow>
        )
    },

    // --- Advanced Tools ---
    {
        id: 'dashboard-kpis',
        title: 'Dashboard & KPIs',
        category: 'Advanced Tools',
        keywords: ['dashboard', 'kpi', 'key performance indicator', 'metrics', 'analytics'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Monitor your business performance with real-time KPIs and visual analytics.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>KPI Cards:</strong> Dashboard displays key metrics: Total Balance, Net Income, Accounts Receivable, Accounts Payable, etc.</li>
                    <li><strong>Customizing KPIs:</strong> Click settings icon on dashboard to select which KPIs to display. Drag to reorder.</li>
                    <li><strong>KPI Panel:</strong> Click chart icon to open right panel. Browse all available KPIs grouped by category (General, Bank Accounts, Income/Expense Categories).</li>
                    <li><strong>KPI Drilldown:</strong> Click any KPI to see detailed breakdown. View transactions, trends, and related data.</li>
                    <li><strong>Charts:</strong> Dashboard shows cash flow trends, expense breakdown, and other visual analytics.</li>
                    <li><strong>Dynamic KPIs:</strong> KPIs update in real-time as you record transactions. Account balances and category totals reflect latest data.</li>
                    <li><strong>Favorites:</strong> Add frequently used KPIs to favorites for quick access from the panel.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Dashboard">
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>Total Balance</span><span className="font-bold">$50,000</span></div>
                    <div className="flex justify-between"><span>Net Income</span><span className="text-green-600">$10,000</span></div>
                    <div className="flex justify-between"><span>A/R</span><span className="text-blue-600">$5,000</span></div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'reports-system',
        title: 'Reports & Analytics',
        category: 'Advanced Tools',
        keywords: ['reports', 'analytics', 'financial reports', 'ledger reports', 'analysis'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Access comprehensive reports for all aspects of your business.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Rental Reports:</strong> Building Analysis, Property Status, Owner Income, Tenant Ledger, Vendor Ledger, Broker Fees, Service Charges, Security Deposits, Visual Layout.</li>
                    <li><strong>Project Reports:</strong> Project Summary, Revenue Analysis, PM Cost, Income/Expense by Category, Unit Report, Client Ledger, Broker Report, Vendor Ledger, Contract Report, Visual Layout.</li>
                    <li><strong>General Reports:</strong> Transfer Statistics, Category Analysis, Account Statements (from General Ledger filters).</li>
                    <li><strong>Payroll Reports:</strong> Employee Payment Report, Payroll Summary, Loan Reports (from Payroll module).</li>
                    <li><strong>Report Access:</strong> Reports are in respective modules (Rental/Project Management &gt; Reports tab) or via KPI Panel &gt; Reports tab.</li>
                    <li><strong>Export:</strong> Most reports can be exported to Excel/PDF for sharing or further analysis.</li>
                    <li><strong>Filtering:</strong> Reports support date range, project, property, and other filters for customized analysis.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Reports">
                <div className="space-y-1 text-[10px]">
                    <div>• Owner Income Report</div>
                    <div>• Project Summary</div>
                    <div>• Tenant Ledger</div>
                    <div>• PM Cost Report</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'data-import-export',
        title: 'Data Import & Export',
        category: 'Advanced Tools',
        keywords: ['import', 'export', 'migrate', 'excel', 'backup', 'data migration'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Import data from Excel or export for backup and analysis.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>MigratAI Import:</strong> Settings &gt; Import Data. Upload Excel file. System intelligently detects columns and maps to your data structure. Review mapping before importing.</li>
                    <li><strong>Supported Data:</strong> Import Contacts, Transactions, Invoices, Bills, Projects, Properties, Employees, and more.</li>
                    <li><strong>Export Transactions:</strong> General Ledger &gt; Use filters &gt; Export to Excel. Export any filtered transaction list.</li>
                    <li><strong>Export Reports:</strong> Most reports have Export button. Export to Excel or PDF format.</li>
                    <li><strong>Full Backup:</strong> Settings &gt; Data Management &gt; Backup Data. Downloads complete JSON backup of all data. Restore using Import.</li>
                    <li><strong>Regular Backups:</strong> Create backups regularly, especially before major data changes or software updates.</li>
                    <li><strong>Data Validation:</strong> Import wizard validates data and shows errors. Fix errors before completing import.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Import Wizard">
                <div className="space-y-2">
                    <MockButton label="Upload Excel File" variant="primary" className="w-full" />
                    <div className="text-[9px] text-slate-500 text-center">Map Columns → Review → Import</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'settings-customization',
        title: 'Settings & Customization',
        category: 'Advanced Tools',
        keywords: ['settings', 'configuration', 'customization', 'print settings', 'whatsapp', 'branding'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Configure application settings and customize branding.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Print Settings:</strong> Configure Company Name, Logo (upload image), Address, Phone, Email. Appears on all invoices and reports.</li>
                    <li><strong>WhatsApp Templates:</strong> Customize message templates for sending receipts and reminders via WhatsApp.</li>
                    <li><strong>Invoice Settings:</strong> Set invoice number prefixes, next numbers, and padding for Rental and Project invoices separately.</li>
                    <li><strong>Agreement Settings:</strong> Configure default terms and conditions, agreement number formats.</li>
                    <li><strong>Users & Roles:</strong> Manage users and assign roles (Admin, Accounts). Accounts role has limited access.</li>
                    <li><strong>Database Management:</strong> View database info, clear data (careful!), and manage storage.</li>
                    <li><strong>Preferences:</strong> Toggle system transactions display, color coding, beep on save, and other UI preferences.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Settings">
                <div className="space-y-1">
                    <MockButton label="Print Settings" variant="secondary" className="w-full justify-start text-[10px]" icon={<span className="mr-2">🖨️</span>} />
                    <MockButton label="WhatsApp Templates" variant="secondary" className="w-full justify-start text-[10px]" icon={<span className="mr-2">💬</span>} />
                    <MockButton label="Invoice Settings" variant="secondary" className="w-full justify-start text-[10px]" icon={<span className="mr-2">📄</span>} />
                </div>
            </MockWindow>
        )
    },
    {
        id: 'sync-mobile',
        title: 'Mobile Sync & PWA',
        category: 'Advanced Tools',
        keywords: ['sync', 'mobile', 'pwa', 'progressive web app', 'device sync', 'qr code'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Sync data across devices and use the app on mobile.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Sync Feature:</strong> Click "Sync Mobile" in sidebar. Host device generates QR code. Scan with mobile device to connect.</li>
                    <li><strong>Real-time Sync:</strong> When connected, data syncs in real-time between devices. Changes on one device appear on others.</li>
                    <li><strong>PWA Installation:</strong> Install app on mobile as Progressive Web App for app-like experience. Browser will prompt or use install option.</li>
                    <li><strong>Mobile Payments:</strong> Use Mobile Payments page for quick payment entry on mobile devices with optimized interface.</li>
                    <li><strong>Offline Support:</strong> App works offline. Data syncs when connection is restored.</li>
                    <li><strong>Sync Status:</strong> Green indicator in sidebar shows sync connection status. Disconnect when done.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Sync">
                <div className="space-y-2">
                    <div className="w-full h-24 bg-slate-200 rounded flex items-center justify-center text-[8px] text-slate-500">
                        QR Code
                    </div>
                    <div className="text-[9px] text-slate-500 text-center">Scan to Connect</div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'vendors-contacts',
        title: 'Vendors & Contacts Management',
        category: 'Advanced Tools',
        keywords: ['vendors', 'contacts', 'vendor directory', 'contact management', 'suppliers'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Centralized management of all business contacts.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Contact Types:</strong> Vendor, Tenant, Owner, Staff, Broker, Client, Other. Type affects how contact appears in different modules.</li>
                    <li><strong>Creating Contacts:</strong> Contacts page &gt; New Contact. Enter name, type, phone, email, address, and other details.</li>
                    <li><strong>Vendor Directory:</strong> Dedicated page for vendors. View all bills, payment history, and outstanding balances per vendor.</li>
                    <li><strong>Vendor Ledger:</strong> Access detailed ledger showing all bills and payments for each vendor with running balance.</li>
                    <li><strong>Bulk Payments:</strong> Pay multiple vendor bills at once. Select bills and record single payment transaction.</li>
                    <li><strong>Contact Linking:</strong> Contacts are linked across modules - invoices, bills, agreements, payroll all reference contacts.</li>
                    <li><strong>Reports:</strong> Vendor Ledger reports available in both Rental and Project contexts for comprehensive tracking.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Vendor Directory">
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>ABC Supplies</span><span className="text-red-600">$2,000</span></div>
                    <div className="flex justify-between"><span>XYZ Construction</span><span className="text-green-600">$0</span></div>
                    <div className="flex justify-between"><span>Total Outstanding</span><span className="font-bold">$2,000</span></div>
                </div>
            </MockWindow>
        )
    },
    {
        id: 'budgets-tasks',
        title: 'Budget Planner & Tasks',
        category: 'Advanced Tools',
        keywords: ['budget', 'budget planner', 'tasks', 'todo', 'planning'],
        content: (
            <div className="space-y-3 text-sm text-slate-600">
                <p>Plan budgets and manage tasks to stay organized.</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                    <li><strong>Budget Planning:</strong> Budget Planner page. Set monthly or annual budgets per category. System compares actual spending vs. budget.</li>
                    <li><strong>Budget Tracking:</strong> Dashboard shows budget status. Budget reports show variance analysis (over/under budget).</li>
                    <li><strong>Task Management:</strong> Tasks page for to-do lists. Create tasks with priority (Low, Medium, High), mark as complete.</li>
                    <li><strong>Task Features:</strong> Add descriptions, set priorities, filter by status. Simple but effective task tracking.</li>
                    <li><strong>Budget Reports:</strong> View budget performance reports showing actual vs. budgeted amounts with variance percentages.</li>
                    <li><strong>Integration:</strong> Budgets work with transaction categories. Actual amounts pull from General Ledger automatically.</li>
                </ul>
            </div>
        ),
        visual: (
            <MockWindow title="Budget Planner">
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>Salaries</span><span>$5,000 / $5,500</span></div>
                    <div className="flex justify-between"><span>Rent</span><span>$2,000 / $2,000</span></div>
                    <div className="flex justify-between"><span>Supplies</span><span>$800 / $1,000</span></div>
                </div>
            </MockWindow>
        )
    }
];

// --- MAIN COMPONENT ---

const HelpSection: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<HelpCategory | 'All'>('Getting Started');
    const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

    const categories: (HelpCategory | 'All')[] = ['Getting Started', 'General Finance', 'Rental Management', 'Project Management', 'Payroll', 'Advanced Tools', 'All'];

    const filteredTopics = useMemo(() => {
        return HELP_TOPICS.filter(topic => {
            const matchesCategory = activeCategory === 'All' || topic.category === activeCategory;
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery ||
                topic.title.toLowerCase().includes(searchLower) ||
                topic.keywords.some(k => k.includes(searchLower));

            return matchesCategory && matchesSearch;
        });
    }, [activeCategory, searchQuery]);

    const handleTopicClick = (id: string) => {
        setExpandedTopicId(prev => prev === id ? null : id);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 min-h-[600px]">
            {/* Sidebar Navigation */}
            <div className="lg:w-64 flex-shrink-0 space-y-2">
                <div className="lg:hidden mb-4">
                    <select
                        value={activeCategory}
                        onChange={(e) => setActiveCategory(e.target.value as any)}
                        className="w-full p-2 border rounded-lg bg-slate-50 text-slate-700 font-medium"
                    >
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>
                <div className="hidden lg:block space-y-1">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Categories</h3>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeCategory === cat
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-grow flex flex-col">
                {/* Search Header */}
                <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 pb-4 border-b border-slate-100 mb-4">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-5 h-5">{ICONS.search}</div>
                        </div>
                        <Input
                            placeholder="Search help topics (e.g., 'invoice', 'backup')..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>

                {/* Topic List */}
                <div className="space-y-4">
                    {filteredTopics.length > 0 ? (
                        filteredTopics.map(topic => (
                            <div key={topic.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-24" id={topic.id}>
                                <button
                                    onClick={() => handleTopicClick(topic.id)}
                                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${expandedTopicId === topic.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                            <div className="w-5 h-5">{ICONS.fileText}</div>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800">{topic.title}</h3>
                                            <div className="flex gap-2 mt-1">
                                                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{topic.category}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`text-slate-400 transition-transform duration-200 ${expandedTopicId === topic.id ? 'rotate-180' : ''}`}>
                                        {ICONS.chevronDown}
                                    </div>
                                </button>

                                {expandedTopicId === topic.id && (
                                    <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/30 flex flex-col lg:flex-row gap-6 animate-fade-in-fast">
                                        <div className="flex-1 order-2 lg:order-1">
                                            <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">i</span>
                                                Guide
                                            </h4>
                                            {topic.content}
                                        </div>
                                        <div className="flex-1 order-1 lg:order-2 flex justify-center lg:justify-end">
                                            <div className="w-full max-w-[300px]">
                                                {topic.visual}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12 text-slate-500">
                            <p className="text-lg font-medium">No topics found.</p>
                            <p className="text-sm">Try adjusting your search or category.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HelpSection;
