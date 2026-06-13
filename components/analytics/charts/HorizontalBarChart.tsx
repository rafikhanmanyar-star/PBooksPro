import React, { memo, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CURRENCY } from '../../../constants';
import { formatRoundedNumber } from '../../../utils/numberUtils';
import { CHART_COLORS, useChartTheme } from '../chartTheme';
import { FixedSizeChartContainer } from './FixedSizeChartContainer';

export interface HorizontalBarPoint {
  label: string;
  value: number;
}

export interface HorizontalBarChartProps {
  data: HorizontalBarPoint[];
  height?: number;
  emptyLabel?: string;
  formatValue?: (v: number) => string;
}

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = memo(function HorizontalBarChart({
  data,
  height = 280,
  emptyLabel = 'No aging data available.',
  formatValue = (v) => `${CURRENCY} ${formatRoundedNumber(v)}`,
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

  const chartData = data.map((d) => ({ name: d.label, value: d.value }));

  return (
    <FixedSizeChartContainer height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.grid} />
        <XAxis
          type="number"
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.tick, fontSize: 11 }}
          tickFormatter={(v) => formatRoundedNumber(Number(v))}
        />
        <YAxis
          type="category"
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.tick, fontSize: 11 }}
          width={72}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number) => [formatValue(value), 'Amount']}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS.aging[i % CHART_COLORS.aging.length]} />
          ))}
        </Bar>
      </BarChart>
    </FixedSizeChartContainer>
  );
});

export default HorizontalBarChart;
