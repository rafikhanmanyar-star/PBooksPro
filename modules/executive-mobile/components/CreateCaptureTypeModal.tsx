import React, { useState } from 'react';
import { ICONS } from '../../../constants';

import type { MoneyFlow } from '../constants/quickCaptureTypes';
import { moneyFlowDirectionLabel } from '../constants/quickCaptureTypes';

type Props = {
  open: boolean;
  moneyFlow: MoneyFlow;
  onClose: () => void;
  onCreated: (label: string) => void;
};

export default function CreateCaptureTypeModal({ open, moneyFlow, onClose, onCreated }: Props) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError('Enter at least 2 characters');
      return;
    }
    if (trimmed.length > 40) {
      setError('Keep the name under 40 characters');
      return;
    }
    onCreated(trimmed);
    setLabel('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div
        className="w-full max-w-sm rounded-2xl bg-app-card border border-app-border shadow-xl p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-capture-type-title"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="create-capture-type-title" className="text-base font-bold text-app-text">
              New transaction type
            </h2>
            <p className="text-xs text-app-muted mt-0.5">
              Saved on this device for {moneyFlowDirectionLabel(moneyFlow).toLowerCase()} captures. It
              will appear in the list — tap it next time like Suppliers or Staff.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 text-app-muted touch-manipulation"
            aria-label="Close"
          >
            <span className="w-5 h-5">{ICONS.x}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Equipment rental"
            autoFocus
            className="w-full rounded-xl border border-app-border bg-app-input text-app-text text-sm px-3 py-2.5"
          />
          {error && <p className="text-xs text-ds-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-app-border text-sm font-semibold touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-ds-primary text-white text-sm font-semibold touch-manipulation"
            >
              Add type
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
