import React, { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_QUICK_ACTIONS,
  QUICK_ACTIONS_STORAGE_KEY,
  type QuickActionDef,
} from '../constants/quickActions';
import type { QuickActionId } from '../../../types/executiveMobile.types';

type Props = {
  onAction: (id: QuickActionId) => void;
};

function loadPinned(): QuickActionId[] {
  try {
    const raw = localStorage.getItem(QUICK_ACTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_ACTIONS.map((a) => a.id);
    const parsed = JSON.parse(raw) as QuickActionId[];
    return parsed.length > 0 ? parsed : DEFAULT_QUICK_ACTIONS.map((a) => a.id);
  } catch {
    return DEFAULT_QUICK_ACTIONS.map((a) => a.id);
  }
}

export default function ExecutiveQuickActionsPanel({ onAction }: Props) {
  const [editing, setEditing] = useState(false);
  const [pinned, setPinned] = useState<QuickActionId[]>(loadPinned);

  const actions = useMemo(() => {
    const map = new Map(DEFAULT_QUICK_ACTIONS.map((a) => [a.id, a]));
    return pinned.map((id) => map.get(id)).filter(Boolean) as QuickActionDef[];
  }, [pinned]);

  const togglePin = useCallback((id: QuickActionId) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <section className="px-4" aria-label="Quick actions">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-app-text">Quick Actions</h2>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-xs font-semibold text-ds-primary touch-manipulation min-h-[32px] px-1"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => !editing && onAction(action.id)}
            className="executive-qa-btn shrink-0 touch-manipulation active:scale-95 transition-transform"
          >
            <span className={`executive-qa-icon ${action.iconClass}`}>{action.icon}</span>
            <span className="text-[10px] font-medium text-app-text mt-2 text-center leading-tight max-w-[4.5rem]">
              {action.label}
            </span>
          </button>
        ))}
      </div>

      {editing && (
        <div className="mt-3 p-3 rounded-xl border border-app-border bg-app-card space-y-2">
          <p className="text-xs text-app-muted">Tap to show/hide shortcuts</p>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_QUICK_ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => togglePin(a.id)}
                className={`text-xs px-3 py-1.5 rounded-full border touch-manipulation ${
                  pinned.includes(a.id)
                    ? 'border-ds-primary bg-ds-primary/10 text-ds-primary'
                    : 'border-app-border text-app-muted'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
