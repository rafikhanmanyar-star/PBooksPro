import React from 'react';

export type CategoryChip = {
  id: string;
  label: string;
  count?: number;
};

type Props = {
  categories: CategoryChip[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
};

export default function ExecutiveCategoryChips({
  categories,
  activeId,
  onChange,
  ariaLabel = 'Filter categories',
}: Props) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1"
      role="tablist"
      aria-label={ariaLabel}
    >
      {categories.map((cat) => {
        const active = activeId === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold touch-manipulation border transition-colors ${
              active
                ? 'bg-ds-primary text-white border-ds-primary'
                : 'bg-app-card text-app-muted border-app-border/60'
            }`}
          >
            {cat.label}
            {cat.count != null && cat.count > 0 && (
              <span className={`ml-1.5 tabular-nums ${active ? 'opacity-90' : 'opacity-70'}`}>
                ({cat.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
