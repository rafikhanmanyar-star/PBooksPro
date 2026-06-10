import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { CURRENCY } from '../../constants';
import type { DashboardChartsResponse, DashboardMetricsResponse } from '../../types/dashboardMetrics.types';

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Download executive KPI rows as CSV. */
export function exportDashboardMetricsCsv(data: DashboardMetricsResponse): void {
  const rows: string[] = [
    'Group,Metric,Value,Previous Value,Trend %,Format',
  ];
  const groups = [
    ['Financial', data.financial],
    ['Real Estate', data.realEstate],
    ['Activity', data.activity],
  ] as const;

  for (const [groupName, metrics] of groups) {
    for (const m of metrics) {
      rows.push(
        [
          escapeCsv(groupName),
          escapeCsv(m.label),
          m.value,
          m.previousValue ?? '',
          m.trendPercent != null ? Math.round(m.trendPercent * 10) / 10 : '',
          m.format,
        ].join(',')
      );
    }
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard-kpis-${data.filters.from}-${data.filters.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function kpiRows(data: DashboardMetricsResponse) {
  const rows: Record<string, string | number>[] = [];
  const groups = [
    ['Financial', data.financial],
    ['Real Estate', data.realEstate],
    ['Activity', data.activity],
  ] as const;
  for (const [groupName, metrics] of groups) {
    for (const m of metrics) {
      rows.push({
        Group: groupName,
        Metric: m.label,
        Value: m.value,
        'Previous Value': m.previousValue ?? '',
        'Trend %': m.trendPercent != null ? Math.round(m.trendPercent * 10) / 10 : '',
        Format: m.format,
      });
    }
  }
  return rows;
}

/** Export KPIs + optional chart summary to Excel workbook. */
export function exportDashboardSnapshotExcel(
  metrics: DashboardMetricsResponse,
  charts?: DashboardChartsResponse | null
): void {
  const sheets: { name: string; rows: Record<string, string | number>[] }[] = [
    { name: 'KPIs', rows: kpiRows(metrics) },
  ];

  if (charts) {
    sheets.push({
      name: 'Revenue vs Expenses',
      rows: charts.revenueVsExpenses.map((p) => ({
        Month: p.label,
        Revenue: p.revenue,
        Expenses: p.expenses,
      })),
    });
    sheets.push({
      name: 'Cash Flow',
      rows: charts.cashFlowTrend.map((p) => ({
        Month: p.label,
        Inflow: p.inflow,
        Outflow: p.outflow,
        Net: p.net,
      })),
    });
    sheets.push({
      name: 'Collections',
      rows: charts.collectionsPerformance.map((p) => ({
        Month: p.label,
        Due: p.due,
        Collected: p.collected,
        Outstanding: p.outstanding,
      })),
    });
  }

  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet.rows), sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `dashboard-snapshot-${metrics.filters.from}-${metrics.filters.to}.xlsx`);
}

function formatMetricValue(value: number, format: string): string {
  if (format === 'percent') return `${Math.round(value * 10) / 10}%`;
  if (format === 'count') return String(Math.round(value));
  return `${CURRENCY} ${Math.round(value).toLocaleString()}`;
}

/** Export executive KPI snapshot as a simple PDF report. */
export function exportDashboardSnapshotPdf(
  metrics: DashboardMetricsResponse,
  charts?: DashboardChartsResponse | null
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;

  doc.setFontSize(14);
  doc.text('PBooks Pro — Executive Dashboard', margin, y);
  y += 18;
  doc.setFontSize(9);
  doc.text(`Period: ${metrics.filters.from} to ${metrics.filters.to}`, margin, y);
  y += 14;
  doc.text(`Generated: ${new Date(metrics.generatedAt).toLocaleString()}`, margin, y);
  y += 22;

  const groups = [
    ['Financial', metrics.financial],
    ['Real Estate', metrics.realEstate],
    ['Activity', metrics.activity],
  ] as const;

  const lineH = 13;
  const maxY = 760;

  for (const [groupName, items] of groups) {
    if (y > maxY - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(11);
    doc.text(groupName, margin, y);
    y += lineH;
    doc.setFontSize(9);
    for (const m of items) {
      if (y > maxY) {
        doc.addPage();
        y = margin;
      }
      const trend =
        m.trendPercent != null ? ` (${m.trendPercent >= 0 ? '+' : ''}${Math.round(m.trendPercent * 10) / 10}%)` : '';
      doc.text(
        `${m.label}: ${formatMetricValue(m.value, m.format)}${trend}`,
        margin + 8,
        y
      );
      y += lineH;
    }
    y += 6;
  }

  if (charts?.revenueVsExpenses?.length) {
    if (y > maxY - 60) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(11);
    doc.text('Revenue vs Expenses (summary)', margin, y);
    y += lineH;
    doc.setFontSize(9);
    const slice = charts.revenueVsExpenses.slice(-6);
    for (const p of slice) {
      if (y > maxY) {
        doc.addPage();
        y = margin;
      }
      doc.text(
        `${p.label}: Rev ${Math.round(p.revenue).toLocaleString()} / Exp ${Math.round(p.expenses).toLocaleString()}`,
        margin + 8,
        y
      );
      y += lineH;
    }
  }

  doc.save(`dashboard-snapshot-${metrics.filters.from}-${metrics.filters.to}.pdf`);
}
