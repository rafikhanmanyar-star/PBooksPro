import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { useNotification } from '../context/NotificationContext';
import { RentalAgreementStatus } from '../types';
import { toLocalDateString } from '../utils/dateUtils';
import { agreementDateToYmd, runAutoLeaseRenewalForAgreement } from '../services/rentalAgreementRenewalService';

/**
 * On the rental agreements view, when an active agreement has `autoRenewLease` and the end date is before
 * today, create the next term automatically (same pattern as manual renew: old → Renewed, new → Active, no
 * security/broker; first month rent invoice is generated).
 */
export function useRentalAutoRenewal(): void {
  const { state, dispatch } = useAppContext();
  const { showToast } = useNotification();
  const running = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (running.current) return;
    const today = toLocalDateString(new Date());
    const candidate = state.rentalAgreements.find(
      (ra) =>
        ra.status === RentalAgreementStatus.ACTIVE &&
        ra.autoRenewLease === true &&
        agreementDateToYmd(ra.endDate) < today
    );
    if (!candidate) return;
    running.current = true;
    void (async () => {
      const snap = stateRef.current;
      try {
        await runAutoLeaseRenewalForAgreement(snap, dispatch, candidate);
        showToast(`Auto-renewed lease ${candidate.agreementNumber} for the new term.`, 'success');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Auto-renewal failed';
        showToast(msg, 'error');
      } finally {
        running.current = false;
      }
    })();
  }, [dispatch, showToast, state.rentalAgreements]);
}
