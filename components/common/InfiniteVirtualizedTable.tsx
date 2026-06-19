import React, { memo, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { List, type RowComponentProps } from 'react-window';

const DEFAULT_ROW_HEIGHT = 44;
const DEFAULT_OVERSCAN = 6;
const DEFAULT_LOAD_THRESHOLD = 8;
const FALLBACK_LIST_HEIGHT = 320;

export interface InfiniteVirtualizedTableProps<RowProps extends object> {
  rowCount: number;
  rowHeight?: number;
  minTableWidth?: number;
  overscanCount?: number;
  rowComponent: (props: RowComponentProps<RowProps>) => ReactElement;
  rowProps: RowProps;
  header: ReactNode;
  emptyState?: ReactNode;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
  hasNextPage?: boolean;
  onFetchNextPage?: () => void;
  loadMoreThreshold?: number;
  loadedCount?: number;
  totalCount?: number;
  footerLabel?: string;
}

function InfiniteVirtualizedTableInner<RowProps extends object>({
  rowCount,
  rowHeight = DEFAULT_ROW_HEIGHT,
  minTableWidth = 720,
  overscanCount = DEFAULT_OVERSCAN,
  rowComponent,
  rowProps,
  header,
  emptyState,
  loading = false,
  loadingMore = false,
  error = null,
  hasNextPage = false,
  onFetchNextPage,
  loadMoreThreshold = DEFAULT_LOAD_THRESHOLD,
  loadedCount,
  totalCount,
  footerLabel,
}: InfiniteVirtualizedTableProps<RowProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(FALLBACK_LIST_HEIGHT);
  const fetchLockRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const next = Math.max(rowHeight, Math.floor(entry.contentRect.height));
        setHeight(next);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowHeight]);

  useEffect(() => {
    if (!loadingMore) {
      fetchLockRef.current = false;
    }
  }, [loadingMore]);

  const handleRowsRendered = useCallback(
    (visible: { startIndex: number; stopIndex: number }) => {
      if (!hasNextPage || loading || loadingMore || !onFetchNextPage || rowCount === 0) return;
      if (fetchLockRef.current) return;
      if (visible.stopIndex >= rowCount - loadMoreThreshold) {
        fetchLockRef.current = true;
        onFetchNextPage();
      }
    },
    [hasNextPage, loading, loadingMore, loadMoreThreshold, onFetchNextPage, rowCount]
  );

  if (error && rowCount === 0 && !loading) {
    return (
      <div className="flex flex-col flex-grow min-h-0 h-full overflow-hidden">
        {header}
        <div className="flex flex-col items-center justify-center py-12 text-red-600 flex-grow gap-2">
          <p className="text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!loading && rowCount === 0) {
    return (
      <div className="flex flex-col flex-grow min-h-0 h-full overflow-hidden">
        {header}
        {emptyState ?? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 flex-grow">
            <p>No rows found.</p>
          </div>
        )}
      </div>
    );
  }

  const showCountFooter = totalCount != null || loadedCount != null || hasNextPage;

  return (
    <div className="flex flex-col flex-grow min-h-0 h-full overflow-hidden">
      {header}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-x-auto relative">
        {loading && rowCount === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-hidden />
            <span className="sr-only">Loading…</span>
          </div>
        ) : null}
        <List<RowProps>
          rowCount={rowCount}
          rowHeight={rowHeight}
          overscanCount={overscanCount}
          rowComponent={rowComponent}
          rowProps={rowProps}
          onRowsRendered={handleRowsRendered}
          style={{ height, width: '100%', minWidth: minTableWidth }}
        />
        {loadingMore ? (
          <div className="absolute bottom-2 right-3 flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm border border-slate-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading more…
          </div>
        ) : null}
      </div>
      {showCountFooter ? (
        <div className="flex-shrink-0 border-t border-slate-200 px-3 py-2 flex items-center justify-between gap-3 bg-slate-50 text-[10px] md:text-xs text-slate-500 font-medium">
          <span>
            {footerLabel ?? 'Showing'}{' '}
            {(loadedCount ?? rowCount).toLocaleString()}
            {totalCount != null ? ` of ${totalCount.toLocaleString()}` : ''}
          </span>
          {error ? <span className="text-red-600 truncate">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

const InfiniteVirtualizedTable = memo(
  InfiniteVirtualizedTableInner
) as typeof InfiniteVirtualizedTableInner;

export default InfiniteVirtualizedTable;
