import React, { useState } from 'react';
import { useExecutiveMode } from '../../context/ExecutiveModeContext';
import type { InterfaceMode } from '../../types/executiveMobile.types';

const MODES: { id: InterfaceMode; label: string; description: string }[] = [
  {
    id: 'auto',
    label: 'Automatic',
    description: 'Executive mode on phones; full ERP on desktop.',
  },
  {
    id: 'executive_mobile',
    label: 'Executive Mobile Mode',
    description: 'Dashboards, reports, and quick field transactions only.',
  },
  {
    id: 'full_erp',
    label: 'Full ERP Mode',
    description: 'Complete accounting on all screen sizes.',
  },
];

export default function InterfaceModeSettingsSection() {
  const { interfaceMode, setInterfaceMode } = useExecutiveMode();
  const [saving, setSaving] = useState(false);

  return (
    <div className="p-5 bg-app-card rounded-xl border border-app-border shadow-ds-card">
      <h4 className="font-semibold text-app-text mb-1">Interface mode</h4>
      <p className="text-sm text-app-muted mb-4">
        Cloud Edition only. Choose executive mobile experience vs full ERP. Saved per user on the server.
      </p>
      <div className="space-y-2">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await setInterfaceMode(mode.id);
              } finally {
                setSaving(false);
              }
            }}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              interfaceMode === mode.id
                ? 'border-ds-primary bg-app-highlight'
                : 'border-app-border hover:border-ds-primary/40'
            }`}
          >
            <p className="font-medium text-app-text text-sm">{mode.label}</p>
            <p className="text-xs text-app-muted mt-0.5">{mode.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
