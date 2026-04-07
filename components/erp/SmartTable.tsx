import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List } from 'react-window';
import { useDebounced } from './useDebounced';
import { InlineEditableCell, type SaveStatus } from './InlineEditableCell';
import { TableSkeleton } from './TableSkeleton';

export interface SmartColumnDef<T> {
  id: string;
  header: string;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Right-align + optional footer sum */
  numeric?: boolean;
  editable?: boolean;
  accessor: (row: T) => unknown;
  format?: (v: unknown) => string;
  parse?: (raw: string) => unknown;
  validate?: (value: unknown, row: T) => string | null;
  /** Include in footer sum (numeric columns) */
  sum?: boolean;
  /** Custom cell (disables default inline edit) */
  render?: (row: T, rowIndex: number) => React.ReactNode;
}

export type CellSaveState = {
  status: SaveStatus;
  error?: string;
};

export interface SmartTableProps<T> {
  columns: SmartColumnDef<T>[];
  data: T[];
  getRowId: (row: T, index: number) => string;
  loading?: boolean;
  /** Use react-window when true or when data length exceeds threshold */
  virtualize?: boolean;
  virtualizeThreshold?: number;
  rowHeight?: number;
  tableHeight?: number;
  className?: string;
  /** Debounced global filter on stringified row */
  searchPlaceholder?: string;
  searchDebounceMs?: number;
  /** Persist cell edit — await before showing Saved */
  onSaveCell?: (rowId: string, columnId: string, value: unknown, row: T) => Promise<void>;
  /** Optional bulk save (e.g. Ctrl+S) */
  onSaveAll?: () => Promise<void>;
  /** Sticky summary row */
  showFooterSum?: boolean;
}

function defaultFormat(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return String(v);
}

function defaultParse(raw: string): unknown {
  const t = raw.trim();
  if (t === '') return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : raw;
}

