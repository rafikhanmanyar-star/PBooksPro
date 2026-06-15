import React from 'react';

type Props = {
  values: number[];
  color?: string;
  className?: string;
};

/** Lightweight SVG sparkline — no chart library on mobile. */
export default function ExecutiveSparkline({
  values,
  color = 'rgb(16 185 129)',
  className = '',
}: Props) {
  const data = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 64;
  const h = 28;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`w-full h-7 ${className}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

/** Derive a simple trend series from current value + trend %. */
export function sparklineFromTrend(value: number, trend?: number | null): number[] {
  const t = trend ?? 0;
  const prev = t !== 0 ? value / (1 + t / 100) : value * 0.92;
  const mid = (value + prev) / 2;
  return [prev * 0.98, prev, mid, value * 0.99, value];
}
