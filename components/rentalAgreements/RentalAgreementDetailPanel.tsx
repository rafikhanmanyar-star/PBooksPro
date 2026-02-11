
import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { RentalAgreement, RentalAgreementStatus, InvoiceStatus } from '../../types';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';

interface RentalAgreementDetailPanelProps {
    agreement: RentalAgreement;
    onClose: () => void;
    onEdit: (agreement: RentalAgreement) => void;
    onRenew: (agreement: RentalAgreement) => void;
    onTerminate: (agreement: RentalAgreement) => void;
}

const RentalAgreementDetailPanel: React.FC<RentalAgreementDetailPanelProps> = ({
    agreement, onClose, onEdit, onRenew, onTerminate
}) => {
    const { state } = useAppContext();

    const property = useMemo(() => state.properties.find(p => p.id === agreement.propertyId), [agreement.propertyId, state.properties]);
    const tenant = useMemo(() => state.contacts.find(c => c.id === agreement.contactId), [agreement.contactId, state.contacts]);
    const ownerId = agreement.ownerId || property?.ownerId;
    const owner = useMemo(() => ownerId ? state.contacts.find(c => c.id === ownerId) : null, [ownerId, state.contacts]);
    const building = useMemo(() => property ? state.buildings.find(b => b.id === property.buildingId) : null, [property, state.buildings]);
    const broker = useMemo(() => agreement.brokerId ? state.contacts.find(c => c.id === agreement.brokerId) : null, [agreement.brokerId, state.contacts]);

    const linkedInvoices = useMemo(() =>
        state.invoices
            .filter(i => i.agreementId === agreement.id)
            .sort((a, b) => new Date(b.dueDate || b.issueDate).getTime() - new Date(a.dueDate || a.issueDate).getTime()),
        [agreement.id, state.invoices]
    );

    const openInvoices = useMemo(() => linkedInvoices.filter(i => i.status !== InvoiceStatus.PAID), [linkedInvoices]);

    // Calculate remaining days
    const remainingDays = useMemo(() => {
        if (agreement.status !== RentalAgreementStatus.ACTIVE) return null;
        const end = new Date(agreement.endDate);
        const today = new Date();
        const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diff;
    }, [agreement]);

    const isActive = agreement.status === RentalAgreementStatus.ACTIVE;

    return (
        <div className="w-[380px] flex-shrink-0 bg-white rounded-r-xl border border-slate-200 border-l-0 shadow-sm flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm font-bold text-slate-800">{agreement.agreementNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                agreement.status === RentalAgreementStatus.ACTIVE ? 'bg-emerald-100 text-emerald-800' :
                                agreement.status === RentalAgreementStatus.RENEWED ? 'bg-blue-100 text-blue-800' :
                                agreement.status === RentalAgreementStatus.TERMINATED ? 'bg-rose-100 text-rose-800' :
                                'bg-slate-200 text-slate-700'
                            }`}>{agreement.status}</span>
                        </div>
                        {remainingDays !== null && (
                            <span className={`text-xs font-medium ${remainingDays <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                                {remainingDays > 0 ? `${remainingDays} days remaining` : 'Lease ended'}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                        <div className="w-4 h-4">{ICONS.x}</div>
                    </button>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-3">
                    <Button type="button" variant="secondary" onClick={() => onEdit(agreement)} className="!text-xs !py-1.5 !px-3 flex-1">
                        <div className="w-3.5 h-3.5 mr-1">{ICONS.edit}</div> Edit
                    </Button>
                    {isActive && (
                        <>
                            <Button type="button" variant="secondary" onClick={() => onRenew(agreement)} className="!text-xs !py-1.5 !px-3 flex-1 !bg-emerald-50 !text-emerald-700 !border-emerald-200 hover:!bg-emerald-100">
                                <div className="w-3.5 h-3.5 mr-1">{ICONS.repeat}</div> Renew
                            </Button>
                            <Button type="button" variant="danger" onClick={() => onTerminate(agreement)} className="!text-xs !py-1.5 !px-3 flex-1">
                                End
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-grow overflow-y-auto p-4 space-y-3 min-h-0">
                {/* Property & Building */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Property</h4>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 text-slate-400">{ICONS.building}</div>
                            <span className="text-xs text-slate-500">Building:</span>
                            <span className="text-xs font-medium text-slate-800">{building?.name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 text-slate-400">{ICONS.home}</div>
                            <span className="text-xs text-slate-500">Property:</span>
                            <span className="text-xs font-medium text-slate-800">{property?.name || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                {/* Tenant & Owner */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Parties</h4>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 text-slate-400">{ICONS.users}</div>
                            <span className="text-xs text-slate-500">Tenant:</span>
                            <span className="text-xs font-medium text-slate-800">{tenant?.name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 text-slate-400">{ICONS.idCard}</div>
                            <span className="text-xs text-slate-500">Owner:</span>
                            <span className="text-xs font-medium text-slate-800">{owner?.name || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                {/* Lease Dates */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Lease Period</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <span className="text-[10px] text-slate-500 block">Start Date</span>
                            <span className="text-xs font-medium text-slate-800">{formatDate(agreement.startDate)}</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-slate-500 block">End Date</span>
                            <span className="text-xs font-medium text-slate-800">{formatDate(agreement.endDate)}</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-slate-500 block">Due Day</span>
                            <span className="text-xs font-medium text-slate-800">Day {agreement.rentDueDate || 1}</span>
                        </div>
                        {remainingDays !== null && (
                            <div>
                                <span className="text-[10px] text-slate-500 block">Remaining</span>
                                <span className={`text-xs font-medium ${remainingDays <= 30 ? 'text-amber-600' : remainingDays <= 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                    {remainingDays > 0 ? `${remainingDays} days` : 'Ended'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Financial Summary */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Financials</h4>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-xs text-slate-500">Monthly Rent</span>
                            <span className="text-xs font-bold text-slate-800">{CURRENCY} {(parseFloat(String(agreement.monthlyRent)) || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-xs text-slate-500">Security Deposit</span>
                            <span className="text-xs font-medium text-slate-800">{agreement.securityDeposit ? `${CURRENCY} ${(parseFloat(String(agreement.securityDeposit)) || 0).toLocaleString()}` : '-'}</span>
                        </div>
                        {broker && (
                            <>
                                <div className="border-t border-slate-200 pt-1.5 flex justify-between">
                                    <span className="text-xs text-slate-500">Broker</span>
                                    <span className="text-xs font-medium text-slate-800">{broker.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs text-slate-500">Broker Fee</span>
                                    <span className="text-xs font-medium text-slate-800">{agreement.brokerFee ? `${CURRENCY} ${(parseFloat(String(agreement.brokerFee)) || 0).toLocaleString()}` : '-'}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Description/Notes */}
                {agreement.description && (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</h4>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{agreement.description}</p>
                    </div>
                )}

                {/* Linked Invoices */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoices ({linkedInvoices.length})</h4>
                        {openInvoices.length > 0 && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                {openInvoices.length} open
                            </span>
                        )}
                    </div>
                    {linkedInvoices.length > 0 ? (
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                            {linkedInvoices.slice(0, 10).map(inv => (
                                <div key={inv.id} className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-white/80">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-slate-600 text-[10px]">{inv.invoiceNumber}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                            inv.status === InvoiceStatus.PAID ? 'bg-emerald-100 text-emerald-700' :
                                            inv.status === InvoiceStatus.UNPAID ? 'bg-amber-100 text-amber-700' :
                                            'bg-slate-100 text-slate-600'
                                        }`}>{inv.status}</span>
                                    </div>
                                    <span className="font-medium text-slate-700 tabular-nums flex-shrink-0">{CURRENCY} {(inv.amount || 0).toLocaleString()}</span>
                                </div>
                            ))}
                            {linkedInvoices.length > 10 && (
                                <div className="text-[10px] text-slate-400 text-center pt-1">...and {linkedInvoices.length - 10} more</div>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 italic">No invoices linked to this agreement.</p>
                    )}
                </div>

                {/* Previous Agreement Chain */}
                {agreement.previousAgreementId && (
                    <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200/60">
                        <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Renewal Chain</h4>
                        <p className="text-xs text-blue-700">
                            Renewed from: {state.rentalAgreements.find(a => a.id === agreement.previousAgreementId)?.agreementNumber || agreement.previousAgreementId}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RentalAgreementDetailPanel;
