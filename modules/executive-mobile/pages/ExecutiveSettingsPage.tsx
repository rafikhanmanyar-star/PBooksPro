import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import type { InterfaceMode } from '../../../types/executiveMobile.types';

const MODES: { id: InterfaceMode; label: string; description: string }[] = [
  {
    id: 'auto',
    label: 'Automatic',
    description: 'Executive mode on phones and small screens; full ERP on desktop.',
  },
  {
    id: 'executive_mobile',
    label: 'Executive Mobile Mode',
    description: 'Simplified dashboards, reports, and quick transactions only.',
  },
  {
    id: 'full_erp',
    label: 'Full ERP Mode',
    description: 'Complete accounting system on all devices.',
  },
];

export default function ExecutiveSettingsPage() {
  const { interfaceMode, setInterfaceMode, isCloudEligible } = useExecutiveMode();
  const [saving, setSaving] = React.useState(false);

  if (!isCloudEligible) {
    return (
      <div className="p-4 pb-24">
        <p className="text-sm text-app-muted">Interface mode is available in Cloud Edition only.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-lg font-bold">Interface Mode</h1>
        <p className="text-xs text-app-muted mt-1">Stored per user on the server.</p>
      </div>

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
            className={`w-full text-left p-4 rounded-xl border touch-manipulation ${
              interfaceMode === mode.id
                ? 'border-green-600 bg-green-50 dark:bg-green-950/30'
                : 'border-app-border bg-app-card'
            }`}
          >
            <p className="font-semibold text-app-text">{mode.label}</p>
            <p className="text-xs text-app-muted mt-1">{mode.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
