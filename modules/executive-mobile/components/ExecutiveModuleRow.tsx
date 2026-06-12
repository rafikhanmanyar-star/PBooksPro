import React, { type ReactNode } from 'react';
import { ICONS } from '../../../constants';

type Props = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  phase?: string;
};

export default function ExecutiveModuleRow({ label, icon, onClick, disabled, phase }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border border-app-border bg-white dark:bg-app-card shadow-sm touch-manipulation text-left ${
        disabled ? 'opacity-60' : 'active:bg-emerald-50/50 dark:active:bg-emerald-950/20'
      }`}
    >
      <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 shrink-0">
        <span className="w-5 h-5">{icon}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="text-sm font-medium text-app-text block truncate">{label}</span>
        {phase && <span className="text-[10px] text-app-muted">{phase}</span>}
      </span>
      <span className="w-5 h-5 text-app-muted shrink-0">{ICONS.chevronRight}</span>
    </button>
  );
}
