
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
        <div className="w-[380px] flex-shrink-0 bg-app-card rounded-r-xl border border-app-border border-l-0 shadow-ds-card flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="p-4 border-b border-app-border bg-app-toolbar/40 flex-shrink-0">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm font-bold text-app-text">{agreement.agreementNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                agreement.status === RentalAgreementStatus.ACTIVE ? 'border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success' :
                                agreement.status === RentalAgreementStatus.RENEWED ? 'border-primary/25 bg-app-toolbar text-primary' :
                                agreement.status === RentalAgreementStatus.TERMINATED ? 'border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-ds-danger' :
                                'border-app-border bg-app-toolbar text-app-muted'
                            }`}>{agreement.status}</span>
                        </div>
                        {remainingDays !== null && (
                            <span className={`text-xs font-medium ${remainingDays <= 30 ? 'text-ds-warning' : 'text-app-muted'}`}>
                                {remainingDays > 0 ? `${remainingDays} days remaining` : 'Lease ended'}
                            </span>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="text-app-muted hover:text-app-text p-1 rounded-lg hover:bg-app-toolbar">
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
                            <Button type="button" variant="secondary" onClick={() => onRenew(agreement)} className="!text-xs !py-1.5 !px-3 flex-1 !border-ds-success/35 !bg-[color:var(--badge-paid-bg)] !text-ds-success hover:!opacity-90">
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
                <div className="p-3 bg-app-toolbar/50 rounded-lg border border-app-border">
                    <h4 className="text-[10px] font-bold text-app-muted uppercase tracking-wider mb-2">Property</h4>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 text-app-muted">{ICONS.building}</div>
                            <span className="text-xs text-app-muted">Building:</span>
                            <span className="text-xs font-medium text-app-text">{building?.name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 text-app-muted">{ICONS.home}</div>
                            <span className="text-xs text-app-muted">Property:</span>
                            <span className="text-xs font-medium text-app-text">{property?.name || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                {/* Tenant & Owner */}
                <div className="p-3 bg-app-toolbar/50 rounded-lg border border-app-border">
                    <h4 className="text-[10px] font-bold text-app-muted uppercase tracking-wider mb-2">Parties</h4>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 text-app-muted">{ICONS.users}</div>
                            <span className="text-xs text-app-muted">Tenant:</span>
                            <span className="text-xs font-medium text-app-text">{tenant?.name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 text-app-muted">{ICONS.idCard}</div>
                            <span className="text-xs text-app-muted">Owner:</span>
                            <span className="text-xs font-medium text-app-text">{owner?.name || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                {/* Lease Dates */}
                <div className="p-3 bg-app-toolbar/50 rounded-lg border border-app-border">
                    <h4 className="text-[10px] font-bold text-app-muted uppercase tracking-wider mb-2">Lease Period</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <span className="text-[10px] text-app-muted block">Start Date</span>
                            <span className="text-xs font-medium text-app-text">{formatDate(agreement.startDate)}</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-app-muted block">End Date</span>
                            <span className="text-xs font-medium text-app-text">{formatDate(agreement.endDate)}</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-app-muted block">Due Day</span>
                            <span className="text-xs font-medium text-app-text">Day {agreement.rentDueDate || 1}</span>
                        </div>
                        {remainingDays !== null && (
                            <div>
                                <span className="text-[10px] text-app-muted block">Remaining</span>
                                <span className={`text-xs font-medium ${remainingDays <= 30 ? 'text-ds-warning' : remainingDays <= 0 ? 'text-ds-danger' : 'text-app-text'}`}>
                                    {remainingDays > 0 ? `${remainingDays} days` : 'Ended'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Financial Summary */}
                <div className="p-3 bg-app-toolbar/50 rounded-lg border border-app-border">
                    <h4 className="text-[10px] font-bold text-app-muted uppercase tracking-wider mb-2">Financials</h4>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-xs text-app-muted">Monthly Rent</span>
                            <span className="text-xs font-bold text-app-text">{CURRENCY} {(parseFloat(String(agreement.monthlyRent)) || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-xs text-app-muted">Security Deposit</span>
                            <span className="text-xs font-medium text-app-text">{agreement.securityDeposit ? `${CURRENCY} ${(parseFloat(String(agreement.securityDeposit)) || 0).toLocaleString()}` : '-'}</span>
                        </div>
                        {broker && (
                            <>
                                <div className="border-t border-app-border pt-1.5 flex justify-between">
                                    <span className="text-xs text-app-muted">Broker</span>
                                    <span className="text-xs font-medium text-app-text">{broker.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs text-app-muted">Broker Fee</span>
                                    <span className="text-xs font-medium text-app-text">{agreement.brokerFee ? `${CURRENCY} ${(parseFloat(String(agreement.brokerFee)) || 0).toLocaleString()}` : '-'}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Description/Notes */}
                {agreement.description && (
                    <div className="p-3 bg-app-toolbar/50 rounded-lg border border-app-border">
                        <h4 className="text-[10px] font-bold text-app-muted uppercase tracking-wider mb-1">Notes</h4>
                        <p className="text-xs text-app-text whitespace-pre-wrap">{agreement.description}</p>
                    </div>
                )}

                {/* Linked Invoices */}
                <div className="p-3 bg-app-toolbar/50 rounded-lg border border-app-border">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-app-muted uppercase tracking-wider">Invoices ({linkedInvoices.length})</h4>
                        {openInvoices.length > 0 && (
                            <span className="text-[10px] font-bold text-ds-warning bg-ds-warning/10 border border-ds-warning/30 px-1.5 py-0.5 rounded-full">
                                {openInvoices.length} open
                            </span>
                        )}
                    </div>
                    {linkedInvoices.length > 0 ? (
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                            {linkedInvoices.slice(0, 10).map(inv => {
                                const isSecurityDeposit = (inv.securityDepositCharge || 0) > 0;
                                return (
                                    <div key={inv.id} className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-app-toolbar/60">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="font-mono text-app-muted text-[10px]">{inv.invoiceNumber}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                                isSecurityDeposit ? 'border-primary/30 bg-app-toolbar text-primary' : 'border-app-border bg-app-toolbar text-app-text'
                                            }`}>{isSecurityDeposit ? 'Security' : 'Rental'}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                                inv.status === InvoiceStatus.PAID ? 'border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success' :
                                                inv.status === InvoiceStatus.UNPAID ? 'border-ds-warning/35 bg-app-toolbar text-ds-warning' :
                                                'border-app-border bg-app-toolbar text-app-muted'
                                            }`}>{inv.status}</span>
                                        </div>
                                        <span className="font-medium text-app-text tabular-nums flex-shrink-0">{CURRENCY} {(inv.amount || 0).toLocaleString()}</span>
                                    </div>
                                );
                            })}
                            {linkedInvoices.length > 10 && (
                                <div className="text-[10px] text-app-muted text-center pt-1">...and {linkedInvoices.length - 10} more</div>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-app-muted italic">No invoices linked to this agreement.</p>
                    )}
                </div>

                {/* Previous Agreement Chain */}
                {agreement.previousAgreementId && (
                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/25">
                        <h4 className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Renewal Chain</h4>
                        <p className="text-xs text-app-text">
                            Renewed from: {state.rentalAgreements.find(a => a.id === agreement.previousAgreementId)?.agreementNumber || agreement.previousAgreementId}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RentalAgreementDetailPanel;
