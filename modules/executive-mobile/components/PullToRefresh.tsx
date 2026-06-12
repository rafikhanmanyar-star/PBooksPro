import React, { useCallback, useRef, useState } from 'react';

type Props = {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
};

const THRESHOLD = 72;

export default function PullToRefresh({ onRefresh, children, className = '' }: Props) {
  const [pulling, setPulling] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;
    startY.current = e.touches[0]?.clientY ?? 0;
    setPulling(true);
  }, [refreshing]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling || refreshing) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = Math.max(0, y - startY.current);
      setOffset(Math.min(delta * 0.5, THRESHOLD + 20));
    },
    [pulling, refreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);
    if (offset >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setOffset(THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setOffset(0);
      }
    } else {
      setOffset(0);
    }
  }, [pulling, offset, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-center pointer-events-none transition-all duration-200 z-10"
        style={{ height: offset, opacity: offset > 8 ? 1 : 0 }}
      >
        <span className="text-xs text-app-muted font-medium">
          {refreshing ? 'Refreshing…' : offset >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </div>
      <div
        className="transition-transform duration-200 ease-out"
        style={{ transform: offset > 0 ? `translateY(${offset}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
