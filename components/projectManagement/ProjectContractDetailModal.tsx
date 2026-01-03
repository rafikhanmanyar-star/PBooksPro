
import React, { useMemo } from 'react';
import { Contract } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY, ICONS } from '../../constants';
import Button from '../ui/Button';
import { formatDate } from '../../utils/dateUtils';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';
import { WhatsAppService } from '../../services/whatsappService';

interface ProjectContractDetailModalProps {
    contract: Contract;
    onClose: () => void;
    onEdit: () => void;
}

const ProjectContractDetailModal: React.FC<ProjectContractDetailModalProps> = ({ contract, onClose, onEdit }) => {
    const { state } = useAppContext();
    
    const project = state.projects.find(p => p.id === contract.projectId);
    const vendor = state.contacts.find(c => c.id === contract.vendorId);

    const payments = useMemo(() => {
        return state.transactions
            .filter(tx => tx.contractId === contract.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [state.transactions, contract.id]);

    const totalPaid = payments.reduce((sum, tx) => sum + tx.amount, 0);
    const balance = contract.totalAmount - totalPaid;
    const progress = contract.totalAmount > 0 ? (totalPaid / contract.totalAmount) * 100 : 0;

    const handlePrint = () => window.print();

    const handleWhatsApp = () => {
        if (!vendor?.contactNo) {
            alert("Vendor contact number not found.");
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
            message += `Total Value: ${CURRENCY} ${contract.totalAmount.toLocaleString()}\n`;
            message += `Paid to Date: ${CURRENCY} ${totalPaid.toLocaleString()}\n`;
            message += `Balance: ${CURRENCY} ${balance.toLocaleString()}\n\n`;
            message += `Terms:\n${contract.termsAndConditions}`;

            WhatsAppService.sendMessage({ contact: vendor, message });
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };

    return (
        <div className="h-full flex flex-col">
             <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 12.7mm;
                    }
                    html, body {
                        height: auto !important;
                        overflow: visible !important;
                        background: white !important;
                    }
                    body * { 
                        visibility: hidden; 
                    }
                    .printable-area, .printable-area * { 
                        visibility: visible !important; 
                    }
                    .printable-area { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%; 
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 15mm !important;
                        background: white; 
                        z-index: 9999;
                        box-sizing: border-box;
                    }
                    .no-print { 
                        display: none !important; 
                    }
                    /* Ensure colors print */
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    /* Prevent page breaks inside important sections */
                    .printable-area > div {
                        page-break-inside: avoid;
                    }
                    /* Ensure proper text wrapping */
                    .printable-area p,
                    .printable-area div {
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    /* Grid adjustments for print */
                    .printable-area .grid {
                        display: grid !important;
                    }
                }
            `}</style>

            <div className="flex-grow overflow-y-auto printable-area p-4 bg-white">
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
                            <span className="font-bold text-lg">{CURRENCY} {contract.totalAmount.toLocaleString()}</span>
                        </div>
                        {contract.area && contract.rate ? (
                            <div className="md:col-span-2 grid grid-cols-2 gap-4 bg-white p-2 rounded border border-slate-100">
                                <div>
                                    <span className="text-slate-400 block text-xs uppercase">Total Area</span>
                                    <span className="font-medium">{contract.area.toLocaleString()} sqft</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-xs uppercase">Rate</span>
                                    <span className="font-medium">{CURRENCY} {contract.rate.toLocaleString()} / sqft</span>
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
                    <Button variant="secondary" onClick={handleWhatsApp} className="text-green-600 bg-green-50 border-green-200 hover:bg-green-100">
                        <div className="w-4 h-4 mr-2">{ICONS.whatsapp}</div> Share
                    </Button>
                    <Button onClick={handlePrint} className="bg-slate-800 text-white">
                        <div className="w-4 h-4 mr-2">{ICONS.print}</div> Print
                    </Button>
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
};

export default ProjectContractDetailModal;
