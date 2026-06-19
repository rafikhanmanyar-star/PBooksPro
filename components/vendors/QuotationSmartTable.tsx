import React, { useMemo } from 'react';
import { Quotation } from '../../types';
import { ICONS } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { documentService } from '../../services/documentService';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import {
    useCategories,
    useDispatchOnly,
    useQuotations,
    useVendors,
} from '../../hooks/useSelectiveState';
import { useInfiniteEntityQuery } from '../../hooks/pagination';
import { useDebouncedSearch } from '../../hooks/search';
import { QuotationsApiRepository } from '../../services/api/repositories/quotationsApi';
import { SmartTable, type SmartColumnDef } from '../erp/SmartTable';
import Button from '../ui/Button';
import Input from '../ui/Input';
import SettingsTableActions from '../settings/SettingsTableActions';

const quotationsApi = new QuotationsApiRepository();

export interface QuotationSmartTableProps {
    vendorId?: string;
    showVendorColumn?: boolean;
    tableHeight?: number;
    onEditQuotation?: (quotation: Quotation) => void;
    onNewQuotation?: () => void;
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
    onNewQuotation,
}) => {
    const { isAuthenticated } = useAuth();
    const appQuotations = useQuotations();
    const vendors = useVendors();
    const categories = useCategories();
    const dispatch = useDispatchOnly();
    const { showConfirm, showAlert } = useNotification();
    const { value: searchQuery, debouncedValue: debouncedSearch, setValue: setSearchQuery } =
        useDebouncedSearch();

    const listFilters = useMemo(
        () => ({
            search: debouncedSearch.trim() || undefined,
            vendorId,
        }),
        [debouncedSearch, vendorId]
    );

    const {
        items: serverQuotations,
        loading: serverLoading,
        hasNextPage,
        fetchNextPage,
        loadingMore,
        totalCount,
    } = useInfiniteEntityQuery<Quotation>({
        queryKey: ['quotations', 'infinite'],
        enabled: isAuthenticated,
        filters: listFilters,
        fetchPage: ({ pageParam, pageSize, filters }) =>
            quotationsApi.findPage({
                page: pageParam,
                pageSize,
                search: filters.search as string | undefined,
                vendorId: filters.vendorId as string | undefined,
                sortBy: 'date',
                sortDirection: 'desc',
            }),
    });

    const sourceQuotations = useMemo(() => {
        if (isAuthenticated) return serverQuotations;
        return vendorId ? appQuotations.filter((q) => q.vendorId === vendorId) : appQuotations;
    }, [isAuthenticated, serverQuotations, appQuotations, vendorId]);

    const rows = useMemo((): QuotationRow[] => {
        return sourceQuotations.map((quotation) => {
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
    }, [sourceQuotations, vendors, categories]);

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
                width: 112,
                align: 'center',
                accessor: () => '',
                render: (r) => (
                    <div className="flex items-center justify-center px-1">
                        <SettingsTableActions
                            onEdit={(e) => {
                                e.stopPropagation();
                                onEditQuotation?.(r);
                            }}
                            onDelete={(e) => {
                                e.stopPropagation();
                                void handleDelete(r);
                            }}
                        />
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
            {isAuthenticated && (
                <div className="flex flex-wrap items-end gap-3 mb-3 shrink-0">
                    <Input
                        placeholder={searchPlaceholder}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="max-w-md"
                    />
                    {hasNextPage && (
                        <button
                            type="button"
                            className="text-sm text-primary hover:underline disabled:opacity-50 pb-2"
                            onClick={() => fetchNextPage()}
                            disabled={loadingMore}
                        >
                            {loadingMore
                                ? 'Loading…'
                                : `Load more (${rows.length} of ${totalCount})`}
                        </button>
                    )}
                </div>
            )}
            {rows.length === 0 && !serverLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-app-toolbar flex items-center justify-center mb-4">
                        <div className="w-8 h-8 text-app-muted">{ICONS.fileText}</div>
                    </div>
                    <p className="text-sm font-medium text-app-text mb-1">No quotations found</p>
                    <p className="text-xs text-app-muted mb-4">Create your first quotation to get started.</p>
                    {onNewQuotation && (
                        <Button onClick={onNewQuotation} className="!bg-primary hover:!bg-primary/90 shadow-ds-card">
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            <span>New Quotation</span>
                        </Button>
                    )}
                </div>
            ) : (
                <SmartTable
                    className="flex-1 min-h-0"
                    columns={columns}
                    data={rows}
                    getRowId={(r) => r.id}
                    tableHeight={tableHeight}
                    loading={serverLoading}
                    searchPlaceholder={isAuthenticated ? 'Filter loaded rows…' : searchPlaceholder}
                    showFooterSum
                />
            )}
        </div>
    );
};

export default QuotationSmartTable;
