import React, { useMemo, useState } from 'react';
import { ICONS } from '../../../constants';
import type { CatalogItem } from '../hooks/useQuickCaptureCatalog';

type Props = {
  label: string;
  placeholder?: string;
  items: CatalogItem[];
  selectedId: string;
  onSelect: (item: CatalogItem) => void;
  autoFocus?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
};

export default function QuickCaptureEntityPicker({
  label,
  placeholder = 'Search…',
  items,
  selectedId,
  onSelect,
  autoFocus = false,
  loading = false,
  emptyMessage = 'No matches found',
  onRetry,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items.slice(0, 50);
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          item.subtitle?.toLowerCase().includes(term) ||
          item.id.toLowerCase().includes(term)
      )
      .slice(0, 50);
  }, [items, search]);

  return (
    <div className="qc-detail-section">
      <label className="qc-detail-section-label">{label}</label>
      <div className="relative mb-2">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted pointer-events-none">
          {ICONS.search}
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-app-border bg-app-input text-app-text text-sm"
        />
      </div>
      {loading && <p className="text-xs text-app-muted px-1">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="px-1 py-2 space-y-2">
          <p className="text-xs text-app-muted">{emptyMessage}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-semibold text-ds-primary touch-manipulation"
            >
              Retry
            </button>
          )}
        </div>
      )}
      <ul className="qc-entity-list max-h-48 overflow-y-auto overscroll-contain space-y-1">
        {filtered.map((item) => {
          const selected = item.id === selectedId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className={`qc-entity-item touch-manipulation w-full text-left ${
                  selected ? 'qc-entity-item--selected' : ''
                }`}
              >
                <span className="font-medium text-sm text-app-text truncate">{item.name}</span>
                {item.subtitle && (
                  <span className="text-xs text-app-muted truncate block">{item.subtitle}</span>
                )}
                {selected && (
                  <span className="qc-entity-check shrink-0 w-5 h-5">{ICONS.checkCircle}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
