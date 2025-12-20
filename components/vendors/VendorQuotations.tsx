import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Quotation, Contact } from '../../types';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { documentService } from '../../services/documentService';
import { useNotification } from '../../context/NotificationContext';
import Button from '../ui/Button';

interface VendorQuotationsProps {
    vendorId: string;
    onEditQuotation?: (quotation: Quotation) => void;
    onViewDocument?: (documentId: string) => void;
}

const VendorQuotations: React.FC<VendorQuotationsProps> = ({ vendorId, onEditQuotation, onViewDocument }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showAlert } = useNotification();
    const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const quotations = useMemo(() => {
        return (state.quotations || [])
            .filter(q => q.vendorId === vendorId)
            .sort((a, b) => {
                if (sortBy === 'date') {
                    const dateA = new Date(a.date).getTime();
                    const dateB = new Date(b.date).getTime();
                    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
                } else {
                    return sortOrder === 'asc' 
                        ? a.totalAmount - b.totalAmount 
                        : b.totalAmount - a.totalAmount;
                }
            });
    }, [state.quotations, vendorId, sortBy, sortOrder]);

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

    const handleViewDocument = async (documentId: string) => {
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

    const handleDownloadDocument = async (quotation: Quotation) => {
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

    if (quotations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <div className="w-8 h-8 text-slate-400">{ICONS.fileText}</div>
                </div>
                <p className="text-sm font-medium text-slate-600 mb-1">No quotations found</p>
                <p className="text-xs text-slate-500">Add your first quotation to get started</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Sort Controls */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Sort by:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
                        className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="date">Date</option>
                        <option value="amount">Amount</option>
                    </select>
                    <button
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                        title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                        <div className="w-4 h-4">
                            {sortOrder === 'asc' ? ICONS.arrowUp : ICONS.arrowDown}
                        </div>
                    </button>
                </div>
                <span className="text-sm text-slate-500">{quotations.length} quotation{quotations.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Quotations List */}
            <div className="space-y-3">
                {quotations.map(quotation => (
                    <div
                        key={quotation.id}
                        className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                    <h4 className="text-base font-semibold text-slate-900">
                                        {quotation.name}
                                    </h4>
                                    <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                                        {formatDate(quotation.date)}
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                                    <div>
                                        <span className="text-slate-500">Items:</span>
                                        <span className="ml-2 font-medium text-slate-900">
                                            {quotation.items.length}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Total:</span>
                                        <span className="ml-2 font-semibold text-slate-900">
                                            {quotation.totalAmount.toLocaleString('en-US', {
                                                style: 'currency',
                                                currency: 'PKR'
                                            })}
                                        </span>
                                    </div>
                                    {quotation.documentId && (
                                        <div className="flex items-center gap-1 text-emerald-600">
                                            <div className="w-4 h-4">{ICONS.fileText}</div>
                                            <span className="text-xs">Document attached</span>
                                        </div>
                                    )}
                                </div>

                                {/* Items Preview */}
                                {quotation.items.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <div className="text-xs font-medium text-slate-500 mb-2">Items:</div>
                                        <div className="space-y-1">
                                            {quotation.items.slice(0, 3).map((item, idx) => {
                                                const category = state.categories.find(c => c.id === item.categoryId);
                                                return (
                                                    <div key={idx} className="text-xs text-slate-600 flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                        <span>{category?.name || 'Unknown'}</span>
                                                        <span className="text-slate-400">•</span>
                                                        <span>{item.quantity} {item.unit || 'units'}</span>
                                                        <span className="text-slate-400">•</span>
                                                        <span className="font-medium">
                                                            {(item.quantity * item.pricePerQuantity).toLocaleString('en-US', {
                                                                style: 'currency',
                                                                currency: 'PKR'
                                                            })}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                            {quotation.items.length > 3 && (
                                                <div className="text-xs text-slate-400 italic">
                                                    +{quotation.items.length - 3} more item{quotation.items.length - 3 !== 1 ? 's' : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {quotation.documentId && (
                                    <>
                                        <button
                                            onClick={() => handleViewDocument(quotation.documentId!)}
                                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                                            title="View Document"
                                        >
                                            <div className="w-4 h-4">{ICONS.fileText}</div>
                                        </button>
                                        <button
                                            onClick={() => handleDownloadDocument(quotation)}
                                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                                            title="Download Document"
                                        >
                                            <div className="w-4 h-4">{ICONS.download}</div>
                                        </button>
                                    </>
                                )}
                                {onEditQuotation && (
                                    <button
                                        onClick={() => onEditQuotation(quotation)}
                                        className="p-2 rounded-lg hover:bg-indigo-100 text-indigo-600 hover:text-indigo-700 transition-colors"
                                        title="Edit Quotation"
                                    >
                                        <div className="w-4 h-4">{ICONS.edit}</div>
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(quotation)}
                                    className="p-2 rounded-lg hover:bg-rose-100 text-rose-600 hover:text-rose-700 transition-colors"
                                    title="Delete Quotation"
                                >
                                    <div className="w-4 h-4">{ICONS.trash}</div>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VendorQuotations;

