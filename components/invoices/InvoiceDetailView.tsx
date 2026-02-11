
import React, { useMemo } from 'react';
import { Invoice, InvoiceStatus, InvoiceType, ProjectAgreementStatus, RecurringInvoiceTemplate } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import Card from '../ui/Card';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';
import TransactionItem from '../transactions/TransactionItem';
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { formatCurrency } from '../../utils/numberUtils';
import { usePrintContext } from '../../context/PrintContext';
import type { InvoicePrintData } from '../print/InvoicePrintTemplate';

interface InvoiceDetailViewProps {
  invoice: Invoice;
  onRecordPayment: (invoice: Invoice) => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}

const DetailRow: React.FC<{ label: string; value: string | React.ReactNode; className?: string }> = ({ label, value, className }) => (
    <div className={className}>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="font-semibold text-slate-700 tabular-nums">{value}</p>
    </div>
);


const InvoiceDetailView: React.FC<InvoiceDetailViewProps> = ({ invoice, onRecordPayment, onEdit, onDelete }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();
    const { openChat } = useWhatsApp();
    const { contactId, amount, paidAmount, issueDate, status, description, invoiceNumber, dueDate, invoiceType, propertyId, projectId, unitId, agreementId } = invoice;
    const buildingId = invoice.buildingId;
    
    const contact = state.contacts.find(c => c.id === contactId);
    const property = state.properties.find(p => p.id === propertyId);
    const building = property ? state.buildings.find(b => b.id === property.buildingId) : null;
    const project = state.projects.find(p => p.id === projectId);
    const unit = state.units.find(u => u.id === unitId);
    
    const balance = amount - paidAmount;
    const isRental = invoiceType === InvoiceType.RENTAL || invoiceType === InvoiceType.SECURITY_DEPOSIT;
    const isSecurityDepositOnly = invoiceType === InvoiceType.SECURITY_DEPOSIT ||
        (invoiceType === InvoiceType.RENTAL && (invoice.securityDepositCharge || 0) > 0 &&
            Math.abs(amount - (invoice.securityDepositCharge || 0) - (invoice.serviceCharges || 0)) < 0.01);

    const projectAgreement = agreementId ? state.projectAgreements.find(pa => pa.id === agreementId) : undefined;
    const isAgreementCancelled = projectAgreement?.status === ProjectAgreementStatus.CANCELLED;

    const invoiceTransactions = useMemo(() => {
        return state.transactions
            .filter(t => t.invoiceId === invoice.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [invoice.id, state.transactions]);

    const getStatusClasses = (status: InvoiceStatus) => {
        switch (status) {
            case InvoiceStatus.PAID: return 'bg-emerald-100 text-emerald-800';
            case InvoiceStatus.PARTIALLY_PAID: return 'bg-amber-100 text-amber-800';
            case InvoiceStatus.OVERDUE: return 'bg-rose-100 text-rose-800';
            case InvoiceStatus.UNPAID: return 'bg-rose-100 text-rose-800';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    const { print: triggerPrint } = usePrintContext();

    /** Data for print: matches what user sees on screen. */
    const invoicePrintData = useMemo((): InvoicePrintData => {
        const contactName = contact?.name || 'N/A';
        const contactAddress = [contact?.address, contact?.contactNo].filter(Boolean).join('\n') || undefined;
        let items: Array<{ description: string; quantity: number; unitPrice?: number; total: number }> = [];
        if (isRental) {
            const rentVal = amount - (invoice.serviceCharges || 0) - (invoice.securityDepositCharge || 0);
            if (rentVal > 0) items.push({ description: 'Rent', quantity: 1, total: rentVal });
            if (invoice.serviceCharges) items.push({ description: 'Service Charges', quantity: 1, total: invoice.serviceCharges });
            if (invoice.securityDepositCharge) items.push({ description: 'Security Deposit', quantity: 1, total: invoice.securityDepositCharge });
        }
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
            items: items.length > 0 ? items : undefined,
        };
    }, [invoice, contact, amount, paidAmount, status, issueDate, dueDate, description, isRental]);

    const onPrint = () => {
        triggerPrint('INVOICE', invoicePrintData);
    };

    const handleSendWhatsApp = () => {
        if (!contact?.contactNo) {
            showAlert("This contact does not have a phone number saved.");
            return;
        }

        try {
            let subject = property?.name || project?.name || 'your invoice';
            const unitName = unit?.name || '';
            
            // Enhance subject with Unit Name for Project Invoices
            if (project && unit) {
                subject = `${project.name} - Unit ${unit.name}`;
            }

            let message = '';
            const hasMadePayment = paidAmount > 0;
            const { whatsAppTemplates } = state;

            if (hasMadePayment) {
                // Send Receipt
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
                // Send Invoice Reminder
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

            // Open WhatsApp side panel with pre-filled message
            openChat(contact, contact.contactNo, message);
        } catch (error) {
            showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };
    
    const hasMadePayment = paidAmount > 0;

    // Dynamic Style
    const customStyle = useMemo(() => {
        if (!state.enableColorCoding) return {};

        let color = null;
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
            // Improved visibility: Layered background (linear gradient over white) to ensure tint visibility
            return { 
                background: `linear-gradient(0deg, rgba(${r}, ${g}, ${b}, 0.12), rgba(${r}, ${g}, ${b}, 0.12)), #ffffff`,
                borderTop: `4px solid ${color}` 
            };
        }
        return {};
    }, [projectId, buildingId, state.projects, state.buildings, state.enableColorCoding]);

    // Recurring Invoice Logic
    const recurringTemplate = useMemo(() => {
        if (![InvoiceType.RENTAL, InvoiceType.SECURITY_DEPOSIT, InvoiceType.SERVICE_CHARGE, InvoiceType.INSTALLMENT].includes(invoice.invoiceType)) return null;
        return state.recurringInvoiceTemplates.find(t => 
            (invoice.agreementId && t.agreementId === invoice.agreementId && (t.invoiceType || InvoiceType.RENTAL) === invoice.invoiceType) ||
            (!invoice.agreementId && t.propertyId === invoice.propertyId && t.contactId === invoice.contactId && (t.invoiceType || InvoiceType.RENTAL) === invoice.invoiceType)
        );
    }, [invoice, state.recurringInvoiceTemplates]);

    const toggleRecurring = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        
        if (isChecked) {
            // Logic to add
             const nextMonth = new Date(invoice.issueDate);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const rentAmount = invoice.amount - (invoice.securityDepositCharge || 0) - (invoice.serviceCharges || 0);

            const newTemplate: RecurringInvoiceTemplate = {
                id: `rec-${Date.now()}`,
                contactId: invoice.contactId,
                propertyId: invoice.propertyId || '',
                buildingId: invoice.buildingId || '',
                amount: rentAmount,
                descriptionTemplate: `Rent for {Month}`,
                dayOfMonth: new Date(invoice.issueDate).getDate(),
                nextDueDate: nextMonth.toISOString().split('T')[0],
                active: true,
                agreementId: invoice.agreementId,
                invoiceType: invoice.invoiceType,
                autoGenerate: true,
                frequency: 'Monthly',
            };
            dispatch({ type: 'ADD_RECURRING_TEMPLATE', payload: newTemplate });
            showToast('Memorized for recurring.', 'success');
        } else {
            // Logic to remove
            if (recurringTemplate) {
                dispatch({ type: 'DELETE_RECURRING_TEMPLATE', payload: recurringTemplate.id });
                showToast('Removed from recurring.', 'info');
            }
        }
    };
    
    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm" style={customStyle}>
            <div className="flex justify-between items-start mb-4 pt-2 px-1">
                <div>
                    <h3 className="text-2xl font-bold text-slate-800">Invoice #{invoiceNumber}</h3>
                    <p className="font-semibold text-accent">{contact?.name || 'N/A'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className={`px-3 py-1.5 text-sm font-bold rounded-full ${getStatusClasses(status)}`}>
                        {status}
                    </span>
                    {isAgreementCancelled && <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-600 border border-rose-200">Cancelled Agreement</span>}
                </div>
            </div>
            
            <div className="space-y-4 flex-grow">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <DetailRow label="Issue Date" value={formatDate(issueDate)} />
                    <DetailRow label="Due Date" value={formatDate(dueDate)} />
                    <DetailRow label="Type" value={<span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{isSecurityDepositOnly ? 'Security Deposit' : invoiceType}</span>} />
                    {property && <DetailRow label="Property" value={`${property.name} (${building?.name || 'N/A'})`} className="col-span-2 md:col-span-3" />}
                    {unit && !property && <DetailRow label="Unit" value={unit.name} />}
                </div>

                {description && (
                    <div>
                        <p className="text-sm text-slate-500 mb-1">Description</p>
                        <p className="font-medium text-slate-700 bg-white p-2 rounded-md border border-slate-100">{description}</p>
                    </div>
                )}
                
                <div className="space-y-2 pt-4 border-t border-slate-200/60">
                    {isRental && (
                        <>
                            <DetailRow label="Rent" value={`${CURRENCY} ${formatCurrency(amount - (invoice.serviceCharges || 0) - (invoice.securityDepositCharge || 0))}`} />
                            {invoice.serviceCharges && invoice.serviceCharges > 0 && <DetailRow label="Services" value={`${CURRENCY} ${formatCurrency(invoice.serviceCharges)}`} />}
                            {invoice.securityDepositCharge && invoice.securityDepositCharge > 0 && <DetailRow label="Security Deposit" value={`${CURRENCY} ${formatCurrency(invoice.securityDepositCharge)}`} />}
                        </>
                    )}
                    <div className="flex justify-between items-baseline text-lg font-bold border-t border-slate-200/60 pt-2">
                         <span>Total Amount</span>
                         <span className="tabular-nums">{CURRENCY} {formatCurrency(amount || 0)}</span>
                    </div>
                    <div className="flex justify-between items-baseline text-success">
                         <span>Amount Paid</span>
                         <span className="tabular-nums">{CURRENCY} {formatCurrency(paidAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between items-baseline text-danger text-lg font-bold">
                         <span>Balance Due</span>
                         <span className="tabular-nums">{CURRENCY} {formatCurrency(balance || 0)}</span>
                    </div>
                </div>

                {paidAmount > 0 && (
                    <div className="pt-2">
                        <div className="w-full bg-slate-200 rounded-full h-2.5">
                            <div className="bg-success h-2.5 rounded-full" style={{ width: `${(paidAmount / amount) * 100}%` }}></div>
                        </div>
                    </div>
                )}

                {invoiceTransactions.length > 0 && (
                     <div className="mt-4">
                        <h4 className="font-bold text-slate-700 mb-2 text-sm">Payment History</h4>
                        <div className="border rounded-lg bg-white overflow-hidden max-h-40 overflow-y-auto text-sm">
                             {invoiceTransactions.map(tx => (
                                 <TransactionItem 
                                     key={tx.id} 
                                     transaction={tx} 
                                     onEdit={() => {}} 
                                 />
                             ))}
                        </div>
                     </div>
                )}
            </div>

            {isRental && !isSecurityDepositOnly && !invoice.description?.includes('[Security]') && (
                <div className="mt-4 p-3 bg-indigo-50 rounded-md border border-indigo-100">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={!!recurringTemplate} 
                            onChange={toggleRecurring}
                            className="rounded text-accent focus:ring-accent h-5 w-5 border-gray-300"
                        />
                        <span className="font-medium text-indigo-900">Memorize this transaction for recurring</span>
                    </label>
                </div>
            )}
            
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200/60 pt-4">
                <div className="flex justify-between gap-2">
                    <div className="flex gap-2">
                         {contact?.contactNo && (
                            <Button
                                variant="ghost"
                                onClick={handleSendWhatsApp}
                                className="!bg-green-100 !text-green-700 hover:!bg-green-200"
                                aria-label={hasMadePayment ? 'Send payment receipt via WhatsApp' : 'Send invoice reminder via WhatsApp'}
                            >
                                <div className="w-5 h-5">{ICONS.whatsapp}</div>
                                {hasMadePayment ? 'Receipt' : 'WhatsApp'}
                            </Button>
                        )}
                         <PrintButton
                                variant="secondary"
                                onPrint={onPrint}
                                className="!bg-slate-100 !text-slate-700 hover:!bg-slate-200"
                            />
                    </div>
                    
                    {status !== InvoiceStatus.PAID && !isAgreementCancelled && (
                        <Button variant="primary" onClick={() => onRecordPayment(invoice)}>
                            Receive Payment
                        </Button>
                    )}
                </div>
                
                {!isAgreementCancelled && (
                     <div className="flex gap-2 justify-end">
                        <Button variant="secondary" onClick={() => onEdit(invoice)} size="sm">
                            <div className="w-4 h-4 mr-1">{ICONS.edit}</div> Edit
                        </Button>
                        <Button variant="danger" onClick={() => onDelete(invoice)} size="sm">
                            <div className="w-4 h-4 mr-1">{ICONS.trash}</div> Delete
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvoiceDetailView;
