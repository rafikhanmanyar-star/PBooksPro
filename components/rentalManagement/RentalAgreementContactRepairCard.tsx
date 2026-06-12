import React, { useMemo, useState } from 'react';
import { useDispatchOnly, useRentalAgreements } from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { computeRentalAgreementContactRepairs } from '../../services/repairRentalAgreementContact';
import type { AppAction } from '../../types';
import Button from '../ui/Button';

/**
 * One-click repair when rental agreements lost tenant contact_id after an old property-transfer bug.
 * API mode: runs server SQL + sync. Local-only: patches in-memory rows from previous_agreement chain.
 */
const RentalAgreementContactRepairCard: React.FC = () => {
  const rentalAgreements = useRentalAgreements();
  const dispatch = useDispatchOnly();
  const { isAuthenticated } = useAuth();
  const { showToast, showConfirm } = useNotification();
  const [busy, setBusy] = useState(false);

  const localPatches = useMemo(
    () => computeRentalAgreementContactRepairs(rentalAgreements),
    [rentalAgreements]
  );

  const useApi = !isLocalOnlyMode() && isAuthenticated;

  const run = async () => {
    if (useApi) {
      const ok = await showConfirm(
        'Fix agreements that are missing a tenant but have a previous agreement in the chain? This updates the server database.',
        { title: 'Repair tenant link', confirmLabel: 'Repair', cancelLabel: 'Cancel' }
      );
      if (!ok) return;
      setBusy(true);
      try {
        const api = getAppStateApiService();
        const { updated, agreements } = await api.repairRentalAgreementsMissingContactFromPrevious();
        for (const a of agreements) {
          dispatch({ type: 'UPDATE_RENTAL_AGREEMENT', payload: a, _isRemote: true } as AppAction);
        }
        showToast(
          updated === 0 ? 'No agreements needed repair.' : `Updated ${updated} agreement(s).`,
          updated === 0 ? 'info' : 'success'
        );
      } catch (e: unknown) {
        const err = e as { message?: string };
        showToast(err?.message || 'Repair failed.', 'error');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (localPatches.length === 0) {
      showToast('No agreements need repair.', 'info');
      return;
    }
    const ok = await showConfirm(
      `Update ${localPatches.length} agreement(s) with the tenant from the linked previous agreement?`,
      { title: 'Repair tenant link', confirmLabel: 'Repair', cancelLabel: 'Cancel' }
    );
    if (!ok) return;
    setBusy(true);
    try {
      for (const { agreement, contactId } of localPatches) {
        dispatch({ type: 'UPDATE_RENTAL_AGREEMENT', payload: { ...agreement, contactId } });
      }
      showToast(`Updated ${localPatches.length} agreement(s).`, 'success');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border border-ds-danger/30 rounded-lg p-4 bg-[color:var(--badge-unpaid-bg)]/25">
      <h3 className="text-sm font-semibold text-app-text mb-1">
        Repair: missing tenant on agreement
      </h3>
      <p className="text-xs text-app-muted mb-3 leading-relaxed">
        If a row shows &quot;—&quot; for tenant after an ownership transfer, run this to copy the tenant from the
        previous agreement when the chain is available. New transfers already include the fix in code.
      </p>
      {!useApi && localPatches.length > 0 && (
        <p className="text-xs text-app-muted mb-2">{localPatches.length} agreement(s) can be fixed in local data.</p>
      )}
      <Button type="button" variant="secondary" disabled={busy} onClick={run} className="text-sm">
        {busy ? 'Working…' : 'Repair agreements'}
      </Button>
    </div>
  );
};

export default RentalAgreementContactRepairCard;
