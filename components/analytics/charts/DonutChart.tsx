import React, { memo, useMemo } from 'react';
import { Cell, Legend, Pie, PieChart, Tooltip } from 'recharts';
import { CHART_COLORS, useChartTheme } from '../chartTheme';
import { FixedSizeChartContainer } from './FixedSizeChartContainer';

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  height?: number;
  innerRadius?: number | string;
  emptyLabel?: string;
  valueFormatter?: (v: number) => string;
}

export const DonutChart: React.FC<DonutChartProps> = memo(function DonutChart({
  data,
  height = 280,
  innerRadius = '58%',
  emptyLabel = 'No breakdown data.',
  valueFormatter = (v) => String(v),
}) {
  const theme = useChartTheme();
  const filtered = data.filter((d) => d.value > 0);

  const tooltipStyle = useMemo(
    () => ({
      borderRadius: 12,
      border: `1px solid ${theme.tooltipBorder}`,
      backgroundColor: theme.tooltipBg,
      color: theme.tooltipText,
    }),
    [theme.tooltipBorder, theme.tooltipBg, theme.tooltipText],
  );

  if (!filtered.length) {
    return (
      <div className="flex items-center justify-center text-sm text-app-muted" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <FixedSizeChartContainer height={height}>
      <PieChart>
        <Pie
          data={filtered}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius="80%"
          paddingAngle={2}
          isAnimationActive={false}
        >
          {filtered.map((entry, i) => (
            <Cell key={entry.name} fill={entry.color ?? CHART_COLORS.donut[i % CHART_COLORS.donut.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [valueFormatter(value), name]}
        />
        <Legend />
      </PieChart>
    </FixedSizeChartContainer>
  );
});

export default DonutChart;
