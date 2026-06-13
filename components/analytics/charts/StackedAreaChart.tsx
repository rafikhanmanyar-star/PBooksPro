import React, { memo, useMemo } from 'react';
import {
  Area,
  AreaChart,
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

export interface StackedAreaChartProps {
  data: TrendSeriesPoint[];
  series: { key: string; label: string; color?: string; stackId?: string }[];
  height?: number;
  emptyLabel?: string;
}

export const StackedAreaChart: React.FC<StackedAreaChartProps> = memo(function StackedAreaChart({
  data,
  series,
  height = 280,
  emptyLabel = 'No cash flow data for this period.',
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
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
        {series.map((s, i) => {
          const colors = [CHART_COLORS.inflow, CHART_COLORS.outflow, CHART_COLORS.net];
          const color = s.color ?? colors[i % colors.length];
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId={s.stackId ?? 'stack'}
              stroke={color}
              fill={color}
              fillOpacity={0.35}
              strokeWidth={2}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </FixedSizeChartContainer>
  );
});

export default StackedAreaChart;
