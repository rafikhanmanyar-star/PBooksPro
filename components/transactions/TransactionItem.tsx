
import React, { useState } from 'react';
import { Transaction, TransactionType, LoanSubtype, AppState } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import { formatCurrency } from '../../utils/numberUtils';

interface TransactionItemProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
}

// Helper to convert hex to rgba with low opacity for background
const getEntityColorStyle = (projectId: string | undefined, buildingId: string | undefined, state: AppState) => {
    if (!state.enableColorCoding) return {};

    let color = null;
    if (projectId) {
        const project = state.projects.find((p: any) => p.id === projectId);
        if (project?.color) color = project.color;
    }
    if (!color && buildingId) {
        const building = state.buildings.find((b: any) => b.id === buildingId);
        if (building?.color) color = building.color;
    }

    if (color) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return { 
            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
            borderLeft: `4px solid ${color}` 
        };
    }
    return {};
};

const getTimeString = (transaction: Transaction) => {
    // Priority 1: Extract system entry time from ID (timestamp)
    // Matches standard Date.now() IDs (13 digits) and Import IDs `imp-{timestamp}-{index}`
    const idMatch = transaction.id.match(/(\d{13})/);
    if (idMatch) {
        const date = new Date(parseInt(idMatch[1]));
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    // Priority 2: Fallback to Date object creation time if captured (rare legacy)
    // Default to 00:00 if purely manual entry without ID timestamp
    return '00:00';
};

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onEdit }) => {
  const { state } = useAppContext();
  const lookups = useLookupMaps();
  const [isExpanded, setIsExpanded] = useState(false);
  const { type, amount, description, accountId, fromAccountId, toAccountId, projectId, buildingId, contactId, children, categoryId } = transaction;

  const getAccountName = (id: string | undefined) => (id && lookups.accounts.get(id)?.name) || 'N/A';
  const getProjectName = (id: string | undefined) => (id && lookups.projects.get(id)?.name) || '';
  const getBuildingName = (id: string | undefined) => (id && lookups.buildings.get(id)?.name) || '';
  const getCategoryName = (id: string | undefined) => (id && lookups.categories.get(id)?.name) || 'Uncategorized';
  const getContactName = (id: string | undefined) => (id && lookups.contacts.get(id)?.name) || '-';

  const getTransactionDetails = () => {
    const isPositive = type === TransactionType.INCOME || (type === TransactionType.LOAN && (transaction.subtype === LoanSubtype.RECEIVE || transaction.subtype === LoanSubtype.COLLECT));
    const isNegative = type === TransactionType.EXPENSE || (type === TransactionType.LOAN && (transaction.subtype === LoanSubtype.GIVE || transaction.subtype === LoanSubtype.REPAY));
    
    // Red/Green Logic
    const iconColorClass = isPositive ? "text-green-600" : isNegative ? "text-red-600" : "text-indigo-600";
    
    const accountInfo = type === TransactionType.TRANSFER ? `${getAccountName(fromAccountId)} → ${getAccountName(toAccountId)}` : getAccountName(accountId);
    
    // Row 1 Data
    const timeStr = getTimeString(transaction);
    const relatedName = getProjectName(projectId) || getBuildingName(buildingId) || '-'; // Project/Building Name
    const payingName = getContactName(contactId); // Paying/Paid Name
    
    // Row 2 Data
    const categoryName = type === TransactionType.TRANSFER ? 'Transfer' : getCategoryName(categoryId);
    const descText = description || '-';

    return { iconColorClass, accountInfo, timeStr, relatedName, payingName, categoryName, descText };
  };

  const { iconColorClass, accountInfo, timeStr, relatedName, payingName, categoryName, descText } = getTransactionDetails();
  
  const customStyle = getEntityColorStyle(projectId, buildingId, state);

  // Group Rendering (Bulk Payment)
  if (children && children.length > 0) {
      return (
        <div className="border-b border-slate-100 last:border-0 select-none">
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors duration-150 cursor-pointer focus:outline-none"
                style={customStyle}
            >
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className={`transform transition-transform text-slate-400 ${isExpanded ? 'rotate-90' : ''}`}>
                            {ICONS.chevronRight}
                        </span>
                        <div>
                            <p className="text-sm font-bold text-slate-800">{descText || 'Bulk Transaction'}</p>
                            <p className="text-xs text-slate-600">{children.length} items • {getAccountName(accountId)}</p>
                        </div>
                    </div>
                    <p className={`font-bold text-right ml-2 tabular-nums ${iconColorClass}`}>
                        {formatCurrency(Math.abs(amount || 0))}
                    </p>
                </div>
            </div>
            {isExpanded && (
                <div className="pl-8 bg-slate-50/50 border-t border-slate-100 border-l-4 border-l-indigo-100">
                    {children.map(child => (
                        <TransactionItem key={child.id} transaction={child} onEdit={onEdit} />
                    ))}
                </div>
            )}
        </div>
      );
  }

  return (
    <button 
        onClick={() => onEdit(transaction)} 
        className="w-full text-left hover:bg-slate-50 transition-colors duration-150 focus:outline-none border-b border-slate-100 last:border-0 p-2 sm:p-3 select-none"
        style={customStyle}
    >
        <div className="grid grid-cols-12 gap-2 items-center">
            
            {/* Col 1: Time (HH:MM) */}
            <div className="col-span-2 sm:col-span-1 text-xs tabular-nums text-slate-500 flex items-center">
                {timeStr}
            </div>

            {/* Col 2: Project Name */}
            <div className="col-span-10 sm:col-span-2 font-bold text-slate-800 truncate text-sm">
                {relatedName}
            </div>

            {/* Col 3: Paying/Paid Name & Category */}
            <div className="col-span-6 sm:col-span-3 flex flex-col min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate" title={payingName}>{payingName}</div>
                <div className="text-xs text-slate-500 truncate" title={categoryName}>{categoryName}</div>
            </div>

            {/* Col 4: Account & Description */}
            <div className="col-span-6 sm:col-span-4 flex flex-col min-w-0">
                <div className="text-sm text-slate-700 truncate" title={accountInfo}>{accountInfo}</div>
                <div className="text-xs text-slate-400 truncate italic" title={descText}>{descText}</div>
            </div>

            {/* Col 5: Amount */}
            <div className="col-span-12 sm:col-span-2 flex justify-end items-center mt-2 sm:mt-0">
                <span className={`text-sm font-bold tabular-nums ${iconColorClass}`}>
                    {formatCurrency(Math.abs(amount || 0))}
                </span>
            </div>

        </div>
    </button>
  );
};

export default React.memo(TransactionItem);
