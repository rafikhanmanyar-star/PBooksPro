import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { RentalAgreement, RentalAgreementStatus } from '../../types';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';
import Input from '../ui/Input';
import { CURRENCY, ICONS } from '../../constants';
import { getFormBackgroundColorStyle } from '../../utils/formColorUtils';
import { toLocalDateString } from '../../utils/dateUtils';
import { isLocalOnlyMode } from '../../config/apiUrl';
import {
  agreementDateToYmd,
  ymdAddDays,
  ymdAddOneYearMinusOneDay,
  executeRentalRenewal,
} from '../../services/rentalAgreementRenewalService';

interface RentalRenewalFormProps {
  renewFrom: RentalAgreement;
  onClose: () => void;
}

const RentalRenewalForm: React.FC<RentalRenewalFormProps> = ({ renewFrom, onClose }) => {
  const { state, dispatch } = useAppContext();
  const { showToast, showAlert } = useNotification();

  const defaultStart = useMemo(
    () => ymdAddDays(agreementDateToYmd(renewFrom.endDate), 1),
    [renewFrom.endDate]
  );
  const defaultEnd = useMemo(
    () => ymdAddOneYearMinusOneDay(defaultStart),
    [defaultStart]
  );

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [monthlyRent, setMonthlyRent] = useState(
    () => String(renewFrom.monthlyRent != null ? renewFrom.monthlyRent : '')
  );
  const [rentDueDate, setRentDueDate] = useState(
    String(renewFrom.rentDueDate != null ? renewFrom.rentDueDate : 1)
  );
  const [description, setDescription] = useState(renewFrom.description || '');
  const [autoRenewLease, setAutoRenewLease] = useState(renewFrom.autoRenewLease === true);
  const [genFirstRent, setGenFirstRent] = useState(true);
  const [saving, setSaving] = useState(false);

  const buildingId = useMemo(
    () => state.properties.find((p) => p.id === renewFrom.propertyId)?.buildingId || '',
    [state.properties, renewFrom.propertyId]
  );

  const formStyle = useMemo(
    () => getFormBackgroundColorStyle(undefined, buildingId, state),
    [buildingId, state]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rent = parseFloat(monthlyRent) || 0;
    if (rent <= 0) {
      await showAlert('Enter the new monthly rent for the renewed term.');
      return;
    }
    if (!startDate || !endDate) {
      await showAlert('Start and end dates are required.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      await showAlert('End date must be on or after the start date.');
      return;
    }
    if (String(renewFrom.status) !== String(RentalAgreementStatus.ACTIVE)) {
      await showAlert('Only an active agreement can be renewed. Refresh the list and try again.');
      return;
    }
    if (!isLocalOnlyMode() && (renewFrom.version == null || !Number.isFinite(renewFrom.version))) {
      await showAlert('Agreement version is missing. Please refresh the page and try again.');
      return;
    }
    setSaving(true);
    try {
      await executeRentalRenewal(state, dispatch, renewFrom, {
        startDate: toLocalDateString(new Date(startDate)),
        endDate: toLocalDateString(new Date(endDate)),
        monthlyRent: rent,
        rentDueDate: parseInt(rentDueDate, 10) || 1,
        description: description.trim() || undefined,
        autoRenewLease,
        generateFirstMonthRentInvoice: genFirstRent,
      });
      showToast('Agreement renewed. The previous term is marked Renewed.', 'success');
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : err instanceof Error
            ? err.message
            : 'Renewal failed';
      await showAlert(msg, { title: 'Renewal failed' });
    } finally {
      setSaving(false);
    }
  };

  const otherActive = useMemo(
    () =>
      state.rentalAgreements.some(
        (r) =>
          r.propertyId === renewFrom.propertyId &&
          r.id !== renewFrom.id &&
          r.status === RentalAgreementStatus.ACTIVE
      ),
    [state.rentalAgreements, renewFrom]
  );

  if (otherActive) {
    return (
      <div className="p-4 text-sm text-ds-danger" style={formStyle}>
        <p>
          This property has another active agreement. Only one active lease is allowed per property. End or
          resolve the other agreement before renewing.
        </p>
        <Button type="button" variant="secondary" onClick={onClose} className="mt-3 !text-xs">
          Close
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg mx-auto" style={formStyle}>
      <div className="p-3 rounded-lg bg-amber-50/90 border border-amber-200/60 text-amber-900 text-xs">
        <div className="font-bold flex items-center gap-1.5">
          {ICONS.alertTriangle} Renewing {renewFrom.agreementNumber}
        </div>
        <p className="mt-1.5 leading-snug">
          The current term will be set to <strong>Renewed</strong>. A new <strong>Active</strong> agreement
          is created with <strong>no new security deposit or broker fee</strong> (already paid for this
          tenancy). You set the <strong>new monthly rent</strong> and term dates below.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DatePicker
          label="New term start"
          value={startDate}
          onChange={(d) => {
            const ns = toLocalDateString(d);
            setStartDate(ns);
            setEndDate(ymdAddOneYearMinusOneDay(ns));
          }}
          required
        />
        <DatePicker
          label="New term end"
          value={endDate}
          onChange={(d) => setEndDate(toLocalDateString(d))}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Monthly rent (new term)"
          type="number"
          value={monthlyRent}
          onChange={(e) => setMonthlyRent(e.target.value)}
          required
        />
        <Input
          label="Rent due day"
          type="number"
          min={1}
          max={31}
          value={rentDueDate}
          onChange={(e) => setRentDueDate(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          placeholder="Optional"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={autoRenewLease}
          onChange={(e) => setAutoRenewLease(e.target.checked)}
        />
        Auto-renew this new term (same day after end: roll into a new 1-year term, rent unchanged)
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={genFirstRent}
          onChange={(e) => setGenFirstRent(e.target.checked)}
        />
        Generate first month rent invoice (pro-rata if needed; no security invoice)
      </label>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
        <Button type="button" variant="secondary" onClick={onClose} className="!text-xs" disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="!text-xs" disabled={saving}>
          {saving ? 'Working…' : 'Renew & create new term'}
        </Button>
      </div>
    </form>
  );
};

export default RentalRenewalForm;
