import React, { useEffect, useState } from 'react';
import { Compass, X } from 'lucide-react';
import { isDemoModeActive } from '../../config/demoEnvironment';
import { apiClient } from '../../services/api/client';

const DISMISS_KEY = 'pbooks_demo_explore_banner_dismissed';

type LicenseWarning = { code: string; message: string };

const DemoExploreBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  const [message, setMessage] = useState(
    'Live demo — explore Rental, Project selling, and Project construction with sample data. You can add a limited number of your own transactions.'
  );

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isDemoModeActive() || !apiClient.getToken()) return;
    void apiClient
      .get<{ warnings?: LicenseWarning[] }>('/tenants/license-status')
      .then((status) => {
        const demoWarning = status.warnings?.find((w) => w.code === 'demo_explore');
        if (demoWarning?.message) setMessage(demoWarning.message);
      })
      .catch(() => undefined);
  }, []);

  if (!isDemoModeActive() || dismissed) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm shadow-md shrink-0"
    >
      <Compass className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      <p className="text-center max-w-3xl">{message}</p>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent('pbooks:restart-demo-tour'));
        }}
        className="shrink-0 rounded-md bg-white/15 hover:bg-white/25 px-3 py-1.5 font-semibold transition-colors"
      >
        Guided tour
      </button>
      <a
        href="https://pbookspro.com/#pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-md bg-white/15 hover:bg-white/25 px-3 py-1.5 font-semibold transition-colors"
      >
        Start free trial
      </a>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, '1');
          } catch {
            /* ignore */
          }
        }}
        className="shrink-0 p-1 rounded hover:bg-white/15"
        aria-label="Dismiss demo banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default DemoExploreBanner;
