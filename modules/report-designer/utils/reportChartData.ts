import type { GeneratedReportResponse } from '../../../services/api/customReportsApi';
import type { TrendSeriesPoint } from '../../../components/analytics/charts/AreaTrendChart';

export function pickChartSeries(preview: GeneratedReportResponse): {
  labelKey: string;
  valueKey: string;
  valueLabel: string;
} | null {
  const cols = preview.columns;
  if (!cols.length || !preview.rows.length) return null;

  const labelCol =
    cols.find((c) => c.type === 'string' && !c.key.startsWith('agg_') && !c.key.startsWith('g_')) ??
    cols.find((c) => c.type === 'string') ??
    cols[0];
  const valueCol =
    cols.find((c) => c.type === 'number' || c.key.startsWith('agg_')) ??
    cols.find((c) => c.key !== labelCol?.key);

  if (!labelCol || !valueCol) return null;
  return {
    labelKey: labelCol.key,
    valueKey: valueCol.key,
    valueLabel: valueCol.label,
  };
}

export function buildChartDataFromReport(
  preview: GeneratedReportResponse,
  maxRows = 24
): { data: TrendSeriesPoint[]; series: { key: string; label: string }[] } {
  const picked = pickChartSeries(preview);
  if (!picked) return { data: [], series: [] };

  const data = preview.rows.slice(0, maxRows).map((row, i) => {
    const rawName = row[picked.labelKey];
    const name =
      rawName === null || rawName === undefined || String(rawName).trim() === ''
        ? `Row ${i + 1}`
        : String(rawName).slice(0, 32);
    const rawVal = row[picked.valueKey];
    const value = typeof rawVal === 'number' ? rawVal : Number(rawVal ?? 0);
    return { name, [picked.valueKey]: Number.isFinite(value) ? value : 0 };
  });

  return {
    data,
    series: [{ key: picked.valueKey, label: picked.valueLabel }],
  };
}
