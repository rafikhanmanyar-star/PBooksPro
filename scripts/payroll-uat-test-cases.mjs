/**
 * Payroll module UAT test cases (source of truth).
 * Regenerate: node scripts/generate-payroll-uat-docx.mjs
 */

export const META = {
  id: 'UAT-PAYROLL-002',
  title: 'Payroll Module — User Acceptance Test (UAT)',
  version: '2.0',
  date: '2026-06-21',
  productVersion: '1.2.456+',
  changelog:
    'v2.0 — Audit Log tab, SoD payroll approval, in-cycle approval panel, void payslip, enhanced dashboard KPIs, API-only PostgreSQL path, RBAC 2.0.',
};

export const UI_SHELL = `Desktop Full ERP navigation
• Main sidebar → **Payroll** opens Payroll Hub.
• Payroll sub-navigation (desktop left column / mobile **Payroll** dropdown):
  Dashboard | Employees | Attendance* | Leave Management* | Payroll Wizard | Payroll Processing | Payslips | Reports | Payment History | **Audit Log** | Settings
  (*Attendance / Leave require attendance.read / leave.read.)
• Staging: org **test company**, user **Rafi** / **Rafi1234** (npm run db:seed:staging).
• SoD tests need **two users**: one with payroll.runs.create (Preparer) and one with payroll.runs.approve (Approver) who is NOT the run creator.`;

export const RECENT_CHANGES = [
  'New **Audit Log** sub-tab — payroll events from GET /api/v1/audit/events?module=payroll',
  '**Segregation of duties (SoD)** — payroll run creator cannot approve their own run',
  '**PayrollRunApprovalPanel** in Wizard step 7 and Payroll Processing banner (approve / revert)',
  '**Unapprove** — revert APPROVED run to GENERATED (blocked if any payslip has payments)',
  '**Void payslip** (fully paid) vs **Delete payslip** (unpaid) — void requires reason; manual GL reversal warning',
  '**Dashboard** — 8 KPI cards + Awaiting Approval / Ready to Pay / Unpaid Liability banners',
  '**API-only** — PostgreSQL + REST; no client SQLite payroll path in staging/production',
  'Virtualized employee list & ledger; server-side employee search pagination',
];

/** @typedef {{ id: string, name: string, uiGuide: string, expected: string, persona?: string }} UatCase */
/** @typedef {{ section: string, cases: UatCase[] }} UatSection */

