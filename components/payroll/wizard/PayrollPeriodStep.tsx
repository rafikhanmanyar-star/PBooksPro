import React from 'react';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

type Props = {
  month: number;
  year: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
  onContinue: () => void;
  busy?: boolean;
};

const PayrollPeriodStep: React.FC<Props> = ({ month, year, onMonthChange, onYearChange, onContinue, busy }) => {
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  return (
    <div className="space-y-4 max-w-md">
      <h3 className="text-lg font-bold">Select payroll period</h3>
      <p className="text-sm text-app-muted">Choose the month and year for attendance summary and LOP review.</p>
      <label className="block text-xs font-semibold text-app-muted">Month</label>
      <select
        value={month}
        onChange={(e) => onMonthChange(Number(e.target.value))}
        className="w-full rounded-xl border border-app-border px-3 py-2 text-sm"
      >
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <label className="block text-xs font-semibold text-app-muted">Year</label>
      <select
        value={year}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="w-full rounded-xl border border-app-border px-3 py-2 text-sm"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={onContinue}
        className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  );
};

export default PayrollPeriodStep;
