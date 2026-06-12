import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchReportDashboardPins,
  type ReportDashboardPin,
} from '../../services/api/reportDesignerApi';
import { generateCustomReport } from '../../services/api/customReportsApi';
import { isLocalOnlyMode } from '../../config/apiUrl';
import ReportChartPreview from '../../modules/report-designer/components/ReportChartPreview';

function buildPinPayload(pin: ReportDashboardPin): Record<string, unknown> {
  const cfg = pin.configuration ?? {};
  const reportType =
    (typeof cfg.reportType === 'string' && cfg.reportType) || pin.reportType || 'tabular';
  const body: Record<string, unknown> = {
    module: pin.module,
    page: 1,
    pageSize: reportType === 'chart' ? 24 : 5,
  };
  if (reportType === 'aging') {
    body.reportType = 'aging';
    return body;
  }
  if (reportType !== 'tabular') body.reportType = reportType;
  if (Array.isArray(cfg.fields) && cfg.fields.length) body.fields = cfg.fields;
  if (Array.isArray(cfg.filters)) body.filters = cfg.filters;
  if (Array.isArray(cfg.groupBy)) body.groupBy = cfg.groupBy;
  if (Array.isArray(cfg.aggregates)) body.aggregates = cfg.aggregates;
  if (Array.isArray(cfg.sortBy)) body.sortBy = cfg.sortBy;
  return body;
}

function PinWidget({ pin }: { pin: ReportDashboardPin }) {
  const reportType =
    (typeof pin.configuration?.reportType === 'string' && pin.configuration.reportType) ||
    pin.reportType ||
    'tabular';
  const isChart = reportType === 'chart';

  const previewQuery = useQuery({
    queryKey: ['dashboardReportPin', pin.reportDefinitionId, reportType],
    queryFn: () => generateCustomReport(buildPinPayload(pin)),
    staleTime: 60_000,
  });

  const data = previewQuery.data;
  const cols = (data?.columns ?? []).slice(0, 4);

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card min-h-[140px]">
      <h4 className="text-sm font-semibold text-app-text truncate mb-2" title={pin.name}>
        {pin.name}
      </h4>
      <p className="text-[10px] text-app-muted uppercase mb-2">
        {pin.module.replace(/_/g, ' ')}
        {isChart ? ' · chart' : ''}
      </p>
      {previewQuery.isLoading && (
        <div className="h-16 rounded-lg bg-app-toolbar/40 animate-pulse" />
      )}
      {previewQuery.isError && (
        <p className="text-xs text-ds-danger">Could not load preview.</p>
      )}
      {data && data.rows.length === 0 && (
        <p className="text-xs text-app-muted">No rows for current filters.</p>
      )}
      {data && data.rows.length > 0 && isChart && (
        <ReportChartPreview preview={data} height={180} compact />
      )}
      {data && data.rows.length > 0 && !isChart && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-app-muted border-b border-app-border">
                {cols.map((c) => (
                  <th key={c.key} className="text-left py-1 pr-2 font-medium truncate max-w-[80px]">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-b border-app-border/50">
                  {cols.map((c) => (
                    <td key={c.key} className="py-1 pr-2 truncate max-w-[80px]">
                      {row[c.key] === null || row[c.key] === undefined ? '—' : String(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.totalCount > 5 && (
            <p className="text-[10px] text-app-muted mt-1">+{data.totalCount - 5} more rows</p>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  enabled?: boolean;
};

const ReportDashboardWidgets: React.FC<Props> = ({ enabled = true }) => {
  const pinsQuery = useQuery({
    queryKey: ['reportDashboardPins'],
    queryFn: fetchReportDashboardPins,
    enabled: enabled && !isLocalOnlyMode(),
  });

  const pins = pinsQuery.data ?? [];
  if (isLocalOnlyMode() || !enabled) return null;
  if (pinsQuery.isLoading) {
    return (
      <div className="h-32 rounded-2xl bg-app-toolbar/40 animate-pulse border border-app-border" />
    );
  }
  if (pins.length === 0) return null;

  return (
    <section className="space-y-3 no-print">
      <h3 className="text-xs md:text-sm font-bold text-app-text uppercase tracking-wide">
        Pinned reports
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pins.map((pin) => (
          <PinWidget key={pin.id} pin={pin} />
        ))}
      </div>
    </section>
  );
};

export default ReportDashboardWidgets;
