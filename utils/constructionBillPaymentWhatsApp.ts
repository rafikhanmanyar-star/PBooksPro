import type { AppState, Bill, Contact, Vendor } from '../types';
import { InvoiceStatus } from '../types';
import { CURRENCY } from '../constants';
import { WhatsAppService, sendOrOpenWhatsApp } from '../services/whatsappService';

export function isRentalAgreementBill(bill: Bill, state: AppState): boolean {
    if (!bill.projectAgreementId) return false;
    return state.rentalAgreements.some((ra) => ra.id === bill.projectAgreementId);
}

/** Project / construction bills (excludes rental-allocated maintenance bills). */
export function isProjectConstructionBill(bill: Bill, state: AppState): boolean {
    if (isRentalAgreementBill(bill, state)) return false;
    return !!(bill.projectId || bill.contractId);
}

export function resolveBillPaymentRecipient(bill: Bill, state: AppState): Contact | Vendor | null {
    if (bill.vendorId) {
        const v = state.vendors.find((x) => x.id === bill.vendorId);
        if (v) return v;
    }
    if (bill.contactId) {
        const c = state.contacts.find((x) => x.id === bill.contactId);
        if (c) return c;
    }
    return null;
}

export function computeBillAfterPayment(bill: Bill, payAmount: number): Bill {
    const newPaid = Math.round((bill.paidAmount + payAmount) * 100) / 100;
    const newStatus =
        newPaid >= bill.amount
            ? InvoiceStatus.PAID
            : newPaid > 0
              ? InvoiceStatus.PARTIALLY_PAID
              : InvoiceStatus.UNPAID;
    return { ...bill, paidAmount: newPaid, status: newStatus };
}

type OfferOpts = {
    state: AppState;
    updatedBills: Bill[];
    showConfirm: (message: string, options?: { title?: string; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
    showAlert: (message: string) => Promise<void>;
    openChat: (contact: Contact | Vendor | null, phoneNumber?: string, initialMessage?: string) => void;
};

/**
 * When Settings → ID Sequences → Project Invoices → "Bill payment WhatsApp" is on,
 * prompts to open/send a payment notification using the Bill payment template.
 */
export async function offerConstructionBillPaymentWhatsApp({
    state,
    updatedBills,
    showConfirm,
    showAlert,
    openChat,
}: OfferOpts): Promise<void> {
    if (!state.projectInvoiceSettings?.autoSendBillPaymentWhatsApp) return;

    const candidates = updatedBills.filter((b) => isProjectConstructionBill(b, state));
    if (!candidates.length) return;

    const groups = new Map<string, { recipient: Contact | Vendor; bills: Bill[] }>();
    for (const bill of candidates) {
        const recipient = resolveBillPaymentRecipient(bill, state);
        if (!recipient?.contactNo || !WhatsAppService.isValidPhoneNumber(recipient.contactNo)) continue;
        const fmt = WhatsAppService.formatPhoneNumber(recipient.contactNo);
        if (!fmt) continue;
        const key = `${recipient.id}-${fmt}`;
        const g = groups.get(key);
        if (g) g.bills.push(bill);
        else groups.set(key, { recipient, bills: [bill] });
    }
    if (!groups.size) return;

    const ok = await showConfirm(
        'Payment recorded. Send bill payment notification(s) on WhatsApp to the supplier or contact?',
        { title: 'Send WhatsApp', confirmLabel: 'Send WhatsApp', cancelLabel: 'No, Later' }
    );
    if (!ok) return;

    const template =
        state.whatsAppTemplates?.billPayment ||
        'Dear {contactName}, Bill #{billNumber} has been paid. Amount: {paidAmount}.';

    for (const { recipient, bills } of groups.values()) {
        const phone = recipient.contactNo!;
        const message =
            bills.length === 1
                ? WhatsAppService.generateBillPayment(
                      template,
                      recipient,
                      bills[0].billNumber,
                      bills[0].paidAmount
                  )
                : `Dear ${recipient.name},\n\nPayment recorded:\n${bills
                      .map(
                          (b) =>
                              `• Bill #${b.billNumber}: ${CURRENCY} ${b.paidAmount.toLocaleString()} (total recorded on bill)`
                      )
                      .join('\n')}`;
        try {
            sendOrOpenWhatsApp(
                { contact: recipient, message, phoneNumber: phone },
                () => state.whatsAppMode,
                openChat
            );
        } catch (e) {
            await showAlert(e instanceof Error ? e.message : 'Failed to open WhatsApp');
        }
    }
}
