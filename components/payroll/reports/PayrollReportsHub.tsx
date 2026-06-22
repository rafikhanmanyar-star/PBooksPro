import React, { useState } from 'react';
import PayrollRegisterReport from './PayrollRegisterReport';
import PayrollPaymentHistoryReport from './PayrollPaymentHistoryReport';
import PayrollLiabilityReport from './PayrollLiabilityReport';
import PayrollJournalReport from './PayrollJournalReport';
import PayrollSummaryReport from './PayrollSummaryReport';
import AttendanceImpactReport from './AttendanceImpactReport';
import LOPReport from './LOPReport';
import LeaveImpactReport from './LeaveImpactReport';
import PayrollReport from '../PayrollReport';

const REPORT_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'register', label: 'Register' },
  { id: 'payments', label: 'Payment History' },
  { id: 'liability', label: 'Liability' },
  { id: 'journal', label: 'Journal' },
  { id: 'attendance', label: 'Attendance Impact' },
  { id: 'leave', label: 'Leave Impact' },
  { id: 'lop', label: 'LOP' },
  { id: 'analytics', label: 'Analytics' },
] as const;

type TabId = (typeof REPORT_TABS)[number]['id'];

const PayrollReportsHub: React.FC = () => {
  const [tab, setTab] = useState<TabId>('summary');

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 border-b border-app-border bg-app-card/80 px-4 sm:px-6 pt-4">
        <h2 className="text-xl font-black text-app-text mb-3">Payroll Reports</h2>
        <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === t.id
                  ? 'bg-primary text-white'
                  : 'text-app-muted hover:bg-app-toolbar hover:text-app-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {tab === 'summary' && <PayrollSummaryReport />}
        {tab === 'register' && <PayrollRegisterReport />}
        {tab === 'payments' && <PayrollPaymentHistoryReport />}
        {tab === 'liability' && <PayrollLiabilityReport />}
        {tab === 'journal' && <PayrollJournalReport />}
        {tab === 'attendance' && <AttendanceImpactReport />}
        {tab === 'leave' && <LeaveImpactReport />}
        {tab === 'lop' && <LOPReport />}
        {tab === 'analytics' && <PayrollReport />}
      </div>
    </div>
  );
};

export default PayrollReportsHub;
