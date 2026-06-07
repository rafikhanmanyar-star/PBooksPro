import React, { useMemo } from 'react';
import { Quotation } from '../../types';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { documentService } from '../../services/documentService';
import { useNotification } from '../../context/NotificationContext';
import {
    useCategories,
    useDispatchOnly,
    useQuotations,
    useVendors,
} from '../../hooks/useSelectiveState';
import { SmartTable, type SmartColumnDef } from '../erp/SmartTable';

export interface QuotationSmartTableProps {
    vendorId?: string;
    showVendorColumn?: boolean;
    tableHeight?: number;
    onEditQuotation?: (quotation: Quotation) => void;
}

type QuotationRow = Quotation & {
    vendorName: string;
    itemsCount: number;
    itemsDetail: string;
};

const formatCurrency = (amount: number) =>
    amount.toLocaleString('en-US', { style: 'currency', currency: 'PKR' });

const QuotationSmartTable: React.FC<QuotationSmartTableProps> = ({
    vendorId,
    showVendorColumn = true,
    tableHeight = 520,
    onEditQuotation,
}) => {
    const quotations = useQuotations();
    const vendors = useVendors();
    const categories = useCategories();
    const dispatch = useDispatchOnly();
    const { showConfirm, showAlert } = useNotification();

    const rows = useMemo((): QuotationRow[] => {
        const filtered = vendorId
            ? quotations.filter((q) => q.vendorId === vendorId)
            : quotations;

        return filtered.map((quotation) => {
            const vendor = vendors?.find((v) => v.id === quotation.vendorId);
            const vendorName = vendor?.name || 'Unknown';
            const itemLines = quotation.items.map((item) => {
                const category = categories.find((c) => c.id === item.categoryId);
                return `${category?.name || 'Unknown'} - ${item.quantity} ${item.unit || 'units'} @ ${formatCurrency(item.pricePerQuantity)}`;
            });

            return {
                ...quotation,
                vendorName,
                itemsCount: quotation.items.length,
                itemsDetail: itemLines.slice(0, 2).join('; '),
            };
        });
    }, [quotations, vendors, categories, vendorId]);

    const handleDelete = async (quotation: Quotation) => {
        const confirmed = await showConfirm(
            `Are you sure you want to delete the quotation dated ${formatDate(quotation.date)}?`,
            { title: 'Delete Quotation', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );

        if (!confirmed) return;

        if (quotation.documentId) {
            try {
                await documentService.deleteDocument(quotation.documentId);
                dispatch({ type: 'DELETE_DOCUMENT', payload: quotation.documentId });
            } catch (error) {
                console.error('Failed to delete document:', error);
            }
        }
        dispatch({ type: 'DELETE_QUOTATION', payload: quotation.id });
    };

    const handleViewDocument = async (e: React.MouseEvent, documentId: string) => {
        e.stopPropagation();
        try {
            const url = await documentService.getDocumentUrl(documentId);
            if (url) window.open(url, '_blank');
            else showAlert('Document not found');
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
            await documentService.downloadDocument(
                quotation.documentId,
                `Quotation-${quotation.name}-${quotation.date}.pdf`
            );
        } catch (error) {
            showAlert('Failed to download document');
            console.error('Document download error:', error);
        }
    };

    const columns: SmartColumnDef<QuotationRow>[] = useMemo(() => {
        const cols: SmartColumnDef<QuotationRow>[] = [
            {
                id: 'date',
                header: 'Date',
                width: 110,
                sortable: true,
                accessor: (r) => r.date,
                format: (v) => formatDate(String(v)),
            },
        ];

        if (showVendorColumn) {
            cols.push({
                id: 'vendorName',
                header: 'Vendor',
                width: 160,
                sortable: true,
                accessor: (r) => r.vendorName,
            });
        }

        cols.push(
            {
                id: 'name',
                header: 'Quotation Name',
                width: 180,
                sortable: true,
                accessor: (r) => r.name,
            },
            {
                id: 'itemsCount',
                header: 'Items',
                width: 72,
                sortable: true,
                numeric: true,
                accessor: (r) => r.itemsCount,
            },
            {
                id: 'itemsDetail',
                header: 'Items Detail',
                width: 280,
                accessor: (r) => r.itemsDetail,
                render: (r) => (
                    <div className="px-2 py-1 text-xs text-slate-600 truncate" title={r.itemsDetail}>
                        {r.itemsDetail}
                        {r.items.length > 2 && (
                            <span className="text-slate-400 italic"> (+{r.items.length - 2} more)</span>
                        )}
                    </div>
                ),
            },
            {
                id: 'totalAmount',
                header: 'Total Amount',
                width: 130,
                sortable: true,
                numeric: true,
                sum: true,
                accessor: (r) => r.totalAmount,
                format: (v) => formatCurrency(Number(v)),
            },
            {
                id: 'document',
                header: 'Document',
                width: 100,
                align: 'center',
                accessor: (r) => (r.documentId ? 'yes' : ''),
                render: (r) => (
                    <div className="flex items-center justify-center gap-2 px-1">
                        {r.documentId ? (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => handleViewDocument(e, r.documentId!)}
                                    className="text-indigo-600 hover:text-indigo-800 p-1 rounded-full hover:bg-indigo-50 transition-colors"
                                    title="View Document"
                                >
                                    <div className="w-4 h-4">{ICONS.fileText}</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => handleDownloadDocument(e, r)}
                                    className="text-emerald-600 hover:text-emerald-800 p-1 rounded-full hover:bg-emerald-50 transition-colors"
                                    title="Download Document"
                                >
                                    <div className="w-4 h-4">{ICONS.download}</div>
                                </button>
                            </>
                        ) : (
                            <span className="text-slate-400 text-xs">-</span>
                        )}
                    </div>
                ),
            },
            {
                id: 'actions',
                header: 'Actions',
                width: 96,
                align: 'center',
                accessor: () => '',
                render: (r) => (
                    <div className="flex items-center justify-center gap-2 px-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditQuotation?.(r);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 p-1 rounded-full hover:bg-indigo-50 transition-colors"
                            title="Edit Quotation"
                        >
                            <div className="w-4 h-4">{ICONS.edit}</div>
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleDelete(r);
                            }}
                            className="text-rose-600 hover:text-rose-800 p-1 rounded-full hover:bg-rose-50 transition-colors"
                            title="Delete Quotation"
                        >
                            <div className="w-4 h-4">{ICONS.trash}</div>
                        </button>
                    </div>
                ),
            }
        );

        return cols;
    }, [showVendorColumn, onEditQuotation]);

    const searchPlaceholder = showVendorColumn
        ? 'Search quotations by vendor, name, date, or category…'
        : 'Search quotations by name, date, or category…';

    return (
        <div className="h-full flex flex-col min-h-0">
            {rows.length === 0 ? (
                <p className="text-center text-slate-500 py-12">
                    No quotations found. Create your first quotation to get started.
                </p>
            ) : (
                <SmartTable
                    className="flex-1 min-h-0"
                    columns={columns}
                    data={rows}
                    getRowId={(r) => r.id}
                    tableHeight={tableHeight}
                    searchPlaceholder={searchPlaceholder}
                    showFooterSum
                />
            )}
        </div>
    );
};

export default QuotationSmartTable;