export const TEST_SECTIONS = [
  {
    section: '1. Navigation & shell',
    cases: [
      {
        id: 'NAV-01',
        name: 'Open Payroll module',
        uiGuide: '1. Log in (Desktop Full ERP).\n2. Main sidebar → **Payroll**.',
        expected: 'Payroll Hub loads with sub-navigation including **Audit Log**.',
      },
      {
        id: 'NAV-02',
        name: 'Sub-tabs by permission',
        uiGuide: '1. As Payroll Admin — verify all tabs.\n2. As user without attendance.read — **Attendance** hidden.\n3. Without leave.read — **Leave Management** hidden.',
        expected: 'Tabs match RBAC; Audit Log visible to users with payroll access.',
      },
      {
        id: 'NAV-03',
        name: 'Mobile section picker',
        uiGuide: '1. Viewport <768px.\n2. Use top **Payroll** dropdown to switch sections.',
        expected: 'All permitted sections listed; content updates.',
      },
    ],
  },
  {
    section: '2. Dashboard (enhanced)',
    cases: [
      {
        id: 'DASH-01',
        name: 'KPI cards',
        uiGuide: 'Payroll → **Dashboard**. Review cards: Active employees, Payroll runs, Pending approval, Approved runs, Unpaid payslips, Payroll cost this month, Paid YTD, Outstanding liability.',
        expected: 'Eight KPI cards with counts/currency; values match underlying data.',
      },
      {
        id: 'DASH-02',
        name: 'Awaiting approval banner',
        uiGuide: '1. Create GENERATED run (not approved).\n2. Dashboard → **Awaiting Approval** panel.',
        expected: 'Banner shows count of GENERATED runs needing independent approver.',
      },
      {
        id: 'DASH-03',
        name: 'Ready to pay banner',
        uiGuide: '1. Approve a run (second user).\n2. Dashboard → **Ready to Pay** panel.',
        expected: 'Banner shows approved run count; directs to disburse from Processing.',
      },
      {
        id: 'DASH-04',
        name: 'Unpaid liability banner',
        uiGuide: 'Leave approved-but-unpaid payslips → Dashboard.',
        expected: 'Outstanding liability shows sum of unpaid payslip balances.',
      },
    ],
  },
  {
    section: '3. Settings & configuration',
    cases: [
      {
        id: 'SET-01',
        name: 'Create department',
        uiGuide: 'Payroll → **Settings** → Departments → **+ Add Department** → Save.',
        expected: 'Department listed with staff count 0.',
      },
      {
        id: 'SET-02',
        name: 'Create grade',
        uiGuide: 'Settings → Grade Levels → **+ Add Grade** → min/max salary → Save.',
        expected: 'Grade shows BASE and MULTIPLIER badges.',
      },
      {
        id: 'SET-03',
        name: 'Work week',
        uiGuide: 'Settings → **Work Week** → set Mon–Fri working → Save.',
        expected: 'Wizard LOP/attendance uses configured week.',
      },
      {
        id: 'SET-04',
        name: 'Leave type',
        uiGuide: 'Settings → **Leave Types** → Add type → Save. Verify in Leave Management.',
        expected: 'Type available for new leave requests.',
      },
    ],
  },
  {
    section: '4. Employees (workforce)',
    cases: [
      {
        id: 'EMP-01',
        name: 'Add employee',
        uiGuide: 'Employees → **+ Add Employee** → personal, job, salary, allocations → **Save Employee**.',
        expected: 'Employee in virtualized workforce table.',
      },
      {
        id: 'EMP-02',
        name: 'Server search',
        uiGuide: 'Employees → **Search workforce...** (API mode) → type name; wait debounce.',
        expected: 'Paginated API search returns matches (<2s on LAN).',
      },
      {
        id: 'EMP-03',
        name: 'Employee ledger',
        uiGuide: 'Processing → select employee → filter **Ledger** OR Employee Profile ledger.',
        expected: 'Virtualized ledger; payable/advance balance correct.',
      },
    ],
  },
  {
    section: '5. Attendance & leave',
    cases: [
      {
        id: 'ATT-01',
        name: 'Daily attendance',
        uiGuide: 'Attendance → **Daily** → **+ Add** → employee, status → Save.',
        expected: 'Row saved; dashboard counts update.',
      },
      {
        id: 'ATT-02',
        name: 'Bulk attendance',
        uiGuide: 'Daily → **Bulk** modal → apply status to multiple employees.',
        expected: 'All rows created/updated.',
      },
      {
        id: 'LVE-01',
        name: 'Approve leave',
        uiGuide: 'Leave Management → Requests → create → **Approvals** → Approve.',
        expected: 'APPROVED; attendance days auto-created.',
      },
    ],
  },
  {
    section: '6. Payroll Wizard',
    cases: [
      {
        id: 'WIZ-01',
        name: 'Full wizard flow',
        uiGuide: 'Wizard: Period → **Continue** → Attendance → LOP → Preview → **Generate summaries** → **Process payslips** → Approval step.',
        expected: 'Run reaches GENERATED with payslips; step 7 shows approval panel.',
      },
      {
        id: 'WIZ-02',
        name: 'Past period entry',
        uiGuide: 'Processing → **Payroll wizard (past period)** → pick month/year → Open wizard.',
        expected: 'Wizard opens at step 1 with selected period.',
      },
      {
        id: 'WIZ-03',
        name: 'Force override summaries',
        uiGuide: 'Step Generate → check **Admin override** → **Generate summaries**.',
        expected: 'Summaries regenerated for existing period.',
      },
    ],
  },
  {
    section: '7. Segregation of duties (SoD) — approval',
    cases: [
      {
        id: 'SOD-01',
        name: 'Creator cannot approve (Wizard)',
        persona: 'Preparer (created the run)',
        uiGuide: '1. User A creates & processes run to step 7.\n2. User A on Approval step — observe **Waiting For Approver** (disabled Approve).\n3. Message cites company SoD policy.',
        expected: 'Approve disabled; amber policy text shown; no API approve success.',
      },
      {
        id: 'SOD-02',
        name: 'Independent approver (Wizard)',
        persona: 'Approver (different user)',
        uiGuide: '1. User B (not creator) opens Wizard step 7 OR Processing approval banner.\n2. Click **Approve Payroll Run**.',
        expected: 'Run status APPROVED; approved_by / approved_at populated.',
      },
      {
        id: 'SOD-03',
        name: 'In-cycle approval panel',
        uiGuide: 'Processing → select period with GENERATED run → violet **approval banner** at top of right panel.\nVerify checklist: Payroll generated ✓, Payslips processed ✓, Ready for approval.',
        expected: 'PayrollRunApprovalPanel shows creator, requirements, approve action.',
      },
      {
        id: 'SOD-04',
        name: 'Unapprove (revert)',
        persona: 'Approver',
        uiGuide: 'Approved run with **no payments** → Approval panel → **Revert to generated**.',
        expected: 'Run returns to GENERATED; approved_by cleared.',
      },
      {
        id: 'SOD-05',
        name: 'Unapprove blocked when paid',
        uiGuide: 'Approved run with paid payslip → attempt **Revert to generated**.',
        expected: 'Error: cannot unapprove when payslips have payments.',
      },
    ],
  },
  {
    section: '8. Payroll Processing & payments',
    cases: [
      {
        id: 'CYC-01',
        name: 'Employee tree payable',
        uiGuide: 'Processing → left tree — **Payable** column per employee.',
        expected: 'Unpaid net minus payments; **Adv** if overpaid.',
      },
      {
        id: 'CYC-02',
        name: 'Pay single salary',
        uiGuide: 'APPROVED run → payslip row → **Pay** → **Pay Salary** modal → account, amount → **Confirm Payment**.',
        expected: 'GL expense transaction; payslip paid/remaining updated.',
      },
      {
        id: 'CYC-03',
        name: 'Bulk pay',
        uiGuide: 'Select checkboxes on unpaid payslips → toolbar **Pay (N)** → Bulk Pay modal → Confirm.',
        expected: 'All selected payslips paid in one API call.',
      },
      {
        id: 'CYC-04',
        name: 'Pay before approve blocked',
        uiGuide: 'GENERATED (not APPROVED) run → click **Pay**.',
        expected: 'Blocked: run must be APPROVED.',
      },
      {
        id: 'CYC-05',
        name: 'Edit payslip',
        uiGuide: 'Payslip row → **Edit** → adjust amounts → Save.',
        expected: 'Net recalculated; audit event payroll.payslip.edited.',
      },
      {
        id: 'CYC-06',
        name: 'Delete unpaid payslip',
        uiGuide: 'Unpaid payslip → **Delete** → confirm dialog.',
        expected: 'Payslip removed; run totals updated.',
      },
      {
        id: 'CYC-07',
        name: 'Void fully paid payslip',
        uiGuide: 'Fully paid payslip → **Void** (not Delete).\n1. Enter **reason** (required).\n2. Read payment reversal warning.\n3. **Void Payslip**.',
        expected: 'Payslip removed; toast reminds to reverse payment in Accounting; audit payroll.payslip.voided/deleted.',
      },
      {
        id: 'CYC-08',
        name: 'Edit payment record',
        uiGuide: 'Record filter **Payments** → row **Edit** → LinkedTransactionWarningModal if linked → save.',
        expected: 'Payment updated; linked payslip state consistent.',
      },
    ],
  },
  {
    section: '9. Audit Log (new)',
    cases: [
      {
        id: 'AUD-01',
        name: 'Open audit log',
        uiGuide: 'Payroll → **Audit Log**.',
        expected: 'Table: When, Event, Who, Entity, Summary, Diff. (API mode only)',
      },
      {
        id: 'AUD-02',
        name: 'Filter by event',
        uiGuide: 'Audit Log → **All events** dropdown → select e.g. **Run Approved** → refresh.',
        expected: 'Only matching payroll audit events shown.',
      },
      {
        id: 'AUD-03',
        name: 'Run approved event',
        uiGuide: 'After SoD approval → Audit Log → find **Run Approved**.',
        expected: 'Shows approver name, run entity id, timestamp.',
      },
      {
        id: 'AUD-04',
        name: 'Payslip paid event',
        uiGuide: 'After salary payment → filter **Payslip Paid**.',
        expected: 'Event with summary and optional Before/After diff.',
      },
      {
        id: 'AUD-05',
        name: 'Diff viewer',
        uiGuide: 'Row with data → expand **Before** / **After** under Diff column.',
        expected: 'JSON diff displays old/new values.',
      },
    ],
  },
  {
    section: '10. Reports, payslips, history',
    cases: [
      {
        id: 'RPT-01',
        name: 'Payslips register',
        uiGuide: 'Payroll → **Payslips** → year filter.',
        expected: 'All payslips; paid/remaining columns correct.',
      },
      {
        id: 'RPT-02',
        name: 'Analytics & LOP',
        uiGuide: 'Reports → charts + LOP report + Attendance impact.',
        expected: 'Totals match wizard/processing data.',
      },
      {
        id: 'RPT-03',
        name: 'Payment history',
        uiGuide: 'Payment History → search/filter PAID runs.',
        expected: 'Completed batches only.',
      },
    ],
  },
  {
    section: '11. RBAC & real-time',
    cases: [
      {
        id: 'SEC-01',
        name: 'No payroll.read',
        uiGuide: 'User without payroll.read — main sidebar.',
        expected: 'Payroll module hidden.',
      },
      {
        id: 'SEC-02',
        name: 'Operator cannot approve',
        uiGuide: 'User with runs.create but not runs.approve at step 7.',
        expected: 'Permission message; approve blocked.',
      },
      {
        id: 'SYNC-01',
        name: 'Real-time payslip pay',
        uiGuide: 'Browser A pays; Browser B on Processing same tenant.',
        expected: 'B updates Paid/Remaining without F5.',
      },
    ],
  },
  {
    section: '12. Negative & edge cases',
    cases: [
      {
        id: 'NEG-01',
        name: 'Void without reason',
        uiGuide: 'Void modal → leave reason empty → **Void Payslip**.',
        expected: 'Validation: reason required.',
      },
      {
        id: 'NEG-02',
        name: 'Approve missing summaries',
        uiGuide: 'Attempt approve before Generate summaries.',
        expected: 'Blocked with attendance summary error.',
      },
      {
        id: 'NEG-03',
        name: 'Concurrent run lock',
        uiGuide: 'Two users edit same payslip simultaneously.',
        expected: '409 LOCK_HELD on second save.',
      },
    ],
  },
];

