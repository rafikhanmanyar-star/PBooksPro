/**
 * Master UAT test case helpers.
 */

/** @typedef {{
 *   id: string,
 *   module: string,
 *   feature: string,
 *   objective: string,
 *   navigation: string,
 *   prerequisites: string,
 *   testData: string,
 *   steps: string[],
 *   expected: string,
 *   notImplemented?: boolean,
 *   defaultRemarks?: string,
 * }} UatCase */

/** @typedef {{
 *   number: number,
 *   title: string,
 *   idRange: string,
 *   purpose: string,
 *   businessFlow: string,
 *   requiredTestData: string[],
 *   dependencies: string[],
 *   expectedOutputs: string[],
 *   checklist: string[],
 *   cases: UatCase[],
 * }} UatChapter */

/**
 * @param {string} id
 * @param {string} module
 * @param {string} feature
 * @param {string} objective
 * @param {string} navigation
 * @param {string} prerequisites
 * @param {string} testData
 * @param {string[]} steps
 * @param {string} expected
 * @param {{ notImplemented?: boolean, defaultRemarks?: string }} [opts]
 * @returns {UatCase}
 */
export function tc(id, module, feature, objective, navigation, prerequisites, testData, steps, expected, opts = {}) {
  return {
    id,
    module,
    feature,
    objective,
    navigation,
    prerequisites,
    testData,
    steps,
    expected,
    notImplemented: opts.notImplemented ?? false,
    defaultRemarks: opts.defaultRemarks ?? (opts.notImplemented ? 'NOT IMPLEMENTED — feature not available in current product build.' : ''),
  };
}

/** @param {number} n */
export function uatId(n) {
  return `UAT-${String(n).padStart(3, '0')}`;
}

/**
 * @param {number} start
 * @param {Array<Omit<UatCase, 'id'> & { id?: string }>} items
 */
export function withIds(start, items) {
  return items.map((item, i) => ({ ...item, id: item.id ?? uatId(start + i) }));
}

export const META = {
  id: 'UAT-MASTER-001',
  title: 'PBooksPro Master User Acceptance Testing (UAT) Manual',
  version: '1.1',
  date: '2026-06-22',
  productVersion: '1.2.463+',
  documentOwner: 'PBooks Pro QA / Implementation',
};

export const VERSION_HISTORY = [
  { version: '1.1', date: '2026-06-22', author: 'PBooks Pro QA', changes: 'Removed Inventory Management chapter; added Procurement Management (Ch.7) and Investment Management (Ch.8); renumbered Ch.9–12; aligned to core product modules.' },
  { version: '1.0', date: '2026-06-22', author: 'PBooks Pro QA', changes: 'Initial master UAT manual — 550 test cases across 11 chapters; aligned to Architecture v2.1 UI labels.' },
];

export const TEST_ENV = {
  stack: 'npm run test:staging (PostgreSQL pBookspro_Staging, API :3001, Electron client)',
  altStack: 'Cloud Edition: https://app.pbookspro.com (production) or staging Render URL',
  login: 'Company email + Username + Password (or staging seed: test company / Rafi / Rafi1234)',
  sodUsers: 'Two users required for payroll approval and workflow SoD tests',
  database: 'Fresh tenant recommended for Chapter 1; reuse tenant for Chapters 2–11',
};

export const EXECUTION_GUIDELINES = [
  'This is a tester-facing document. Do not read source code or query the database unless explicitly instructed in a test case.',
  'Execute chapters in order (1 → 12). Later chapters depend on master data created in earlier chapters.',
  'Record Actual Result, Status (Pass / Fail / Blocked / Not Tested), Screenshot Reference, and Remarks for every case.',
  'For cases marked NOT IMPLEMENTED: set Status to Blocked or N/A and note in Remarks — do not force a Pass.',
  'Use staging environment for destructive tests (backup/restore, void, factory reset).',
  'SoD (Segregation of Duties) tests require two browser sessions with different users.',
  'Capture screenshots at Expected Result verification points; name files UAT-XXX-description.png.',
  'If navigation labels differ slightly from this document, match the live UI and note the variance in Remarks.',
];

export const EXCLUDED_FEATURES = [
  { feature: 'Standalone Inventory Management module', reason: 'Not a product module — stock tracking via Procurement GRN + bill line items only; see Inventory Module Audit Report' },
  { feature: 'SKU / item master / warehouses / stock transfers / issues / adjustments', reason: 'Not implemented; PO/GRN use free-text line descriptions' },
  { feature: 'Purchase Requests module', reason: 'Not implemented — procurement starts at Quotation or PO' },
  { feature: 'Blocks (project selling towers/blocks entity)', reason: 'No Block entity in UI; units use Floor field only' },
  { feature: 'BOQ module (standalone)', reason: 'Architecture domain only; contract line items and quotation BOQ attachments used instead' },
  { feature: 'IPC Bills module', reason: 'Not implemented in UI or API routes' },
  { feature: 'WarehouseManagement UI (orphan component)', reason: 'components/settings/WarehouseManagement.tsx not mounted; no /warehouses backend module' },
  { feature: 'Company Management settings section', reason: 'Component exists but not mounted; use Setup Wizard + Preferences instead' },
  { feature: 'Void Payroll Run UI', reason: 'API exists; VoidPayrollRunModal not wired in PayrollHub' },
  { feature: 'Configurable Approval Matrix (payroll)', reason: 'SoD hard-coded: creator ≠ approver' },
  { feature: 'Statutory payroll (tax, EOBI, PF)', reason: 'No statutory compliance engine' },
  { feature: 'Login with Google', reason: 'Button shows Coming Soon' },
  { feature: 'Executive Mobile — Inventory / CRM', reason: 'Inventory disabled Coming soon; CRM hidden from executive app' },
  { feature: 'Platform admin (Subscriptions, System Health)', reason: 'Separate admin/ portal only' },
  { feature: 'Dedicated Owner Settlement menu', reason: 'Use Rental → Payouts' },
  { feature: 'Dedicated Customer menu', reason: 'Use Settings → Contacts (Owners/Leads) and Marketing Client field' },
  { feature: 'Dedicated Receipts module', reason: 'Receipts are invoice payment records under Project selling → Invoices' },
  { feature: 'Variation Orders (standalone UI)', reason: 'Workflow type exists; backend stub on contracts table' },
  { feature: 'Personal transactions (non-admin users)', reason: 'Admin-only by design' },
  { feature: 'Notifications settings page', reason: 'Notifications via header bell panel only' },
];
