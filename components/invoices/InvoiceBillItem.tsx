
import React, { useState, useMemo } from 'react';
import { Invoice, Bill, InvoiceStatus, InvoiceType, TransactionType, ProjectAgreementStatus } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext'; 
import Modal from '../ui/Modal';
import InvoiceBillForm from './InvoiceBillForm';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService } from '../../services/whatsappService';
import { WhatsAppChatService } from '../../services/whatsappChatService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { formatCurrency } from '../../utils/numberUtils';

interface InvoiceBillItemProps {
  item: Invoice | Bill;
  type: 'invoice' | 'bill';
  onRecordPayment: (item: Invoice | Bill) => void;
  onItemClick?: (item: Invoice | Bill) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectionMode?: boolean;
}

const InvoiceBillItem: React.FC<InvoiceBillItemProps> = ({ item, type, onRecordPayment, onItemClick, isSelected, onToggleSelect, selectionMode }) => {
  const { state, dispatch } = useAppContext();
  const { showConfirm, showToast, showAlert } = useNotification();
  const { openChat } = useWhatsApp();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  const { contactId, amount, paidAmount, issueDate, status, description, projectId } = item;
  const number = type === 'invoice' ? (item as Invoice).invoiceNumber : (item as Bill).billNumber;
  const dueDate = 'dueDate' in item ? item.dueDate : undefined;
  const invoiceType = type === 'invoice' ? (item as Invoice).invoiceType : undefined;
  
  // Determine Context to Display (Project, Building, Property, Staff)
  const buildingId = type === 'invoice' ? (item as Invoice).buildingId : (item as Bill).buildingId;
  const unitId = type === 'invoice' ? (item as Invoice).unitId : undefined;
  const propertyId = item.propertyId;
  const staffId = type === 'bill' ? (item as Bill).staffId : undefined;
  
  const contact = state.contacts.find(c => c.id === contactId);
  const contactName = contact?.name || 'N/A';
  const contactLabel = type === 'invoice' ? (invoiceType === InvoiceType.RENTAL ? 'Tenant' : 'Owner') : 'Supplier';
  const balance = amount - paidAmount;

  const agreementId = type === 'invoice' ? (item as Invoice).agreementId : (item as Bill).projectAgreementId;
  const projectAgreement = agreementId ? state.projectAgreements.find(pa => pa.id === agreementId) : undefined;
  const isAgreementCancelled = projectAgreement?.status === ProjectAgreementStatus.CANCELLED;

  const getStatusClasses = (status: InvoiceStatus) => {
    switch (status) {
      case InvoiceStatus.PAID: return 'bg-emerald-100 text-emerald-800';
      case InvoiceStatus.PARTIALLY_PAID: return 'bg-amber-100 text-amber-800';
      case InvoiceStatus.OVERDUE: return 'bg-rose-100 text-rose-800';
      case InvoiceStatus.UNPAID: return 'bg-rose-100 text-rose-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const stopPropagationAndDo = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  const handleDelete = async () => {
    if (paidAmount > 0) {
      await showAlert(`Cannot delete this ${type} because it has associated payments (${CURRENCY} ${formatCurrency(paidAmount)}).\n\nPlease delete the payment transactions from the ledger first.`, { title: 'Deletion Blocked' });
    } else {
      const confirmed = await showConfirm(`Are you sure you want to delete this ${type}?`, { title: `Delete ${type === 'invoice' ? 'Invoice' : 'Bill'}`, confirmLabel: 'Delete', cancelLabel: 'Cancel' });
      if (confirmed) {
        handleConfirmDelete();
      }
    }
  };

  const handleConfirmDelete = () => {
    if (type === 'invoice') dispatch({ type: 'DELETE_INVOICE', payload: item.id });
    else dispatch({ type: 'DELETE_BILL', payload: item.id });
    showToast(`${type === 'invoice' ? 'Invoice' : 'Bill'} deleted successfully`, 'info');
  };

  const isRental = type === 'invoice' && (item as Invoice).invoiceType === InvoiceType.RENTAL;
  const property = isRental || propertyId ? state.properties.find(p => p.id === (isRental ? (item as Invoice).propertyId : propertyId)) : null;
  const building = property ? state.buildings.find(b => b.id === property.buildingId) : (buildingId ? state.buildings.find(b => b.id === buildingId) : null);
  const project = projectId ? state.projects.find(p => p.id === projectId) : null;
  const unit = unitId ? state.units.find(u => u.id === unitId) : null;
  const staff = staffId ? state.contacts.find(c => c.id === staffId) : null;

  const handleSendWhatsApp = () => {
    if (!contact?.contactNo) { 
      showAlert("This contact does not have a phone number saved."); 
      return; 
    }

    try {
      const { whatsAppTemplates } = state;
      let message = '';
      const hasMadePayment = paidAmount > 0;
      
      if (type === 'invoice') {
        let subject = property?.name || project?.name || 'your invoice';
        if (project && unit) {
          subject = `${project.name} - Unit ${unit.name}`;
        }
        const unitName = unit?.name || '';

        if (hasMadePayment) {
          message = WhatsAppService.generateInvoiceReceipt(
            whatsAppTemplates.invoiceReceipt,
            contact,
            number,
            paidAmount,
            balance,
            subject,
            unitName
          );
        } else {
          message = WhatsAppService.generateInvoiceReminder(
            whatsAppTemplates.invoiceReminder,
            contact,
            number,
            amount,
            dueDate ? formatDate(dueDate) : undefined,
            subject,
            unitName
          );
        }
      } else { // type === 'bill'
        message = WhatsAppService.generateBillPayment(
          whatsAppTemplates.billPayment,
          contact,
          number,
          paidAmount
        );
      }

      // Open WhatsApp modal with pre-filled message
      openChat(contact, contact.contactNo, message);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
    }
  };

  // Color Logic
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
          return { 
              background: `linear-gradient(0deg, rgba(${r}, ${g}, ${b}, 0.12), rgba(${r}, ${g}, ${b}, 0.12)), #ffffff`,
              borderLeft: `4px solid ${color}` 
          };
      }
      return {};
  }, [projectId, buildingId, state.projects, state.buildings, state.enableColorCoding]);

  const isPaid = status === InvoiceStatus.PAID;
  const canEdit = !isAgreementCancelled;

  // Stamp Logic
  const getStamp = () => {
      if (description?.includes('[Security]')) return { label: 'SECURITY', color: 'text-amber-600/20', border: 'border-amber-600/20' };
      if (description?.includes('[Rental]')) return { label: 'RENTAL', color: 'text-gray-500/10', border: 'border-gray-500/10' };
      return null;
  };
  const stamp = getStamp();

  // Compact View for Rental Invoices
  if (isRental) {
      return (
        <div className="w-full flex gap-2 items-start">
            {onToggleSelect && (
                <div className="pt-3 pl-1">
                    <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => onToggleSelect(item.id)}
                        disabled={isPaid}
                        className={`w-5 h-5 rounded border-slate-300 focus:ring-accent ${isPaid ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-accent cursor-pointer'}`}
                    />
                </div>
            )}
            <div 
                onClick={() => {
                    if (onItemClick) onItemClick(item);
                    else if (canEdit) setIsEditModalOpen(true);
                }} 
                className={`flex-grow text-left ${onItemClick || canEdit ? 'cursor-pointer' : 'cursor-default'}`}
            >
                <div 
                    className={`bg-white rounded-lg border shadow-sm p-2.5 hover:border-green-300 transition-all relative overflow-hidden ${isSelected ? 'ring-2 ring-green-500 bg-green-50/30' : 'border-gray-200'}`}
                    style={isSelected ? {} : customStyle}
                >
                    {/* Watermark Stamp */}
                    {stamp && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                            <div className={`transform -rotate-12 border-[3px] font-black text-2xl sm:text-3xl uppercase px-2 py-1 rounded tracking-widest whitespace-nowrap ${stamp.color} ${stamp.border}`}>
                                {stamp.label}
                            </div>
                        </div>
                    )}

                    <div className="relative z-10">
                        {/* Line 1: Invoice # - Date */}
                        <div className="flex justify-between items-baseline leading-none mb-1.5">
                            <span className="font-bold text-sm text-slate-800">#{number}</span>
                            <span className="text-xs text-slate-500 font-medium">{formatDate(issueDate)}</span>
                        </div>
                        
                        {/* Line 2: Tenant - Property */}
                        <div className="flex justify-between items-center text-sm mb-1.5">
                            <span className="truncate font-medium text-slate-700 mr-2 max-w-[50%]">{contactName}</span>
                            <span className="truncate text-xs text-slate-500 flex-shrink-0">{property?.name || 'Unknown Unit'}</span>
                        </div>
                        
                        {/* Line 3: Balance - Status */}
                        <div className="flex justify-between items-center">
                            <span className={`font-bold text-sm ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                Due: {CURRENCY} {formatCurrency(balance)}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${getStatusClasses(status)}`}>
                                {status}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      );
  }

  // Standard View for Non-Rental (e.g. Bills, Project Invoices)
  return (
    <>
        <div className="w-full flex gap-2 items-start">
            {/* Selection Checkbox */}
            {onToggleSelect && (
                <div className="pt-4 pl-1">
                    <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => onToggleSelect(item.id)}
                        disabled={isPaid}
                        className={`w-5 h-5 rounded border-slate-300 focus:ring-accent ${isPaid ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-accent cursor-pointer'}`}
                    />
                </div>
            )}

            <div 
                onClick={() => {
                    if (onItemClick) onItemClick(item);
                    else if (canEdit) setIsEditModalOpen(true);
                }} 
                className={`flex-grow text-left ${onItemClick || canEdit ? 'cursor-pointer' : 'cursor-default'}`}
            >
                <Card className={`hover:shadow-md transition-shadow relative overflow-hidden ${isSelected ? 'ring-2 ring-accent bg-indigo-50/30' : ''}`} style={isSelected ? {} : customStyle}>
                     {/* Watermark Stamp */}
                     {stamp && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                            <div className={`transform -rotate-12 border-[3px] font-black text-4xl uppercase px-4 py-2 rounded-lg tracking-widest whitespace-nowrap ${stamp.color} ${stamp.border}`}>
                                {stamp.label}
                            </div>
                        </div>
                    )}
                    
                    <div className="relative z-10">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-lg text-slate-800">#{number}</p>
                                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full sm:hidden ${getStatusClasses(status)}`}>{status}</span>
                                    {isAgreementCancelled && <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-600 border border-rose-200 sm:hidden">Cancelled Agreement</span>}
                                </div>
                                <p className="text-sm text-slate-600 font-medium">{contactLabel}: {contactName}</p>
                                
                                {/* Context Display Logic */}
                                {project && !isRental && (
                                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                        Project: {project.name} {unit ? `- Unit ${unit.name}` : ''}
                                    </p>
                                )}
                                {!project && building && (
                                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                        Building: {building.name}
                                    </p>
                                )}
                                {!project && !building && property && (
                                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                        Property: {property.name} (Owner Exp)
                                    </p>
                                )}
                                {staff && (
                                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                        Staff: {staff.name}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`hidden sm:inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${getStatusClasses(status)}`}>{status}</span>
                                {isAgreementCancelled && <span className="hidden sm:inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-600 border border-rose-200">Cancelled Agreement</span>}
                            </div>
                        </div>
                        
                        <div className="mt-4 flex flex-wrap sm:flex-nowrap justify-between gap-y-4 text-sm text-center border-t border-b border-slate-50/50 py-3 bg-slate-50/50 rounded-md">
                            <div className="w-1/2 sm:w-1/3 px-1 border-b sm:border-b-0 sm:border-r border-slate-200 pb-2 sm:pb-0">
                                <p className="text-slate-500 text-xs uppercase tracking-wide">Amount</p>
                                <p className="font-semibold text-slate-700 truncate">{CURRENCY} {formatCurrency(amount || 0)}</p>
                            </div>
                            <div className="w-1/2 sm:w-1/3 px-1 border-b sm:border-b-0 sm:border-r border-slate-200 pb-2 sm:pb-0">
                                <p className="text-slate-500 text-xs uppercase tracking-wide">Paid</p>
                                <p className="font-semibold text-success truncate">{CURRENCY} {formatCurrency(paidAmount || 0)}</p>
                            </div>
                            <div className="w-full sm:w-1/3 px-1 pt-2 sm:pt-0">
                                <p className="text-slate-500 text-xs uppercase tracking-wide">Balance</p>
                                <p className="font-bold text-danger truncate">{CURRENCY} {formatCurrency(balance || 0)}</p>
                            </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-500 flex justify-between">
                            <span>Issued: {formatDate(issueDate)}</span>
                            {dueDate && <span>Due: {formatDate(dueDate)}</span>}
                        </div>
                        
                        {description && <p className="text-xs text-slate-500 mt-2 truncate italic">Note: {description}</p>}
                        <div className="mt-4 flex justify-between items-center border-t border-slate-100 pt-3 gap-2">
                            <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={(e) => stopPropagationAndDo(e, handleSendWhatsApp)} aria-label="Send WhatsApp" className="px-2"><div className="w-4 h-4 text-green-600">{ICONS.whatsapp}</div></Button>
                                {!isAgreementCancelled && (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={(e) => stopPropagationAndDo(e, () => setIsEditModalOpen(true))} className="px-2"><div className="w-4 h-4">{ICONS.edit}</div></Button>
                                        <Button variant="ghost" size="sm" className="text-danger px-2" onClick={(e) => stopPropagationAndDo(e, handleDelete)}><div className="w-4 h-4">{ICONS.trash}</div></Button>
                                    </>
                                )}
                            </div>
                            {status !== InvoiceStatus.PAID && balance > 0 && !selectionMode && !isAgreementCancelled && (<Button size="sm" className="px-3" onClick={(e) => stopPropagationAndDo(e, () => onRecordPayment(item))}>{type === 'invoice' ? 'Receive' : 'Pay'}</Button>)}
                        </div>
                    </div>
                </Card>
            </div>
        </div>

        <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit ${type}`}><InvoiceBillForm key={item.id} onClose={() => setIsEditModalOpen(false)} type={type} itemToEdit={item} /></Modal>
    </>
  );
};

export default InvoiceBillItem;
