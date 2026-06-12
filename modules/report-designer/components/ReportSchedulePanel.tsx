import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createReportSchedule,
  deleteReportSchedule,
  fetchReportSchedules,
  updateReportSchedule,
  type ReportSchedule,
} from '../../../services/api/reportDesignerApi';

type Props = {
  definitionId: string | null;
  definitionName?: string;
};

const CADENCE_OPTIONS: ReportSchedule['cadence'][] = ['daily', 'weekly', 'monthly', 'quarterly'];
const FORMAT_OPTIONS: ReportSchedule['exportFormat'][] = ['xlsx', 'csv', 'pdf'];

const ReportSchedulePanel: React.FC<Props> = ({ definitionId, definitionName }) => {
  const queryClient = useQueryClient();
  const [cadence, setCadence] = useState<ReportSchedule['cadence']>('weekly');
  const [exportFormat, setExportFormat] = useState<ReportSchedule['exportFormat']>('xlsx');
  const [recipientsText, setRecipientsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ['reportSchedules', definitionId],
    queryFn: () => fetchReportSchedules(definitionId!),
    enabled: Boolean(definitionId),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const recipients = recipientsText
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return createReportSchedule({
        reportDefinitionId: definitionId!,
        cadence,
        recipients,
        exportFormat,
      });
    },
    onSuccess: () => {
      setRecipientsText('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['reportSchedules', definitionId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReportSchedule(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reportSchedules', definitionId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (s: ReportSchedule) =>
      updateReportSchedule(s.id, { isActive: !s.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reportSchedules', definitionId] });
    },
  });

  if (!definitionId) {
    return (
      <section className="border border-app-border rounded-xl bg-app-card p-3 text-xs text-app-muted">
        Save this report first to schedule email delivery.
      </section>
    );
  }

  const schedules = schedulesQuery.data ?? [];

  return (
    <section className="border border-app-border rounded-xl bg-app-card flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-app-border text-xs font-bold uppercase tracking-wide text-app-muted">
        Email schedule
        {definitionName ? ` — ${definitionName}` : ''}
      </div>
      <div className="p-3 space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-app-muted">Cadence</span>
            <select
              className="rounded-lg border border-app-border bg-app-input px-2 py-1"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as ReportSchedule['cadence'])}
            >
              {CADENCE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-app-muted">Format</span>
            <select
              className="rounded-lg border border-app-border bg-app-input px-2 py-1"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ReportSchedule['exportFormat'])}
            >
              {FORMAT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-app-muted">Recipients (comma-separated emails)</span>
          <textarea
            className="rounded-lg border border-app-border bg-app-input px-2 py-1 min-h-[52px]"
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder="finance@company.com, admin@company.com"
          />
        </label>
        {error && <p className="text-ds-danger">{error}</p>}
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-50"
          disabled={createMutation.isPending || !recipientsText.trim()}
          onClick={() => createMutation.mutate()}
        >
          Add schedule
        </button>
        {schedules.length > 0 && (
          <ul className="space-y-1 pt-2 border-t border-app-border">
            {schedules.map((s) => (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1 ${
                  s.isActive ? 'border-app-border' : 'border-app-border opacity-60'
                }`}
              >
                <span className="truncate">
                  {s.cadence} · {s.exportFormat.toUpperCase()} · {s.recipients.join(', ')}
                  {!s.isActive && <span className="text-app-muted ml-1">(paused)</span>}
                  {s.nextRunAt && s.isActive && (
                    <span className="text-app-muted ml-1">· next {new Date(s.nextRunAt).toLocaleDateString()}</span>
                  )}
                </span>
                <span className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    className="text-indigo-600 px-1"
                    onClick={() => toggleMutation.mutate(s)}
                  >
                    {s.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    className="text-red-600 px-1"
                    onClick={() => deleteMutation.mutate(s.id)}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-app-muted">
          Requires API env: REPORT_SCHEDULER=true and REPORT_EMAIL_SEND_ENABLED=true with SMTP configured.
        </p>
      </div>
    </section>
  );
};

export default ReportSchedulePanel;
