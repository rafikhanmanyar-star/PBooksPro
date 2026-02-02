
import React, { useMemo } from 'react';
import { Contract } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY, ICONS } from '../../constants';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import { formatDate } from '../../utils/dateUtils';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { WhatsAppService } from '../../services/whatsappService';
import { useNotification } from '../../context/NotificationContext';

interface ProjectContractDetailModalProps {
    contract: Contract;
    onClose: () => void;
    onEdit: () => void;
}

const ProjectContractDetailModal: React.FC<ProjectContractDetailModalProps> = ({ contract, onClose, onEdit }) => {
    const { state } = useAppContext();
    const { handlePrint } = usePrint();
    const { openChat } = useWhatsApp();
    const { showAlert } = useNotification();

    const project = state.projects.find(p => p.id === contract.projectId);
    const vendor = state.contacts.find(c => c.id === contract.vendorId);

    const payments = useMemo(() => {
        return state.transactions
            .filter(tx => tx.contractId === contract.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [state.transactions, contract.id]);

    const totalAmount = contract.totalAmount ?? 0;
    const totalPaid = payments.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const balance = totalAmount - totalPaid;
    const progress = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;

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

            // Open WhatsApp modal with pre-filled message
            openChat(vendor, vendor.contactNo, message);
        } catch (error) {
            showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };

    return (
        <div className="h-full flex flex-col">
            <style>{STANDARD_PRINT_STYLES}</style>

            <div className="flex-grow overflow-y-auto printable-area p-4 bg-white" id="printable-area">
                <ReportHeader />

                <div className="border-b-2 border-slate-800 pb-4 mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">Contract Agreement</h2>
                    <p className="text-sm text-slate-500">Ref: {contract.contractNumber}</p>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase">Project</h4>
                        <p className="font-semibold text-lg">{project?.name}</p>
                    </div>
                    <div className="text-right">
                        <h4 className="text-xs font-bold text-slate-500 uppercase">Contractor / Vendor</h4>
                        <p className="font-semibold text-lg">{vendor?.name}</p>
                        <p className="text-sm text-slate-600">{vendor?.contactNo}</p>
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                    <h3 className="font-bold text-lg text-slate-800 mb-2">{contract.name}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="text-slate-500 block">Total Amount</span>
                            <span className="font-bold text-lg">{CURRENCY} {totalAmount.toLocaleString()}</span>
                        </div>
                        {contract.area && contract.rate ? (
                            <div className="md:col-span-2 grid grid-cols-2 gap-4 bg-white p-2 rounded border border-slate-100">
                                <div>
                                    <span className="text-slate-400 block text-xs uppercase">Total Area</span>
                                    <span className="font-medium">{(contract.area ?? 0).toLocaleString()} sqft</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-xs uppercase">Rate</span>
                                    <span className="font-medium">{CURRENCY} {(contract.rate ?? 0).toLocaleString()} / sqft</span>
                                </div>
                            </div>
                        ) : (
                            <div className="md:col-span-2"></div>
                        )}

                        <div>
                            <span className="text-slate-500 block">Start Date</span>
                            <span className="font-medium">{formatDate(contract.startDate)}</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block">End Date</span>
                            <span className="font-medium">{formatDate(contract.endDate)}</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block">Status</span>
                            <span className={`font-bold ${contract.status === 'Active' ? 'text-emerald-600' : 'text-slate-600'}`}>{contract.status}</span>
                        </div>
                    </div>
                </div>

                {contract.expenseCategoryItems && contract.expenseCategoryItems.length > 0 && (
                    <div className="mb-6">
                        <h4 className="font-bold text-slate-700 mb-2 border-b pb-1">Contract Items (Scope of Work)</h4>
                        <table className="w-full text-sm border-collapse border border-slate-300">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="border border-slate-300 px-3 py-2 text-left text-slate-700">Category</th>
                                    <th className="border border-slate-300 px-3 py-2 text-center text-slate-700">Unit</th>
                                    <th className="border border-slate-300 px-3 py-2 text-right text-slate-700">Quantity</th>
                                    <th className="border border-slate-300 px-3 py-2 text-right text-slate-700">Rate</th>
                                    <th className="border border-slate-300 px-3 py-2 text-right text-slate-700">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contract.expenseCategoryItems.map((item, index) => {
                                    const category = state.categories.find(c => c.id === item.categoryId);
                                    return (
                                        <tr key={index}>
                                            <td className="border border-slate-300 px-3 py-2 text-slate-700">{category?.name || 'Unknown'}</td>
                                            <td className="border border-slate-300 px-3 py-2 text-center text-slate-700">{item.unit}</td>
                                            <td className="border border-slate-300 px-3 py-2 text-right text-slate-700 tabular-nums">{item.quantity?.toLocaleString()}</td>
                                            <td className="border border-slate-300 px-3 py-2 text-right text-slate-700 tabular-nums">{CURRENCY} {item.pricePerUnit?.toLocaleString()}</td>
                                            <td className="border border-slate-300 px-3 py-2 text-right font-medium text-slate-800 tabular-nums">{CURRENCY} {item.netValue?.toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 font-bold">
                                    <td colSpan={4} className="border border-slate-300 px-3 py-2 text-right text-slate-700">Total:</td>
                                    <td className="border border-slate-300 px-3 py-2 text-right text-slate-900 tabular-nums">{CURRENCY} {contract.totalAmount?.toLocaleString()}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                <div className="mb-6">
                    <h4 className="font-bold text-slate-700 mb-2 border-b pb-1">Financial Status</h4>
                    <div className="flex justify-between items-center mb-2 text-sm">
                        <span>Paid: {CURRENCY} {totalPaid.toLocaleString()}</span>
                        <span className={balance < 0 ? 'text-red-600 font-bold' : 'text-slate-600'}>
                            Remaining: {CURRENCY} {balance.toLocaleString()}
                        </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                        <div
                            className={`h-3 rounded-full ${balance < 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                    </div>
                </div>

                <div className="mb-6">
                    <h4 className="font-bold text-slate-700 mb-2 border-b pb-1">Terms & Conditions</h4>
                    <div className="whitespace-pre-wrap text-sm text-slate-600 leading-relaxed p-3 bg-slate-50 rounded border border-slate-100">
                        {contract.termsAndConditions || "No specific terms defined."}
                    </div>
                </div>

                <div className="mt-8 pt-12 border-t border-slate-300 flex justify-between text-xs text-slate-500">
                    <div className="text-center w-40">
                        <div className="border-t border-slate-400 mb-2"></div>
                        Employer Signature
                    </div>
                    <div className="text-center w-40">
                        <div className="border-t border-slate-400 mb-2"></div>
                        Contractor Signature
                    </div>
                </div>
                <ReportFooter />
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100 no-print">
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
                        onPrint={handlePrint}
                    />
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
};

export default ProjectContractDetailModal;
