
import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useMemo, useState } from 'react';
import { Contract } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import { formatDate } from '../../utils/dateUtils';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';
import { usePrintReport } from '../../hooks/usePrintReport';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useNotification } from '../../context/NotificationContext';
import { ContractRetentionSummaryPanel, retentionStatusBadge } from './ContractRetentionUI';
import ContractRetentionReleaseModal from './ContractRetentionReleaseModal';
import { getContractPaidFromTransactions } from '../../utils/contractRetention';
import { useAuth } from '../../context/AuthContext';
import { roleHasPermission } from '../../shared/rbac/permissions';
import ContractActivitySidebar from './ContractActivitySidebar';
import { ContractDocumentAttachmentPanel } from './ContractDocumentUI';

interface ProjectContractDetailModalProps {
    contract: Contract;
    onClose: () => void;
    onEdit: () => void;
}

const ProjectContractDetailModal: React.FC<ProjectContractDetailModalProps> = ({ contract, onClose, onEdit }) => {
    const state = useProjectReportAppState();
    const printReport = usePrintReport();
    const { openChat } = useWhatsApp();
    const { showAlert } = useNotification();
    const { user } = useAuth();
    const [releaseOpen, setReleaseOpen] = useState(false);

    const project = state.projects.find(p => p.id === contract.projectId);
    const vendor = state.vendors?.find(v => v.id === contract.vendorId);

    const totalPaid = useMemo(
        () => getContractPaidFromTransactions(state.transactions || [], contract.id),
        [state.transactions, contract.id]
    );

    const totalAmount = contract.totalAmount ?? 0;
    const balance = totalAmount - totalPaid;
    const progress = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;
    const retentionBadge = retentionStatusBadge(contract, totalPaid);
    const canReleaseRetention = roleHasPermission(user?.role, 'contracts.retention.release');

    const handleSendWhatsApp = () => {
        if (!vendor?.contactNo) {
            showAlert("Vendor contact number not found.");
            return;
        }

        try {
            let message = `*Contract Details*\n`;
            message += `Ref: ${contract.contractNumber}\n`;
            message += `Title: ${contract.name}\n`;
            message += `Project: ${project?.name}\n`;
            if (contract.area && contract.rate) {
                message += `Area: ${contract.area} sqft @ ${contract.rate}/sqft\n`;
            }
            message += `Total Value: ${CURRENCY} ${totalAmount.toLocaleString()}\n`;
            message += `Paid to Date: ${CURRENCY} ${totalPaid.toLocaleString()}\n`;
            message += `Balance: ${CURRENCY} ${balance.toLocaleString()}\n\n`;
            if (contract.termsAndConditions) {
                message += `Terms:\n${contract.termsAndConditions}`;
            }

            sendOrOpenWhatsApp(
                { contact: vendor, message, phoneNumber: vendor.contactNo },
                () => state.whatsAppMode,
                openChat
            );
        } catch (error) {
            showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };

    return (
        <div className="h-full flex flex-col min-h-0">
            <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
                {/* Main document */}
                <div
                    className="flex-1 overflow-y-auto p-4 bg-app-bg min-w-0"
                    id="project-contract-print-area"
                >
                    <ReportHeader />

                    <div className="border-b-2 border-app-border pb-4 mb-6">
                        <h2 className="text-2xl font-bold text-app-text">Contract Agreement</h2>
                        <p className="text-sm text-app-muted">Ref: {contract.contractNumber}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                        <div>
                            <h4 className="text-xs font-bold text-app-muted uppercase">Project</h4>
                            <p className="font-semibold text-lg text-app-text">{project?.name}</p>
                        </div>
                        <div className="text-right">
                            <h4 className="text-xs font-bold text-app-muted uppercase">Contractor / Vendor</h4>
                            <p className="font-semibold text-lg text-app-text">{vendor?.name}</p>
                            <p className="text-sm text-app-muted">{vendor?.contactNo}</p>
                        </div>
                    </div>

                    <div className="bg-app-toolbar p-4 rounded-lg border border-app-border mb-6">
                        <h3 className="font-bold text-lg text-app-text mb-2">{contract.name}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                                <span className="text-app-muted block">Total Amount</span>
                                <span className="font-bold text-lg text-app-text">{CURRENCY} {totalAmount.toLocaleString()}</span>
                            </div>
                            {contract.area && contract.rate ? (
                                <div className="md:col-span-2 grid grid-cols-2 gap-4 bg-app-card p-2 rounded border border-app-border">
                                    <div>
                                        <span className="text-app-muted block text-xs uppercase">Total Area</span>
                                        <span className="font-medium text-app-text">{(contract.area ?? 0).toLocaleString()} sqft</span>
                                    </div>
                                    <div>
                                        <span className="text-app-muted block text-xs uppercase">Rate</span>
                                        <span className="font-medium text-app-text">{CURRENCY} {(contract.rate ?? 0).toLocaleString()} / sqft</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="md:col-span-2"></div>
                            )}

                            <div>
                                <span className="text-app-muted block">Start Date</span>
                                <span className="font-medium text-app-text">{formatDate(contract.startDate)}</span>
                            </div>
                            <div>
                                <span className="text-app-muted block">End Date</span>
                                <span className="font-medium text-app-text">{formatDate(contract.endDate)}</span>
                            </div>
                            <div>
                                <span className="text-app-muted block">Status</span>
                                <span className={`font-bold ${contract.status === 'Active' ? 'text-ds-success' : 'text-app-muted'}`}>{contract.status}</span>
                            </div>
                        </div>
                    </div>

                    {contract.expenseCategoryItems && contract.expenseCategoryItems.length > 0 && (
                        <div className="mb-6">
                            <h4 className="font-bold text-app-text mb-2 border-b border-app-border pb-1">Contract Items (Scope of Work)</h4>
                            <table className="w-full text-sm border-collapse border border-app-border">
                                <thead>
                                    <tr className="bg-app-table-header">
                                        <th className="border border-app-border px-3 py-2 text-left text-app-text">Category</th>
                                        <th className="border border-app-border px-3 py-2 text-center text-app-text">Unit</th>
                                        <th className="border border-app-border px-3 py-2 text-right text-app-text">Quantity</th>
                                        <th className="border border-app-border px-3 py-2 text-right text-app-text">Rate</th>
                                        <th className="border border-app-border px-3 py-2 text-right text-app-text">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contract.expenseCategoryItems.map((item, index) => {
                                        const category = state.categories.find(c => c.id === item.categoryId);
                                        return (
                                            <tr key={index}>
                                                <td className="border border-app-border px-3 py-2 text-app-text">{category?.name || 'Unknown'}</td>
                                                <td className="border border-app-border px-3 py-2 text-center text-app-text">{item.unit}</td>
                                                <td className="border border-app-border px-3 py-2 text-right text-app-text tabular-nums">{item.quantity?.toLocaleString()}</td>
                                                <td className="border border-app-border px-3 py-2 text-right text-app-text tabular-nums">{CURRENCY} {item.pricePerUnit?.toLocaleString()}</td>
                                                <td className="border border-app-border px-3 py-2 text-right font-medium text-app-text tabular-nums">{CURRENCY} {item.netValue?.toLocaleString()}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-app-toolbar font-bold">
                                        <td colSpan={4} className="border border-app-border px-3 py-2 text-right text-app-text">Total:</td>
                                        <td className="border border-app-border px-3 py-2 text-right text-app-text tabular-nums">{CURRENCY} {contract.totalAmount?.toLocaleString()}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-app-text border-b border-app-border pb-1 flex-1">
                                Retention & Financial Summary
                            </h4>
                            {retentionBadge && (
                                <span className={`ml-2 inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase ${retentionBadge.className}`}>
                                    {retentionBadge.label}
                                </span>
                            )}
                        </div>
                        <ContractRetentionSummaryPanel contract={contract} paidAmount={totalPaid} />
                        {canReleaseRetention &&
                            (contract.retentionType ?? 'NONE') !== 'NONE' &&
                            (contract.retentionBalance ?? contract.retentionAmount ?? 0) > 0 && (
                            <div className="mt-3">
                                <Button type="button" variant="secondary" size="sm" onClick={() => setReleaseOpen(true)}>
                                    Release Retention
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="mb-6">
                        <h4 className="font-bold text-app-text mb-2 border-b border-app-border pb-1">Payment Progress</h4>
                        <div className="flex justify-between items-center mb-2 text-sm text-app-text">
                            <span>Paid: {CURRENCY} {totalPaid.toLocaleString()}</span>
                            <span className={balance < 0 ? 'text-ds-danger font-bold' : 'text-app-muted'}>
                                Remaining: {CURRENCY} {balance.toLocaleString()}
                            </span>
                        </div>
                        <div className="w-full bg-app-border rounded-full h-3">
                            <div
                                className={`h-3 rounded-full ${balance < 0 ? 'bg-ds-danger' : 'bg-ds-success'}`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                            ></div>
                        </div>
                    </div>

                    <ContractDocumentAttachmentPanel contract={contract} />

                    <div className="mb-6">
                        <h4 className="font-bold text-app-text mb-2 border-b border-app-border pb-1">Terms & Conditions</h4>
                        <div className="whitespace-pre-wrap text-sm text-app-muted leading-relaxed p-3 bg-app-toolbar rounded border border-app-border">
                            {contract.termsAndConditions || "No specific terms defined."}
                        </div>
                    </div>

                    <div className="mt-8 pt-12 border-t border-app-border flex justify-between text-xs text-app-muted">
                        <div className="text-center w-40">
                            <div className="border-t border-app-border mb-2"></div>
                            Employer Signature
                        </div>
                        <div className="text-center w-40">
                            <div className="border-t border-app-border mb-2"></div>
                            Contractor Signature
                        </div>
                    </div>
                    <ReportFooter />
                </div>

                {/* Sidebar — contract info + activity (hidden in print) */}
                <aside className="no-print w-full lg:w-[300px] xl:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-l border-app-border bg-app-bg overflow-y-auto p-3 lg:p-4">
                    <ContractActivitySidebar
                        contract={contract}
                        bills={state.bills || []}
                        transactions={state.transactions || []}
                        projectName={project?.name}
                        vendorName={vendor?.name}
                        mode="view"
                    />
                </aside>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-app-border no-print shrink-0">
                <Button variant="secondary" onClick={onEdit}>Edit Contract</Button>
                <div className="flex gap-2">
                    {vendor?.contactNo && (
                        <Button
                            variant="secondary"
                            onClick={handleSendWhatsApp}
                            className="flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982a.96.96 0 01-.9-.26l-.833-.833a.96.96 0 01-.26-.9l.982-3.742-.214-.361a9.87 9.87 0 01-1.378-5.031c0-5.4 4.366-9.765 9.765-9.765s9.765 4.365 9.765 9.765c0 5.4-4.365 9.765-9.765 9.765m0-18.53c-4.833 0-8.765 3.932-8.765 8.765 0 1.842.57 3.55 1.544 4.953l-1.01 3.85 3.85-1.01a8.7 8.7 0 004.952 1.544c4.833 0 8.765-3.932 8.765-8.765S16.884 3.255 12.051 3.255" />
                            </svg>
                            WhatsApp
                        </Button>
                    )}
                    <PrintButton
                        variant="primary"
                        onPrint={() => printReport({ elementId: 'project-contract-print-area' })}
                    />
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
            <ContractRetentionReleaseModal
                contract={contract}
                paidAmount={totalPaid}
                isOpen={releaseOpen}
                onClose={() => setReleaseOpen(false)}
            />
        </div>
    );
};

export default ProjectContractDetailModal;
