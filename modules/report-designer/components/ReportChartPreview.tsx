import React, { useMemo } from 'react';
import { ColumnChart } from '../../../components/analytics/charts/ColumnChart';
import type { GeneratedReportResponse } from '../../../services/api/customReportsApi';
import { buildChartDataFromReport } from '../utils/reportChartData';

type Props = {
  preview: GeneratedReportResponse | null;
  height?: number;
  compact?: boolean;
};

const ReportChartPreview: React.FC<Props> = ({ preview, height = 240, compact = false }) => {
  const chartData = useMemo(
    () => (preview ? buildChartDataFromReport(preview) : { data: [], series: [] }),
    [preview]
  );

  if (!preview?.rows.length || chartData.data.length === 0) return null;

  if (compact) {
    return (
      <ColumnChart
        data={chartData.data}
        series={chartData.series}
        height={height}
        emptyLabel="No chart data"
      />
    );
  }

  return (
    <div className="border border-app-border rounded-xl bg-app-card p-3 print:hidden">
      <p className="text-xs font-bold uppercase tracking-wide text-app-muted mb-2">Chart preview</p>
      <ColumnChart data={chartData.data} series={chartData.series} height={height} />
    </div>
  );
};

export default ReportChartPreview;
