import React, { useEffect, useState } from 'react';
import { fetchSchemaHealth, SchemaHealthResult } from '../../services/database/schemaHealth';
import { EXPECTED_SCHEMA_VERSION } from '../../services/database/expectedSchema';
import { isLocalOnlyMode } from '../../config/apiUrl';

const badgeClass = (level: SchemaHealthResult['level']) => {
  if (level === 'ok') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (level === 'warning') return 'bg-amber-100 text-amber-900 border-amber-200';
  return 'bg-red-100 text-red-900 border-red-200';
};

const DbHealthPanel: React.FC = () => {
  const [health, setHealth] = useState<SchemaHealthResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLocalOnlyMode()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const h = await fetchSchemaHealth();
      if (!cancelled) {
        setHealth(h);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isLocalOnlyMode()) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-slate-500 text-sm">
        Loading database status…
      </div>
    );
  }

  if (!health) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-slate-600 text-sm">
        Schema status is only available when the desktop database is open.
      </div>
    );
  }

  const label =
    health.level === 'ok' ? 'OK' : health.level === 'warning' ? 'WARNING' : 'ERROR';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Database health</h3>
          <p className="text-sm text-slate-500">Local SQLite schema validation and integrity</p>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${badgeClass(health.level)}`}
        >
          {label}
        </span>
      </div>
      <div className="p-6 space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Expected schema version</div>
            <div className="text-lg font-mono font-semibold text-slate-800">{EXPECTED_SCHEMA_VERSION}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Applied version</div>
            <div className="text-lg font-mono font-semibold text-slate-800">{health.version}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <div className="text-xs text-slate-500 uppercase tracking-wide">SQLite integrity</div>
            <div className="text-lg font-semibold text-slate-800">
              {health.integrityOk === false ? 'Failed' : 'OK'}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Write mode</div>
            <div className="text-lg font-semibold text-slate-800">{health.readOnly ? 'Read-only' : 'Read/write'}</div>
          </div>
        </div>

        {health.messages.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Migration / backup log</div>
            <ul className="list-disc list-inside text-slate-700 space-y-0.5">
              {health.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {health.warnings.length > 0 && (
          <div>
            <div className="text-xs font-medium text-amber-700 mb-1">Warnings</div>
            <ul className="list-disc list-inside text-amber-900 space-y-0.5">
              {health.warnings.slice(0, 40).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {health.warnings.length > 40 && (
                <li className="text-slate-500">… and {health.warnings.length - 40} more</li>
              )}
            </ul>
          </div>
        )}

        {health.errors.length > 0 && (
          <div>
            <div className="text-xs font-medium text-red-700 mb-1">Errors</div>
            <ul className="list-disc list-inside text-red-900 space-y-0.5">
              {health.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {health.orphanFkSamples.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">Foreign key samples (not auto-deleted)</div>
            <ul className="list-disc list-inside text-slate-700 space-y-0.5">
              {health.orphanFkSamples.map((o, i) => (
                <li key={i}>
                  {o.table}: {o.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default DbHealthPanel;
