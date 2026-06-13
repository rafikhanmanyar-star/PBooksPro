import React from 'react';

type Props = {
  suggestions: string[];
  currentValue: string;
  onSelect: (value: string) => void;
};

export default function FieldSuggestionChips({ suggestions, currentValue, onSelect }: Props) {
  const visible = suggestions.filter(
    (s) => s.trim().length > 0 && s.trim() !== currentValue.trim()
  );
  if (visible.length === 0) return null;

  return (
    <div className="mt-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted mb-1.5">
        Recent
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSelect(s)}
            className="max-w-full truncate px-2.5 py-1.5 rounded-lg text-xs font-medium border border-app-border bg-app-card text-app-text touch-manipulation min-h-[32px] active:bg-app-highlight active:border-ds-primary/40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
