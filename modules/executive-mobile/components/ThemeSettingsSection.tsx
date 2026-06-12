import React from 'react';
import { useTheme, type ThemePreference } from '../../../context/ThemeContext';

const OPTIONS: { id: ThemePreference; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'dark', label: 'Dark', icon: '🌙' },
  { id: 'system', label: 'System', icon: '⚙️' },
];

export default function ThemeSettingsSection() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="space-y-2">
      <p className="text-xs text-app-muted">Choose how PBooks Pro looks on this device.</p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setPreference(opt.id)}
            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border touch-manipulation min-h-[72px] transition-colors ${
              preference === opt.id
                ? 'border-ds-primary bg-ds-primary/10 text-app-text ring-2 ring-ds-primary/30'
                : 'border-app-border bg-app-card text-app-muted'
            }`}
            aria-pressed={preference === opt.id}
          >
            <span className="text-xl" aria-hidden>
              {opt.icon}
            </span>
            <span className="text-xs font-semibold">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
