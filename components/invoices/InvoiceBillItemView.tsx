import React, { memo } from 'react';
import { InvoiceStatus } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/numberUtils';
import Button from '../ui/Button';
import Card from '../ui/Card';
import type { InvoiceBillItemViewModel } from './invoiceBillItemViewModel';

export interface InvoiceBillItemViewProps {
  viewModel: InvoiceBillItemViewModel;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectionMode?: boolean;
  onItemClick?: (item: Invoice | Bill) => void;
  onEdit: (item: Invoice | Bill) => void;
  onDelete: (item: Invoice | Bill) => void;
  onRecordPayment: (item: Invoice | Bill) => void;
  onSendWhatsApp: (item: Invoice | Bill) => void;
}

function stopPropagationAndDo(e: React.MouseEvent, action: () => void) {
  e.stopPropagation();
  action();
}

const InvoiceBillItemView: React.FC<InvoiceBillItemViewProps> = ({
  viewModel,
  isSelected,
  onToggleSelect,
  selectionMode,
  onItemClick,
  onEdit,
  onDelete,
  onRecordPayment,
  onSendWhatsApp,
}) => {
  const {
    item,
    type,
    number,
    contactName,
    contactLabel,
    balance,
    amount,
    paidAmount,
    issueDate,
    dueDate,
    status,
    description,
    isRental,
    isPaid,
    canEdit,
    isAgreementCancelled,
    statusClass,
    customStyle,
    stamp,
    projectName,
    unitName,
    buildingName,
    propertyName,
    staffName,
    showProjectContext,
    showBuildingContext,
    showPropertyContext,
    showStaffContext,
    rentalPropertyLabel,
  } = viewModel;

  const handleCardClick = () => {
    if (onItemClick) onItemClick(item);
    else if (canEdit) onEdit(item);
  };

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
          onClick={handleCardClick}
          className={`flex-grow text-left ${onItemClick || canEdit ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div
            className={`bg-white rounded-lg border shadow-sm p-2.5 hover:border-green-300 transition-all relative overflow-hidden ${isSelected ? 'ring-2 ring-green-500 bg-green-50/30' : 'border-gray-200'}`}
            style={isSelected ? {} : customStyle}
          >
            {stamp && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                <div
                  className={`transform -rotate-12 border-[3px] font-black text-2xl sm:text-3xl uppercase px-2 py-1 rounded tracking-widest whitespace-nowrap ${stamp.color} ${stamp.border}`}
                >
                  {stamp.label}
                </div>
              </div>
            )}

            <div className="relative z-10">
              <div className="flex justify-between items-baseline leading-none mb-1.5">
                <span className="font-bold text-sm text-slate-800">#{number}</span>
                <span className="text-xs text-slate-500 font-medium">{formatDate(issueDate)}</span>
              </div>

              <div className="flex justify-between items-center text-sm mb-1.5">
                <span className="truncate font-medium text-slate-700 mr-2 max-w-[50%]">{contactName}</span>
                <span className="truncate text-xs text-slate-500 flex-shrink-0">{rentalPropertyLabel}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className={`font-bold text-sm ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  Due: {CURRENCY} {formatCurrency(balance)}
                </span>
                <span className={statusClass}>{status}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex gap-2 items-start">
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
        onClick={handleCardClick}
        className={`flex-grow text-left ${onItemClick || canEdit ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <Card
          className={`hover:shadow-md transition-shadow relative overflow-hidden ${isSelected ? 'ring-2 ring-accent bg-indigo-50/30' : ''}`}
          style={isSelected ? {} : customStyle}
        >
          {stamp && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
              <div
                className={`transform -rotate-12 border-[3px] font-black text-4xl uppercase px-4 py-2 rounded-lg tracking-widest whitespace-nowrap ${stamp.color} ${stamp.border}`}
              >
                {stamp.label}
              </div>
            </div>
          )}

          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-lg text-slate-800">#{number}</p>
                  <span className={`sm:hidden ${statusClass}`}>{status}</span>
                  {isAgreementCancelled && (
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-600 border border-rose-200 sm:hidden">
                      Cancelled Agreement
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 font-medium">
                  {contactLabel}: {contactName}
                </p>

                {showProjectContext && (
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    Project: {projectName} {unitName ? `- Unit ${unitName}` : ''}
                  </p>
                )}
                {showBuildingContext && (
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">Building: {buildingName}</p>
                )}
                {showPropertyContext && (
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">Property: {propertyName} (Owner Exp)</p>
                )}
                {showStaffContext && (
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">Staff: {staffName}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`hidden sm:inline-block ${statusClass}`}>{status}</span>
                {isAgreementCancelled && (
                  <span className="hidden sm:inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                    Cancelled Agreement
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap sm:flex-nowrap justify-between gap-y-4 text-sm text-center border-t border-b border-slate-50/50 py-3 bg-slate-50/50 rounded-md">
              <div className="w-1/2 sm:w-1/3 px-1 border-b sm:border-b-0 sm:border-r border-slate-200 pb-2 sm:pb-0">
                <p className="text-slate-500 text-xs uppercase tracking-wide">Amount</p>
                <p className="font-semibold text-slate-700 truncate">
                  {CURRENCY} {formatCurrency(amount || 0)}
                </p>
              </div>
              <div className="w-1/2 sm:w-1/3 px-1 border-b sm:border-b-0 sm:border-r border-slate-200 pb-2 sm:pb-0">
                <p className="text-slate-500 text-xs uppercase tracking-wide">Paid</p>
                <p className="font-semibold text-success truncate">
                  {CURRENCY} {formatCurrency(paidAmount || 0)}
                </p>
              </div>
              <div className="w-full sm:w-1/3 px-1 pt-2 sm:pt-0">
                <p className="text-slate-500 text-xs uppercase tracking-wide">Balance</p>
                <p className="font-bold text-danger truncate">
                  {CURRENCY} {formatCurrency(balance || 0)}
                </p>
              </div>
            </div>

            <div className="mt-2 text-xs text-slate-500 flex justify-between">
              <span>Issued: {formatDate(issueDate)}</span>
              {dueDate && <span>Due: {formatDate(dueDate)}</span>}
            </div>

            {description && <p className="text-xs text-slate-500 mt-2 truncate italic">Note: {description}</p>}
            <div className="mt-4 flex justify-between items-center border-t border-slate-100 pt-3 gap-2">
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => stopPropagationAndDo(e, () => onSendWhatsApp(item))}
                  aria-label="Send WhatsApp"
                  className="px-2"
                >
                  <div className="w-4 h-4 text-green-600">{ICONS.whatsapp}</div>
                </Button>
                {!isAgreementCancelled && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => stopPropagationAndDo(e, () => onEdit(item))}
                      className="px-2"
                    >
                      <div className="w-4 h-4">{ICONS.edit}</div>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger px-2"
                      onClick={(e) => stopPropagationAndDo(e, () => onDelete(item))}
                    >
                      <div className="w-4 h-4">{ICONS.trash}</div>
                    </Button>
                  </>
                )}
              </div>
              {status !== InvoiceStatus.PAID && balance > 0 && !selectionMode && !isAgreementCancelled && (
                <Button
                  size="sm"
                  className="px-3"
                  onClick={(e) => stopPropagationAndDo(e, () => onRecordPayment(item))}
                >
                  {type === 'invoice' ? 'Receive' : 'Pay'}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

function propsAreEqual(prev: InvoiceBillItemViewProps, next: InvoiceBillItemViewProps): boolean {
  return (
    prev.isSelected === next.isSelected &&
    prev.selectionMode === next.selectionMode &&
    prev.viewModel.renderKey === next.viewModel.renderKey &&
    prev.onItemClick === next.onItemClick &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.onRecordPayment === next.onRecordPayment &&
    prev.onSendWhatsApp === next.onSendWhatsApp
  );
}

export default memo(InvoiceBillItemView, propsAreEqual);
