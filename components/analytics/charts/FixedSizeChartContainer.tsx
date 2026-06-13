import React, { memo } from 'react';
import { ResponsiveContainer } from 'recharts';

interface FixedSizeChartContainerProps {
  height: number;
  children: React.ReactElement;
}

/** Fixed-height wrapper so Recharts measures a stable box and avoids resize update loops. */
export const FixedSizeChartContainer = memo(function FixedSizeChartContainer({
  height,
  children,
}: FixedSizeChartContainerProps) {
  return (
    <div className="w-full min-w-0 relative" style={{ height, minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
        {children}
      </ResponsiveContainer>
    </div>
  );
});

export default FixedSizeChartContainer;
