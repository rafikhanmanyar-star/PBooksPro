import React, { memo, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CURRENCY } from '../../../constants';
import { formatRoundedNumber } from '../../../utils/numberUtils';
import { CHART_COLORS, useChartTheme } from '../chartTheme';
import type { TrendSeriesPoint } from './AreaTrendChart';
import { FixedSizeChartContainer } from './FixedSizeChartContainer';

export interface ColumnChartProps {
  data: TrendSeriesPoint[];
  series: { key: string; label: string; color?: string }[];
  height?: number;
  emptyLabel?: string;
  stacked?: boolean;
}

export const ColumnChart: React.FC<ColumnChartProps> = memo(function ColumnChart({
  data,
  series,
  height = 280,
  emptyLabel = 'No data for this period.',
  stacked = false,
}) {
  const theme = useChartTheme();

  const tooltipStyle = useMemo(
    () => ({
      borderRadius: 12,
      border: `1px solid ${theme.tooltipBorder}`,
      backgroundColor: theme.tooltipBg,
      color: theme.tooltipText,
    }),
    [theme.tooltipBorder, theme.tooltipBg, theme.tooltipText],
  );

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-app-muted" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <FixedSizeChartContainer height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme.tick, fontSize: 11 }} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.tick, fontSize: 11 }}
          tickFormatter={(v) => formatRoundedNumber(Number(v))}
          width={64}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [`${CURRENCY} ${formatRoundedNumber(value)}`, name]}
        />
        <Legend />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color ?? CHART_COLORS.donut[i % CHART_COLORS.donut.length]}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            stackId={stacked ? 'stack' : undefined}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </FixedSizeChartContainer>
  );
});

export default ColumnChart;
