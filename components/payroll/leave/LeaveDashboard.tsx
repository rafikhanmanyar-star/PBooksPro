import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLeaveRequests } from './hooks/useLeaveQueries';

const LeaveDashboard: React.FC = () => {
  const { data, isLoading } = useLeaveRequests({ limit: 1 }, true);
  const d = data?.dashboard;

  const cards = [
    { label: 'Pending requests', value: d?.pending ?? 0, color: 'text-amber-600' },
    { label: 'Approved requests', value: d?.approved ?? 0, color: 'text-emerald-600' },
    { label: 'Rejected requests', value: d?.rejected ?? 0, color: 'text-red-600' },
    { label: 'On leave today', value: d?.on_leave_today ?? 0, color: 'text-blue-600' },
  ];

  return (
    <div className="space-y-4">
      {isLoading && <Loader2 className="animate-spin text-app-muted" size={20} />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-app-border bg-app-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-app-muted mb-2">{c.label}</p>
            <p className={`text-2xl font-black tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeaveDashboard;
