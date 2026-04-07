import React, { useMemo } from 'react';
import { Invoice, InvoiceStatus, ProjectAgreementStatus, TransactionType, Transaction } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { formatCurrency } from '../../utils/numberUtils';
import { usePrintContext } from '../../context/PrintContext';
import type { InvoicePrintData } from '../print/InvoicePrintTemplate';
import { accountIdMatchesLogical } from '../../services/systemEntityIds';

const SECTION_SPACING = 'mb-5 sm:mb-6';
const CARD_PADDING = 'p-4 sm:p-5';
const CARD_BASE = 'rounded-xl border border-slate-200 bg-white shadow-sm';

interface ProjectInvoiceDetailViewProps {
  invoice: Invoice;
  onRecordPayment: (invoice: Invoice) => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
  onEditPayment?: (transaction: Transaction) => void;
  onDeletePayment?: (transaction: Transaction) => void;
}

function getStatusBadgeClasses(status: InvoiceStatus): string {
  switch (status) {
    case InvoiceStatus.PAID:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case InvoiceStatus.PARTIALLY_PAID:
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case InvoiceStatus.OVERDUE:
    case InvoiceStatus.UNPAID:
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

/** Project selling (installment) invoice detail view. Modern SaaS-style layout with cards and clear hierarchy. */
const ProjectInvoiceDetailView: React.FC<ProjectInvoiceDetailViewProps> = ({
  invoice,
  onRecordPayment,
  onEdit,
  onDelete,
  onEditPayment,
  onDeletePayment,
}) => {
  const state = useStateSelector(s => s);
  const lookups = useLookupMaps();
  const { showAlert } = useNotification();
  const { openChat } = useWhatsApp();
  const {
    contactId,
    amount,
    paidAmount,
    issueDate,
    status,
    description,
    invoiceNumber,
    dueDate,
    invoiceType,
    propertyId,
    projectId,
    unitId,
    agreementId,
  } = invoice;
  const buildingId = invoice.buildingId;

  let resolvedProjectId = projectId;
  let resolvedUnitId = unitId;
  if (agreementId) {
    const pa = state.projectAgreements.find(a => a.id === agreementId);
    if (pa) {
      if (!resolvedProjectId) resolvedProjectId = pa.projectId;
      if (!resolvedUnitId && pa.unitIds?.length > 0) resolvedUnitId = pa.unitIds[0];
    }
  }
  if (!resolvedProjectId && resolvedUnitId) {
    const u = state.units.find(u => u.id === resolvedUnitId);
    if (u?.projectId) resolvedProjectId = u.projectId;
  }

  const contact = state.contacts.find(c => c.id === contactId);
  const property = state.properties.find(p => p.id === propertyId);
  const building = property ? state.buildings.find(b => b.id === property.buildingId) : null;
  const project = state.projects.find(p => p.id === resolvedProjectId);
  const unit = state.units.find(u => u.id === resolvedUnitId);

  const balance = amount - paidAmount;

  const projectAgreement = agreementId ? state.projectAgreements.find(pa => pa.id === agreementId) : undefined;
  const isAgreementCancelled = projectAgreement?.status === ProjectAgreementStatus.CANCELLED;

  const invoiceTransactions = useMemo(() => {
    return state.transactions
      .filter(t => t.invoiceId === invoice.id && t.type === TransactionType.INCOME)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoice.id, state.transactions]);

  const { print: triggerPrint } = usePrintContext();

  const invoicePrintData = useMemo((): InvoicePrintData => {
    const contactName = contact?.name || 'N/A';
    const contactAddress = [contact?.address, contact?.contactNo].filter(Boolean).join('\n') || undefined;
    return {
      invoiceNumber,
      contactName,
      contactAddress,
      amount,
      paidAmount,
      status: String(status),
      issueDate,
      dueDate,
      description,
      items: undefined,
    };
  }, [invoice, contact, amount, paidAmount, status, issueDate, dueDate, description]);

  const onPrint = () => {
    triggerPrint('INVOICE', invoicePrintData);
  };

  const handleSendWhatsApp = () => {
    if (!contact?.contactNo) {
      showAlert('This contact does not have a phone number saved.');
      return;
    }
    try {
      let subject = property?.name || project?.name || 'your invoice';
      const unitName = unit?.name || '';
      if (project && unit) subject = `${project.name} - Unit ${unit.name}`;
      let message = '';
      const hasMadePayment = paidAmount > 0;
      const { whatsAppTemplates } = state;
      if (hasMadePayment) {
        message = WhatsAppService.generateInvoiceReceipt(
          whatsAppTemplates.invoiceReceipt,
          contact,
          invoiceNumber,
          paidAmount,
          balance,
          subject,
          unitName
        );
      } else {
        message = WhatsAppService.generateInvoiceReminder(
          whatsAppTemplates.invoiceReminder,
          contact,
          invoiceNumber,
          amount,
          formatDate(dueDate),
          subject,
          unitName
        );
      }
      openChat(contact, contact.contactNo, message);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
    }
  };

  const hasMadePayment = paidAmount > 0;

  const customStyle = useMemo(() => {
    if (!state.enableColorCoding) return {};
    let color: string | null = null;
    if (projectId) {
      const p = state.projects.find(proj => proj.id === projectId);
      if (p?.color) color = p.color;
    }
    if (!color && buildingId) {
      const b = state.buildings.find(bd => bd.id === buildingId);
      if (b?.color) color = b.color;
    }
    if (color) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return {
        background: `linear-gradient(0deg, rgba(${r}, ${g}, ${b}, 0.08), rgba(${r}, ${g}, ${b}, 0.08)), #ffffff`,
        borderTop: `4px solid ${color}`,
      };
    }
    return {};
  }, [projectId, buildingId, state.projects, state.buildings, state.enableColorCoding]);

  const unitOrPropertyLabel = unit ? (property ? `${unit.name} · ${property.name}${building ? ` (${building.name})` : ''}` : unit.name) : property ? `${property.name}${building ? ` (${building.name})` : ''}` : null;

  return (
    <div className={`flex flex-col h-full rounded-lg ${CARD_BASE}`} style={customStyle}>
      {/* HEADER */}
      <header className="flex-shrink-0 pb-4 sm:pb-5 border-b border-slate-200">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Invoice #{invoiceNumber}</h1>
            <p className="mt-1 text-sm sm:text-base font-medium text-slate-600">{contact?.name || 'N/A'}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={`px-3 py-1.5 text-sm font-semibold rounded-full border ${getStatusBadgeClasses(status)}`}>
              {status}
            </span>
            {isAgreementCancelled && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                Cancelled Agreement
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pt-4 sm:pt-5">
        {/* SECTION 1 — Invoice Summary Card */}
        <section className={SECTION_SPACING}>
          <div className={`${CARD_BASE} ${CARD_PADDING}`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">Issue Date</p>
                <p className="text-sm font-semibold text-slate-800 tabular-nums">{formatDate(issueDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">Due Date</p>
                <p className="text-sm font-semibold text-slate-800 tabular-nums">{formatDate(dueDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">Invoice Type</p>
                <p className="text-sm">
                  <span className="inline-flex font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    {invoiceType}
                  </span>
                </p>
              </div>
            </div>
            {unitOrPropertyLabel && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">Unit / Property</p>
                <p className="text-sm font-semibold text-slate-800">{unitOrPropertyLabel}</p>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 2 — Description Card */}
        {description && (
          <section className={SECTION_SPACING}>
            <div className={`${CARD_BASE} ${CARD_PADDING}`}>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Description</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{description}</p>
            </div>
          </section>
        )}

        {/* SECTION 3 — Financial Summary (highlighted) */}
        <section className={SECTION_SPACING}>
          <div className={`rounded-xl border-2 border-slate-200 bg-slate-50/80 ${CARD_PADDING}`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div className="text-center sm:text-left">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Amount</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                  {CURRENCY} {formatCurrency(amount || 0)}
                </p>
              </div>
              <div className="text-center sm:text-left">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Amount Paid</p>
                <p className="text-lg sm:text-xl font-bold text-emerald-600 tabular-nums">
                  {CURRENCY} {formatCurrency(paidAmount || 0)}
                </p>
              </div>
              <div className="text-center sm:text-left">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Balance Due</p>
                <p className="text-lg sm:text-xl font-bold text-rose-600 tabular-nums">
                  {CURRENCY} {formatCurrency(balance || 0)}
                </p>
              </div>
            </div>
            {paidAmount > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (paidAmount / amount) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 4 — Payment History */}
        <section className={SECTION_SPACING}>
          <div className={`${CARD_BASE} overflow-hidden`}>
            <div className={`border-b border-slate-200 ${CARD_PADDING}`}>
              <h3 className="text-sm font-semibold text-slate-800">Payment History</h3>
            </div>
            {invoiceTransactions.length > 0 ? (
              <div className="overflow-x-auto max-h-52 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Method</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Amount</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Notes</th>
                      <th className="w-24" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoiceTransactions.map(tx => {
                      const accountName = lookups.accounts.get(tx.accountId)?.name ?? '—';
                      const isAssetPayment = !!(
                        tx.projectAssetId || accountIdMatchesLogical(tx.accountId, 'sys-acc-received-assets')
                      );
                      const paymentContact = state.contacts.find(c => c.id === tx.contactId);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-4 text-slate-700 tabular-nums whitespace-nowrap">{formatDate(tx.date)}</td>
                          <td className="py-2.5 px-4 text-slate-700">
                            {isAssetPayment ? (
                              <span className="inline-flex items-center text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-xs font-medium">
                                Asset
                              </span>
                            ) : (
                              accountName
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-emerald-600 tabular-nums">
                            {CURRENCY} {formatCurrency(Math.abs(tx.amount || 0))}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 max-w-[140px] truncate" title={tx.description || ''}>
                            {tx.description || '—'}
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center justify-end gap-0.5">
                              {paymentContact?.contactNo && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const msg = `Payment of ${CURRENCY} ${formatCurrency(Math.abs(tx.amount))} received on ${formatDate(tx.date)}. Thank you.`;
                                    sendOrOpenWhatsApp(
                                      { contact: paymentContact, message: msg, phoneNumber: paymentContact.contactNo },
                                      () => state.whatsAppMode,
                                      openChat
                                    );
                                  }}
                                  className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  title="Send receipt via WhatsApp"
                                >
                                  <div className="w-4 h-4">{ICONS.whatsapp}</div>
                                </button>
                              )}
                              {onEditPayment && (
                                <button
                                  type="button"
                                  onClick={() => onEditPayment(tx)}
                                  className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                                  title="Edit payment"
                                >
                                  <div className="w-4 h-4">{ICONS.edit}</div>
                                </button>
                              )}
                              {onDeletePayment && (
                                <button
                                  type="button"
                                  onClick={() => onDeletePayment(tx)}
                                  className="p-1.5 rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                  title="Delete payment"
                                >
                                  <div className="w-4 h-4">{ICONS.trash}</div>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 px-4 text-center">
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 5 — Action Buttons */}
        <section className="pt-2 pb-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {contact?.contactNo && (
              <Button
                variant="ghost"
                onClick={handleSendWhatsApp}
                size="sm"
                className="!bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100"
                aria-label={hasMadePayment ? 'Send payment receipt via WhatsApp' : 'Send invoice reminder via WhatsApp'}
              >
                <div className="w-4 h-4">{ICONS.whatsapp}</div>
                {hasMadePayment ? 'Receipt' : 'WhatsApp'}
              </Button>
            )}
            <PrintButton
              variant="secondary"
              onPrint={onPrint}
              size="sm"
              className="!bg-slate-100 !text-slate-700 hover:!bg-slate-200 border border-slate-200"
            />
            {status !== InvoiceStatus.PAID && !isAgreementCancelled && (
              <Button variant="primary" onClick={() => onRecordPayment(invoice)} size="sm">
                Receive Payment
              </Button>
            )}
            {!isAgreementCancelled && (
              <>
                <Button variant="secondary" onClick={() => onEdit(invoice)} size="sm">
                  <div className="w-4 h-4">{ICONS.edit}</div>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => onDelete(invoice)} size="sm">
                  <div className="w-4 h-4">{ICONS.trash}</div>
                  Delete
                </Button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProjectInvoiceDetailView;
