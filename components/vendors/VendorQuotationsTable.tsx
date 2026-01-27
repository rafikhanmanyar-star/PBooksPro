import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Quotation } from '../../types';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { documentService } from '../../services/documentService';
import { useNotification } from '../../context/NotificationContext';
import Input from '../ui/Input';

interface VendorQuotationsTableProps {
    vendorId: string;
    onEditQuotation?: (quotation: Quotation) => void;
}

type SortKey = 'date' | 'name' | 'totalAmount' | 'itemsCount';

const VendorQuotationsTable: React.FC<VendorQuotationsTableProps> = ({ vendorId, onEditQuotation }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showAlert } = useNotification();
    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const quotations = useMemo(() => {
        return (state.quotations || []).filter(q => q.vendorId === vendorId);
    }, [state.quotations, vendorId]);

    const filteredQuotations = useMemo(() => {
        let result = quotations;
        
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(quotation => 
                quotation.name.toLowerCase().includes(q) ||
                quotation.date.includes(q) ||
                quotation.items.some(item => {
                    const category = state.categories.find(c => c.id === item.categoryId);
                    return category?.name.toLowerCase().includes(q);
                })
            );
        }
        
        return result.sort((a, b) => {
            let aVal: any;
            let bVal: any;
            
            switch (sortConfig.key) {
                case 'date':
                    aVal = new Date(a.date).getTime();
                    bVal = new Date(b.date).getTime();
                    break;
                case 'name':
                    aVal = a.name.toLowerCase();
                    bVal = b.name.toLowerCase();
                    break;
                case 'totalAmount':
                    aVal = a.totalAmount;
                    bVal = b.totalAmount;
                    break;
                case 'itemsCount':
                    aVal = a.items.length;
                    bVal = b.items.length;
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [quotations, search, sortConfig, state.categories]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleDelete = async (quotation: Quotation) => {
        const confirmed = await showConfirm(
            `Are you sure you want to delete the quotation dated ${formatDate(quotation.date)}?`,
            { title: 'Delete Quotation', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        
        if (confirmed) {
            // Delete associated document if exists
            if (quotation.documentId) {
                try {
                    await documentService.deleteDocument(quotation.documentId);
                    dispatch({ type: 'DELETE_DOCUMENT', payload: quotation.documentId });
                } catch (error) {
                    console.error('Failed to delete document:', error);
                }
            }
            dispatch({ type: 'DELETE_QUOTATION', payload: quotation.id });
        }
    };

    const handleViewDocument = async (e: React.MouseEvent, documentId: string) => {
        e.stopPropagation();
        try {
            const url = await documentService.getDocumentUrl(documentId);
            if (url) {
                window.open(url, '_blank');
            } else {
                showAlert('Document not found');
            }
        } catch (error) {
            showAlert('Failed to open document');
            console.error('Document view error:', error);
        }
    };

    const handleDownloadDocument = async (e: React.MouseEvent, quotation: Quotation) => {
        e.stopPropagation();
        if (!quotation.documentId) {
            showAlert('No document attached to this quotation');
            return;
        }

        try {
            await documentService.downloadDocument(quotation.documentId, `Quotation-${quotation.name}-${quotation.date}.pdf`);
        } catch (error) {
            showAlert('Failed to download document');
            console.error('Document download error:', error);
        }
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="space-y-4 h-full flex flex-col min-h-0">
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
                <div className="flex-grow relative">
                    <Input 
                        id="quotation-search"
                        name="quotation-search"
                        placeholder="Search quotations by name, date, or category..." 
                        value={search} 
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 py-2 text-sm"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <div className="w-4 h-4">{ICONS.search}</div>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto border rounded-lg bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-sm relative">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th onClick={() => handleSort('date')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                            <th onClick={() => handleSort('name')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Vendor Name <SortIcon column="name"/></th>
                            <th onClick={() => handleSort('itemsCount')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Items <SortIcon column="itemsCount"/></th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 select-none">Items Detail</th>
                            <th onClick={() => handleSort('totalAmount')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Total Amount <SortIcon column="totalAmount"/></th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-600 select-none whitespace-nowrap">Document</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-600 select-none whitespace-nowrap">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredQuotations.length > 0 ? filteredQuotations.map(quotation => (
                            <tr 
                                key={quotation.id} 
                                onClick={() => onEditQuotation?.(quotation)} 
                                className="hover:bg-slate-50 cursor-pointer transition-colors group"
                            >
                                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatDate(quotation.date)}</td>
                                <td className="px-4 py-3 font-medium text-slate-800 group-hover:text-accent">{quotation.name}</td>
                                <td className="px-4 py-3 text-slate-700">{quotation.items.length}</td>
                                <td className="px-4 py-3 max-w-md">
                                    <div className="space-y-1">
                                        {quotation.items.slice(0, 2).map((item, idx) => {
                                            const category = state.categories.find(c => c.id === item.categoryId);
                                            return (
                                                <div key={idx} className="text-xs text-slate-600">
                                                    {category?.name || 'Unknown'} - {item.quantity} {item.unit || 'units'} @ {item.pricePerQuantity.toLocaleString('en-US', { style: 'currency', currency: 'PKR' })}
                                                </div>
                                            );
                                        })}
                                        {quotation.items.length > 2 && (
                                            <div className="text-xs text-slate-400 italic">
                                                +{quotation.items.length - 2} more
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                                    {quotation.totalAmount.toLocaleString('en-US', {
                                        style: 'currency',
                                        currency: 'PKR'
                                    })}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {quotation.documentId ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={(e) => handleViewDocument(e, quotation.documentId!)}
                                                className="text-indigo-600 hover:text-indigo-800 p-1 rounded-full hover:bg-indigo-50 transition-colors"
                                                title="View Document"
                                            >
                                                <div className="w-4 h-4">{ICONS.fileText}</div>
                                            </button>
                                            <button
                                                onClick={(e) => handleDownloadDocument(e, quotation)}
                                                className="text-emerald-600 hover:text-emerald-800 p-1 rounded-full hover:bg-emerald-50 transition-colors"
                                                title="Download Document"
                                            >
                                                <div className="w-4 h-4">{ICONS.download}</div>
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-slate-400 text-xs">-</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditQuotation?.(quotation);
                                            }}
                                            className="text-indigo-600 hover:text-indigo-800 p-1 rounded-full hover:bg-indigo-50 transition-colors"
                                            title="Edit Quotation"
                                        >
                                            <div className="w-4 h-4">{ICONS.edit}</div>
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(quotation);
                                            }}
                                            className="text-rose-600 hover:text-rose-800 p-1 rounded-full hover:bg-rose-50 transition-colors"
                                            title="Delete Quotation"
                                        >
                                            <div className="w-4 h-4">{ICONS.trash}</div>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                                    {quotations.length === 0 
                                        ? 'No quotations found. Create your first quotation to get started.'
                                        : 'No quotations found matching your search.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default VendorQuotationsTable;

