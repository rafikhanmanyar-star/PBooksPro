import { useDispatchOnly, useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo } from 'react';
import { ProjectReceivedAsset } from '../../types';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import RecordSaleModal from './RecordSaleModal';
import { useNotification } from '../../context/NotificationContext';

const ProjectReceivedAssetsPage: React.FC = () => {
    const state = useProjectReportAppState();
    const dispatch = useDispatchOnly();
    const { showConfirm, showToast } = useNotification();
    const [projectFilterId, setProjectFilterId] = useState<string>('');
    const [saleModalAsset, setSaleModalAsset] = useState<ProjectReceivedAsset | null>(null);
    const [editSaleAsset, setEditSaleAsset] = useState<ProjectReceivedAsset | null>(null);

    const projects = useMemo(() => state.projects || [], [state.projects]);
    const filteredAssets = useMemo(() => {
        const list = state.projectReceivedAssets || [];
        if (!projectFilterId) return list;
        return list.filter(a => a.projectId === projectFilterId);
    }, [state.projectReceivedAssets, projectFilterId]);

    const getContactName = (contactId: string) => {
        const c = state.contacts?.find(x => x.id === contactId);
        return c?.name ?? '—';
    };
    const getInvoiceNumber = (invoiceId: string | null | undefined) => {
        if (!invoiceId) return '—';
        const inv = state.invoices?.find(x => x.id === invoiceId);
        return inv?.invoiceNumber ?? '—';
    };
    const getProjectName = (projectId: string) => {
        const p = state.projects?.find(x => x.id === projectId);
        return p?.name ?? projectId;
    };

    const handleReverseSale = async (asset: ProjectReceivedAsset) => {
        // Only reverse the two SALE transactions (proceeds + cost of asset sold). Do NOT touch
        // the original asset receipt/payment transactions that have invoiceId — those keep the invoice paid.
        const saleTxns = (state.transactions || []).filter(
            t => t.projectAssetId === asset.id && !t.invoiceId
        );
        if (saleTxns.length === 0) {
            showToast('No sale transactions found for this asset.', 'error');
            return;
        }
        const confirmed = await showConfirm(
            `Reverse the sale of "${asset.description}"? This will remove the sale transactions (${CURRENCY} ${asset.saleAmount?.toLocaleString()} proceeds and cost entry) and mark the asset as Held again. Invoice payments for this asset are not affected.`,
            { title: 'Reverse sale', confirmLabel: 'Reverse sale', cancelLabel: 'Cancel' }
        );
        if (!confirmed) return;
        dispatch({
            type: 'BATCH_DELETE_TRANSACTIONS',
            payload: { transactionIds: saleTxns.map(t => t.id) },
        });
        dispatch({
            type: 'UPDATE_PROJECT_RECEIVED_ASSET',
            payload: {
                ...asset,
                soldDate: null,
                saleAmount: null,
                saleAccountId: null,
            },
        });
        showToast('Sale reversed. Asset is marked as Held. Invoices unchanged.', 'success');
    };

    return (
        <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <ComboBox
                    label="Project"
                    items={projects}
                    selectedId={projectFilterId}
                    onSelect={item => setProjectFilterId(item?.id || '')}
                    placeholder="All projects"
                    allowAddNew={false}
                />
            </div>

            <div className="border border-app-border rounded-lg overflow-hidden bg-app-card">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-app-border">
                        <thead className="bg-app-table-header">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase">Project</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase">Description</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase">Type</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-app-muted uppercase">Recorded value</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase">Received date</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase">Client</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase">Invoice #</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase">Status</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase">Sale date</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-app-muted uppercase">Sale amount</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-app-muted uppercase">Gain/Loss</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-app-muted uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-app-card divide-y divide-app-border">
                            {filteredAssets.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-3 py-6 text-center text-app-muted">
                                        No received assets. Use “Asset (plot, car, etc.)” when recording installment payments to add assets here.
                                    </td>
                                </tr>
                            ) : (
                                filteredAssets.map(asset => {
                                    const sold = !!asset.soldDate;
                                    const gainLoss = sold && asset.saleAmount != null ? asset.saleAmount - asset.recordedValue : null;
                                    return (
                                        <tr key={asset.id} className="hover:bg-app-table-hover">
                                            <td className="px-3 py-2 text-sm text-app-text">{getProjectName(asset.projectId)}</td>
                                            <td className="px-3 py-2 text-sm text-app-text">{asset.description}</td>
                                            <td className="px-3 py-2 text-sm text-app-text">{asset.assetType}</td>
                                            <td className="px-3 py-2 text-sm text-right text-app-text">
                                                {CURRENCY} {asset.recordedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-app-text">{formatDate(asset.receivedDate)}</td>
                                            <td className="px-3 py-2 text-sm text-app-text">{getContactName(asset.contactId)}</td>
                                            <td className="px-3 py-2 text-sm text-app-text">{getInvoiceNumber(asset.invoiceId)}</td>
                                            <td className="px-3 py-2 text-sm">{sold ? <span className="text-emerald-600">Sold</span> : <span className="text-amber-600">Held</span>}</td>
                                            <td className="px-3 py-2 text-sm text-app-text">{asset.soldDate ? formatDate(asset.soldDate) : '—'}</td>
                                            <td className="px-3 py-2 text-sm text-right text-app-text">
                                                {asset.saleAmount != null ? `${CURRENCY} ${asset.saleAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-right">
                                                {gainLoss != null ? (
                                                    <span className={gainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                                        {gainLoss >= 0 ? '+' : ''}{CURRENCY} {gainLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {!sold ? (
                                                    <Button size="sm" variant="secondary" onClick={() => setSaleModalAsset(asset)}>
                                                        Record sale
                                                    </Button>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button size="sm" variant="secondary" onClick={() => setEditSaleAsset(asset)}>
                                                            Edit sale
                                                        </Button>
                                                        <Button size="sm" variant="secondary" onClick={() => handleReverseSale(asset)} className="!text-rose-600 hover:!bg-rose-50">
                                                            Reverse sale
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {saleModalAsset && (
                <RecordSaleModal
                    isOpen={!!saleModalAsset}
                    onClose={() => setSaleModalAsset(null)}
                    asset={saleModalAsset}
                    onSuccess={() => setSaleModalAsset(null)}
                />
            )}
            {editSaleAsset && (
                <RecordSaleModal
                    isOpen={!!editSaleAsset}
                    onClose={() => setEditSaleAsset(null)}
                    asset={editSaleAsset}
                    onSuccess={() => setEditSaleAsset(null)}
                    mode="edit"
                />
            )}
        </div>
    );
};

export default ProjectReceivedAssetsPage;