export const E2E_STEPS = [
  {
    step: '1',
    action: 'Configure Settings (dept, grade, work week, leave type)',
    uiGuide: 'Payroll → Settings — complete all configuration cards.',
    verification: 'Settings persist after refresh',
  },
  {
    step: '2',
    action: 'Add 2 employees with salary + project allocation',
    uiGuide: 'Employees → + Add Employee (×2).',
    verification: 'Both in workforce list',
  },
  {
    step: '3',
    action: 'Enter attendance + approve leave for payroll month',
    uiGuide: 'Attendance Daily + Leave Approvals.',
    verification: 'Monthly sheet and LOP inputs complete',
  },
  {
    step: '4',
    action: 'User A: Wizard through Process (GENERATED)',
    uiGuide: 'Payroll Wizard — full flow to step 6; do NOT approve.',
    verification: 'Run GENERATED; payslips exist',
  },
  {
    step: '5',
    action: 'User B: Approve run (SoD)',
    uiGuide: 'User B → Processing approval banner OR Wizard step 7 → Approve.',
    verification: 'APPROVED; User A cannot self-approve',
  },
  {
    step: '6',
    action: 'Pay all payslips (bulk)',
    uiGuide: 'Processing → select payables → Pay (N) → Confirm.',
    verification: 'GL transactions; Remaining = 0',
  },
  {
    step: '7',
    action: 'Verify Dashboard, Audit Log, Reports',
    uiGuide: 'Dashboard KPIs; Audit Log events; Reports totals.',
    verification: 'Consistent figures across views',
  },
  {
    step: '8',
    action: 'Second session sync check',
    uiGuide: 'Browser B observes pay/approve without refresh.',
    verification: 'Real-time updates',
  },
];

export const API_SMOKE = [
  { endpoint: '/api/v1/payroll/departments', method: 'GET', expect: '200', uiGuide: 'Settings load' },
  { endpoint: '/api/v1/payroll/employees?page=1&pageSize=50', method: 'GET', expect: '200 paginated', uiGuide: 'Employees tab' },
  { endpoint: '/api/v1/payroll/runs', method: 'GET', expect: '200', uiGuide: 'Processing' },
  { endpoint: '/api/v1/payroll/runs/:id/approve', method: 'POST', expect: '200 or 403 SoD', uiGuide: 'Approval (Approver only)' },
  { endpoint: '/api/v1/payroll/runs/:id/unapprove', method: 'POST', expect: '200 or 400 if paid', uiGuide: 'Revert approval' },
  { endpoint: '/api/v1/audit/events?module=payroll', method: 'GET', expect: '200 items[]', uiGuide: 'Audit Log tab' },
];
