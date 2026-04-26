import { toLocalDateString } from '../utils/dateUtils';
import { isLocalOnlyMode } from '../config/apiUrl';
import { RentalAgreementsApiRepository } from './api/repositories/rentalAgreementsApi';
import { normalizeInvoiceFromApi } from './api/repositories/invoicesApi';
import {
  AppState,
  AppAction,
  RentalAgreement,
  RentalAgreementStatus,
  Invoice,
  InvoiceType,
  InvoiceStatus,
} from '../types';
import {
  getOwnershipSharesForPropertyOnDate,
  primaryOwnerIdFromShares,
} from './propertyOwnershipService';
import { Dispatch } from 'react';

/** Calendar day after `ymd` (local). */
export function ymdAddDays(ymd: string, days: number): string {
  const s = (ymd || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

/** Same as new-lease default: one year from start, minus one day. */
export function ymdAddOneYearMinusOneDay(startYmd: string): string {
  const s = (startYmd || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return toLocalDateString(d);
}

function proRataFirstMonthRent(monthlyRent: number, startYmd: string): number {
  const s = (startYmd || '').slice(0, 10);
  const parts = s.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return monthlyRent;
  const [y, mo, d] = parts;
  const daysInMonth = new Date(y, mo, 0).getDate();
  const remainingDays = daysInMonth - d + 1;
  if (remainingDays >= daysInMonth) return monthlyRent;
  return Math.ceil((monthlyRent / daysInMonth) * remainingDays / 100) * 100;
}

function getNextAgreementNumberForState(state: AppState): string {
  const { prefix, padding, nextNumber } = state.agreementSettings;
  let maxNum = nextNumber;
  state.rentalAgreements.forEach((a) => {
    if (a.agreementNumber?.startsWith(prefix)) {
      const numPart = parseInt(a.agreementNumber.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart >= maxNum) maxNum = numPart + 1;
    }
  });
  return `${prefix}${String(maxNum).padStart(padding, '0')}`;
}

function getNextInvNumber(
  startNext: number,
  prefix: string,
  padding: number,
  invoices: AppState['invoices']
): { number: string; afterNext: number } {
  let maxNum = startNext;
  invoices.forEach((inv) => {
    if (inv.invoiceNumber?.startsWith(prefix)) {
      const numPart = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart >= maxNum) maxNum = numPart + 1;
    }
  });
  const number = `${prefix}${String(maxNum).padStart(padding, '0')}`;
  return { number, afterNext: maxNum + 1 };
}

export type RenewalFormInput = {
  startDate: string;
  endDate: string;
  monthlyRent: number;
  rentDueDate: number;
  description?: string;
  autoRenewLease: boolean;
  generateFirstMonthRentInvoice: boolean;
};

/**
 * API or local: renew active lease — old term → Renewed, new term Active, no security/broker.
 */
export async function executeRentalRenewal(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  old: RentalAgreement,
  form: RenewalFormInput
): Promise<void> {
  const newId = Date.now().toString();
  const agreementNumber = getNextAgreementNumberForState(state);
  const prefix = state.agreementSettings.prefix;
  const nextSeq = parseInt(agreementNumber.slice(prefix.length), 10) + 1;

  const d = (form.startDate || '').slice(0, 10);
  const prop = state.properties.find((p) => p.id === old.propertyId);
  const shares = d ? getOwnershipSharesForPropertyOnDate(state, old.propertyId, d) : [];
  const primary = primaryOwnerIdFromShares(shares);
  const ownerId = primary ?? prop?.ownerId ?? old.ownerId;

  if (isLocalOnlyMode()) {
    const oldUpdated: RentalAgreement = {
      ...old,
      status: RentalAgreementStatus.RENEWED,
    };
    dispatch({ type: 'UPDATE_RENTAL_AGREEMENT', payload: oldUpdated });
    const newA: RentalAgreement = {
      id: newId,
      agreementNumber,
      contactId: old.contactId,
      propertyId: old.propertyId,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      monthlyRent: form.monthlyRent,
      rentDueDate: form.rentDueDate,
      status: RentalAgreementStatus.ACTIVE,
      description: form.description,
      securityDeposit: undefined,
      brokerId: undefined,
      brokerFee: undefined,
      ownerId: ownerId || undefined,
      previousAgreementId: old.id,
      autoRenewLease: form.autoRenewLease,
    };
    dispatch({ type: 'ADD_RENTAL_AGREEMENT', payload: newA });
    dispatch({
      type: 'UPDATE_AGREEMENT_SETTINGS',
      payload: { ...state.agreementSettings, nextNumber: nextSeq },
    });
    if (form.generateFirstMonthRentInvoice && form.monthlyRent > 0) {
      const rSet = state.rentalInvoiceSettings;
      const invPrefix = rSet?.prefix || 'INV-';
      const nextNum = rSet?.nextNumber || 1;
      const padding = rSet?.padding || 5;
      const { number: invNum, afterNext } = getNextInvNumber(nextNum, invPrefix, padding, state.invoices);
      const rentCat = state.categories.find((c) => c.name === 'Rental Income');
      const startSlice = (form.startDate || '').slice(0, 10);
      const monthName = new Date(
        startSlice.length >= 10 ? `${startSlice}T12:00:00` : form.startDate
      ).toLocaleString('default', { month: 'long', year: 'numeric' });
      const bId = prop?.buildingId;
      const proRated = proRataFirstMonthRent(form.monthlyRent, startSlice);
      const inv: Invoice = {
        id: `inv-rent-renew-${Date.now()}`,
        invoiceNumber: invNum,
        contactId: old.contactId,
        invoiceType: InvoiceType.RENTAL,
        amount: proRated,
        paidAmount: 0,
        status: InvoiceStatus.UNPAID,
        issueDate: new Date(form.startDate).toISOString(),
        dueDate: new Date(form.startDate).toISOString(),
        description: `Rent for ${monthName} [Rental]`,
        propertyId: old.propertyId,
        buildingId: bId,
        categoryId: rentCat?.id,
        agreementId: newId,
        rentalMonth: new Date(form.startDate).toISOString().slice(0, 7),
      };
      dispatch({ type: 'ADD_INVOICE', payload: inv });
      dispatch({
        type: 'UPDATE_RENTAL_INVOICE_SETTINGS',
        payload: { ...rSet, nextNumber: afterNext, prefix: invPrefix, padding },
      });
    }
    return;
  }

  if (!isLocalOnlyMode() && (old.version == null || !Number.isFinite(old.version))) {
    throw new Error('Agreement version is missing. Please refresh the rental agreements list and try again.');
  }
  const api = new RentalAgreementsApiRepository();
  const result = await api.renewAgreement(old.id, {
    oldVersion: Number(old.version),
    newAgreementId: newId,
    agreementNumber,
    startDate: new Date(form.startDate).toISOString(),
    endDate: new Date(form.endDate).toISOString(),
    monthlyRent: form.monthlyRent,
    rentDueDate: form.rentDueDate,
    description: form.description,
    ownerId: ownerId || undefined,
    autoRenewLease: form.autoRenewLease,
    generateFirstMonthRentInvoice: form.generateFirstMonthRentInvoice,
    invoicePrefix: state.rentalInvoiceSettings?.prefix || 'INV-',
    invoicePadding: state.rentalInvoiceSettings?.padding ?? 5,
    invoiceNextNumber: state.rentalInvoiceSettings?.nextNumber || 1,
  });
  dispatch({ type: 'UPDATE_RENTAL_AGREEMENT', payload: result.oldAgreement, _isRemote: true } as AppAction);
  dispatch({ type: 'ADD_RENTAL_AGREEMENT', payload: result.newAgreement, _isRemote: true } as AppAction);
  dispatch({
    type: 'UPDATE_AGREEMENT_SETTINGS',
    payload: { ...state.agreementSettings, nextNumber: nextSeq },
  });
  for (const raw of result.generatedInvoices) {
    if (raw && typeof raw === 'object') {
      const inv = normalizeInvoiceFromApi(raw as Record<string, unknown>);
      dispatch({ type: 'ADD_INVOICE', payload: inv, _isRemote: true } as AppAction);
    }
  }
  if (result.nextInvoiceNumber != null && state.rentalInvoiceSettings) {
    dispatch({
      type: 'UPDATE_RENTAL_INVOICE_SETTINGS',
      payload: {
        ...state.rentalInvoiceSettings,
        nextNumber: result.nextInvoiceNumber,
      },
    });
  }
}

/** YYYY-MM-DD from stored agreement end/start (ISO-safe). */
export function agreementDateToYmd(iso: string | undefined): string {
  if (!iso) return toLocalDateString(new Date());
  const t = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return toLocalDateString(new Date(t));
}

/**
 * One automatic renewal: same rent and due day, new calendar term; no security/broker; preserves auto-renew flag.
 * Uses executeRentalRenewal with default term from old end date.
 */
export async function runAutoLeaseRenewalForAgreement(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  old: RentalAgreement
): Promise<void> {
  const endY = agreementDateToYmd(old.endDate);
  const startY = ymdAddDays(endY, 1);
  const endNew = ymdAddOneYearMinusOneDay(startY);
  const rent =
    typeof old.monthlyRent === 'number' ? old.monthlyRent : parseFloat(String(old.monthlyRent)) || 0;
  const due = old.rentDueDate != null ? Number(old.rentDueDate) : 1;
  await executeRentalRenewal(state, dispatch, old, {
    startDate: startY,
    endDate: endNew,
    monthlyRent: rent,
    rentDueDate: Number.isFinite(due) && due >= 1 && due <= 31 ? due : 1,
    description: old.description,
    autoRenewLease: old.autoRenewLease === true,
    generateFirstMonthRentInvoice: true,
  });
}
