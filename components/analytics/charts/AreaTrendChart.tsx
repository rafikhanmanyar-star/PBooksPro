import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CURRENCY } from '../../../constants';
import { formatRoundedNumber } from '../../../utils/numberUtils';
import { CHART_COLORS, useChartTheme } from '../chartTheme';

export interface TrendSeriesPoint {
  name: string;
  [key: string]: string | number;
}

export interface AreaTrendChartProps {
  data: TrendSeriesPoint[];
  series: { key: string; label: string; color?: string }[];
  height?: number;
  emptyLabel?: string;
}

export const AreaTrendChart: React.FC<AreaTrendChartProps> = ({
  data,
  series,
  height = 280,
  emptyLabel = 'No data for this period.',
}) => {
  const theme = useChartTheme();

  const gradients = useMemo(
    () =>
      series.map((s, i) => ({
        id: `areaGrad-${s.key}-${i}`,
        color: s.color ?? CHART_COLORS.donut[i % CHART_COLORS.donut.length],
      })),
    [series]
  );

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-app-muted" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" debounce={32}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {gradients.map((g) => (
              <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={g.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={g.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
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
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${theme.tooltipBorder}`,
              backgroundColor: theme.tooltipBg,
              color: theme.tooltipText,
            }}
            formatter={(value: number, name: string) => [`${CURRENCY} ${formatRoundedNumber(value)}`, name]}
          />
          <Legend />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? CHART_COLORS.donut[i % CHART_COLORS.donut.length]}
              fill={`url(#${gradients[i].id})`}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AreaTrendChart;
