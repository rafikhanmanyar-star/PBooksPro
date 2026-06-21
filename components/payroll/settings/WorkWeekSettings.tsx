import React, { useState } from 'react';
import { useWorkWeekConfig } from '../wizard/hooks/usePayrollWizardQueries';
import { payrollAttendanceApi } from '../../../services/api/payrollAttendanceApi';
import { DEFAULT_WORK_WEEK } from '../../../shared/payroll-core/payrollTypes';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const WorkWeekSettings: React.FC = () => {
  const { data, refetch } = useWorkWeekConfig();
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_WORK_WEEK.working_days);
  const [weekendDays, setWeekendDays] = useState<number[]>(DEFAULT_WORK_WEEK.weekend_days);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (data) {
      setWorkingDays(data.working_days);
      setWeekendDays(data.weekend_days);
    }
  }, [data]);

  const toggle = (day: number, list: number[], setList: (v: number[]) => void) => {
    setList(list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort());
  };

  const save = async () => {
    setBusy(true);
    setSaved('');
    try {
      await payrollAttendanceApi.updateWorkWeek({ working_days: workingDays, weekend_days: weekendDays });
      setSaved('Saved.');
      void refetch();
    } catch (e) {
      setSaved(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-app-border p-4 space-y-3">
      <h4 className="font-bold">Working days</h4>
      <p className="text-xs text-app-muted">Default: Mon–Sat working, Sunday weekend. Used for payroll working-day counts.</p>
      <div className="flex flex-wrap gap-2">
        {DAY_LABELS.map((label, day) => (
          <button
            key={label}
            type="button"
            onClick={() => toggle(day, workingDays, setWorkingDays)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold border ${workingDays.includes(day) ? 'bg-violet-100 border-violet-300 text-violet-800' : 'border-app-border text-app-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-app-muted">Weekend days (non-working):</p>
      <div className="flex flex-wrap gap-2">
        {DAY_LABELS.map((label, day) => (
          <button
            key={`w-${label}`}
            type="button"
            onClick={() => toggle(day, weekendDays, setWeekendDays)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold border ${weekendDays.includes(day) ? 'bg-amber-100 border-amber-300 text-amber-900' : 'border-app-border text-app-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" disabled={busy} onClick={() => void save()} className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50">
        Save work week
      </button>
      {saved && <p className="text-xs text-app-muted">{saved}</p>}
    </div>
  );
};

export default WorkWeekSettings;