export function SmartTable<T>(props: SmartTableProps<T>) {
  const {
    columns,
    data,
    getRowId,
    loading = false,
    virtualize,
    virtualizeThreshold = 60,
    rowHeight = 40,
    tableHeight = 420,
    className = '',
    searchPlaceholder = 'Search…',
    searchDebounceMs = 200,
    onSaveCell,
    onSaveAll,
    showFooterSum = true,
  } = props;

  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, searchDebounceMs);
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    for (const c of columns) w[c.id] = c.width ?? 140;
    return w;
  });
  const resizeRef = useRef<{ colId: string; startX: number; startW: number } | null>(null);

  const [cellSave, setCellSave] = useState<Record<string, CellSaveState>>({});

  const setSave = useCallback((key: string, patch: CellSaveState) => {
    setCellSave((prev) => ({ ...prev, [key]: patch }));
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => {
      const s = columns
        .map((c) => defaultFormat(c.accessor(row)))
        .join(' ')
        .toLowerCase();
      return s.includes(q);
    });
  }, [data, debouncedSearch, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.col);
    if (!col || !col.sortable) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = col.accessor(a);
      const vb = col.accessor(b);
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, columns]);

  const doVirtual = virtualize ?? sorted.length > virtualizeThreshold;

  const gridTemplate = useMemo(() => {
    return columns.map((c) => `${widths[c.id] ?? c.width ?? 140}px`).join(' ');
  }, [columns, widths]);

  const footerSums = useMemo(() => {
    if (!showFooterSum) return null;
    const sums: Record<string, number> = {};
    for (const c of columns) {
      if (!c.numeric || !c.sum) continue;
      let s = 0;
      for (const row of sorted) {
        const v = c.accessor(row);
        if (typeof v === 'number' && Number.isFinite(v)) s += v;
      }
      sums[c.id] = s;
    }
    return sums;
  }, [columns, sorted, showFooterSum]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (onSaveAll) void onSaveAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSaveAll]);

  const handleResizeStart = (colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { colId, startX: e.clientX, startW: widths[colId] ?? 140 };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const delta = ev.clientX - r.startX;
      const col = columns.find((c) => c.id === r.colId);
      const min = col?.minWidth ?? 64;
      const next = Math.max(min, r.startW + delta);
      setWidths((prev) => ({ ...prev, [r.colId]: next }));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const headerSort = (colId: string) => {
    const c = columns.find((x) => x.id === colId);
    if (!c?.sortable) return;
    setSort((prev) => {
      if (!prev || prev.col !== colId) return { col: colId, dir: 'asc' };
      if (prev.dir === 'asc') return { col: colId, dir: 'desc' };
      return null;
    });
  };

  const renderCell = useCallback((row: T, rowIndex: number, col: SmartColumnDef<T>) => {
    const rowId = getRowId(row, rowIndex);
    const raw = col.accessor(row);
    const fmt = col.format ?? defaultFormat;
    const parse = col.parse ?? defaultParse;
    const align = col.numeric ? 'right' : col.align ?? 'left';

    const neg =
      col.numeric && typeof raw === 'number' && raw < 0 ? 'text-app-error' : '';

    if (col.render) {
      return (
        <div key={col.id} className={`min-w-0 px-1 py-1 border-b border-app-border ${neg}`} style={{ textAlign: align }}>
          {col.render(row, rowIndex)}
        </div>
      );
    }

    if (col.editable && onSaveCell) {
      const key = `${rowId}:${col.id}`;
      const st = cellSave[key];
      return (
        <div key={col.id} className={`min-w-0 border-b border-app-border ${neg}`}>
          <InlineEditableCell
            value={raw as string | number}
            format={fmt}
            parse={parse}
            align={align}
            validate={(v) => (col.validate ? col.validate(v, row) : null)}
            saveStatus={st?.status ?? 'idle'}
            saveError={st?.error}
            onRetry={() => {
              /* re-open edit: user clicks cell again */
            }}
            onCommit={async (parsed) => {
              setSave(key, { status: 'saving' });
              try {
                await onSaveCell(rowId, col.id, parsed, row);
                setSave(key, { status: 'saved' });
                window.setTimeout(() => setSave(key, { status: 'idle' }), 1200);
              } catch (err) {
                setSave(key, {
                  status: 'error',
                  error: err instanceof Error ? err.message : 'Save failed',
                });
                throw err;
              }
            }}
          />
        </div>
      );
    }

    const text = fmt(raw);
    return (
      <div
        key={col.id}
        className={`min-w-0 px-2 py-2 border-b border-app-border tabular-nums truncate ${neg}`}
        style={{ textAlign: align }}
        title={text}
      >
        {text}
      </div>
    );
  }, [cellSave, columns, getRowId, onSaveCell, setSave]);

  function RowInner({
    row,
    rowIndex,
    style,
    ariaAttributes,
  }: {
    row: T;
    rowIndex: number;
    style?: React.CSSProperties;
    ariaAttributes?: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
  }) {
    return (
      <div
        {...(ariaAttributes ?? {})}
        style={{
          ...style,
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          alignItems: 'center',
          minHeight: rowHeight,
          boxSizing: 'border-box',
          background: 'var(--card-bg, #fff)',
        }}
        className="hover:bg-app-table-hover/50"
      >
        {columns.map((col) => (
          <React.Fragment key={col.id}>{renderCell(row, rowIndex, col)}</React.Fragment>
        ))}
      </div>
    );
  }

  function VirtualRow({
    index,
    style,
    rows,
    ariaAttributes,
  }: {
    index: number;
    style: React.CSSProperties;
    rows: T[];
    ariaAttributes?: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
  }) {
    const row = rows[index];
    if (!row) return null;
    return (
      <RowInner row={row} rowIndex={index} style={style} ariaAttributes={ariaAttributes} />
    );
  }

  if (loading) {
    return (
      <div className={className}>
        <TableSkeleton rows={10} columns={Math.max(3, columns.length)} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-ds-sm ${className}`}>
      <input
        type="search"
        className="w-full max-w-md px-ds-md py-2 rounded-ds-md border border-app-input-border bg-app-input text-app-text text-ds-body"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Filter table"
      />

      <div className="rounded-ds-md border border-app-border overflow-hidden bg-app-card">
        {/* Header */}
        <div
          className="grid sticky top-0 z-20 border-b border-app-border bg-app-table-header shadow-sm"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {columns.map((col) => (
            <div
              key={col.id}
              className={`relative flex items-center gap-1 px-2 py-2 font-semibold text-ds-small text-app-text select-none ${
                col.sortable ? 'cursor-pointer hover:bg-app-table-hover/60' : ''
              } ${col.numeric ? 'justify-end text-right' : ''}`}
              onClick={() => headerSort(col.id)}
            >
              <span className="truncate">{col.header}</span>
              {sort?.col === col.id && <span className="text-app-muted">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              <button
                type="button"
                aria-label={`Resize ${col.header}`}
                className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-ds-primary/20"
                onMouseDown={(e) => handleResizeStart(col.id, e)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ))}
        </div>

        {/* Body */}
        {doVirtual ? (
          <List
            rowCount={sorted.length}
            rowHeight={rowHeight}
            rowComponent={VirtualRow}
            rowProps={
              {
                rows: sorted,
              } as { rows: T[] }
            }
            style={{ height: tableHeight, width: '100%' }}
            overscanCount={6}
          />
        ) : (
          <div style={{ maxHeight: tableHeight, overflow: 'auto' }}>
            {sorted.map((row, idx) => (
              <RowInner key={getRowId(row, idx)} row={row} rowIndex={idx} style={{}} />
            ))}
          </div>
        )}

        {/* Footer */}
        {showFooterSum && footerSums && Object.keys(footerSums).length > 0 && (
          <div
            className="grid sticky bottom-0 z-10 border-t-2 border-app-border bg-app-table-header/95 font-semibold text-ds-small"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((col) => {
              const v = footerSums[col.id];
              if (v === undefined) {
                return (
                  <div key={col.id} className="px-2 py-2 border-t border-app-border" />
                );
              }
              const neg = v < 0 ? 'text-app-error' : '';
              return (
                <div
                  key={col.id}
                  className={`px-2 py-2 text-right tabular-nums border-t border-app-border ${neg}`}
                >
                  {defaultFormat(v)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {onSaveAll && (
        <p className="text-ds-small text-app-muted">Ctrl+S: save / sync (when provided)</p>
      )}
    </div>
  );
}

export default SmartTable;
