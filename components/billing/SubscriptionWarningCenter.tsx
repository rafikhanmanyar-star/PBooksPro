import React, { useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  subscriptionBillingApi,
  type LicenseEnforcement,
  type LicenseWarning,
} from '../../services/api/subscriptionBillingApi';
import { isLocalOnlyMode } from '../../config/apiUrl';

const severityStyles: Record<LicenseWarning['severity'], string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  critical: 'border-rose-200 bg-rose-50 text-rose-800',
};

const SubscriptionWarningCenter: React.FC = () => {
  const [data, setData] = useState<LicenseEnforcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLocalOnlyMode()) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const status = await subscriptionBillingApi.getEnforcement();
        setData(status);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load subscription status');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (isLocalOnlyMode()) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Local mode — subscription enforcement is not applied.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const critical = data.warnings.filter((w) => w.severity === 'critical');
  const other = data.warnings.filter((w) => w.severity !== 'critical');

  return (
    <div className="space-y-4">
      {!data.allowed && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
          <h3 className="font-semibold text-rose-900">Action required</h3>
          <ul className="mt-2 list-disc list-inside text-sm text-rose-800 space-y-1">
            {data.blockReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <Button
            className="mt-4"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('navigate-settings', { detail: 'license' }));
            }}
          >
            Manage subscription
          </Button>
        </div>
      )}

      {critical.length > 0 && (
        <div className="space-y-2">
          {critical.map((w) => (
            <div
              key={w.code}
              className={`rounded-lg border px-4 py-3 text-sm ${severityStyles[w.severity]}`}
            >
              {w.message}
            </div>
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-700">Notices</h4>
          {other.map((w) => (
            <div
              key={w.code}
              className={`rounded-lg border px-4 py-3 text-sm ${severityStyles[w.severity]}`}
            >
              {w.message}
            </div>
          ))}
        </div>
      )}

      {data.warnings.length === 0 && data.allowed && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Your subscription is active and within plan limits.
        </div>
      )}
    </div>
  );
};

export default SubscriptionWarningCenter;
