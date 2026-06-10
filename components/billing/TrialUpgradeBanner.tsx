import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  subscriptionBillingApi,
  type BillingPortalSummary,
} from '../../services/api/subscriptionBillingApi';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { usePermissions } from '../../hooks/usePermissions';
import { useDispatchOnly } from '../../hooks/useSelectiveState';

const DISMISS_KEY = 'pbooks_trial_banner_dismissed';

const TrialUpgradeBanner: React.FC = () => {
  const [portal, setPortal] = useState<BillingPortalSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { canAccessBillingPortal } = usePermissions();
  const dispatch = useDispatchOnly();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isLocalOnlyMode() || !canAccessBillingPortal) return;
    void subscriptionBillingApi.getPortal().then(setPortal).catch(() => undefined);
  }, [canAccessBillingPortal]);

  if (isLocalOnlyMode() || !canAccessBillingPortal || dismissed || !portal) return null;
  if (portal.paymentStatus !== 'trialing') return null;

  const daysRaw = portal.daysRemaining;
  const days =
    typeof daysRaw === 'number' ? daysRaw : parseInt(String(daysRaw).replace(/\D/g, ''), 10) || 0;

  const openUpgrade = () => {
    dispatch({ type: 'SET_PAGE', payload: 'settings' });
    window.dispatchEvent(new CustomEvent('open-billing-upgrade'));
  };

  return (
    <div
      role="status"
      className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm shadow-md z-[10030]"
    >
      <Sparkles className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      <p className="flex-1 min-w-0">
        <span className="font-semibold">Free trial</span>
        {' — '}
        {days > 0 ? (
          <>
            <span>{days} day{days === 1 ? '' : 's'} left</span>. Upgrade to keep your data and team access.
          </>
        ) : (
          <>Your trial ends today. Upgrade now to avoid interruption.</>
        )}
      </p>
      <button
        type="button"
        onClick={openUpgrade}
        className="shrink-0 rounded-md bg-white/15 hover:bg-white/25 px-3 py-1.5 font-semibold transition-colors"
      >
        Upgrade plan
      </button>
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
        aria-label="Dismiss trial banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default TrialUpgradeBanner;
