
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { InvoiceType, InvoiceStatus, Invoice, ContactType } from '../../types';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import RentalPaymentModal from '../invoices/RentalPaymentModal';
import { ICONS, CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Card from '../ui/Card';
import Button from '../ui/Button';

const RentalPaymentSearch: React.FC = () => {
    const { state } = useAppContext();
    const [selectedBuildingId, setSelectedBuildingId] = useState('');
    const [selectedOwnerId, setSelectedOwnerId] = useState('');
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);

    // Derived Lists for Filters
    const buildings = useMemo(() => state.buildings.map(b => ({ id: b.id, name: b.name })), [state.buildings]);
    const owners = useMemo(() => state.contacts.filter(c => c.type === ContactType.OWNER).map(c => ({ id: c.id, name: c.name })), [state.contacts]);
    const tenants = useMemo(() => state.contacts.filter(c => c.type === ContactType.TENANT).map(c => ({ id: c.id, name: c.name })), [state.contacts]);

    // Filter Logic
    const filteredInvoices = useMemo(() => {
        return state.invoices
            .filter(inv => inv.invoiceType === InvoiceType.RENTAL && inv.status !== InvoiceStatus.PAID)
            .map(inv => {
                let buildingId = inv.buildingId;
                let ownerId = '';
                const property = state.properties.find(p => p.id === inv.propertyId);
                
                if (property) {
                    if (!buildingId) buildingId = property.buildingId;
                    ownerId = property.ownerId;
                }
                
                return {
                    ...inv,
                    resolvedBuildingId: buildingId,
                    resolvedOwnerId: ownerId,
                    propertyName: property?.name || 'Unknown Unit',
                    tenantName: state.contacts.find(c => c.id === inv.contactId)?.name || 'Unknown Tenant',
                    ownerName: state.contacts.find(c => c.id === ownerId)?.name || 'Unknown Owner'
                };
            })
            .filter(inv => {
                if (selectedBuildingId && inv.resolvedBuildingId !== selectedBuildingId) return false;
                if (selectedOwnerId && inv.resolvedOwnerId !== selectedOwnerId) return false;
                if (selectedTenantId && inv.contactId !== selectedTenantId) return false;
                
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    return (
                        inv.invoiceNumber.toLowerCase().includes(q) ||
                        inv.tenantName.toLowerCase().includes(q) ||
                        inv.propertyName.toLowerCase().includes(q)
                    );
                }
                return true;
            })
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()); // Sort by Due Date ascending (oldest first)
    }, [state.invoices, state.properties, state.contacts, selectedBuildingId, selectedOwnerId, selectedTenantId, searchQuery]);

    return (
        <div className="flex flex-col h-full space-y-3">
            <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="relative">
                        <Input 
                            placeholder="Search..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 py-1.5 text-sm"
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                    </div>
                    <ComboBox 
                        items={buildings} 
                        selectedId={selectedBuildingId} 
                        onSelect={(item) => setSelectedBuildingId(item?.id || '')} 
                        placeholder="Building"
                        allowAddNew={false}
                    />
                    <ComboBox 
                        items={owners} 
                        selectedId={selectedOwnerId} 
                        onSelect={(item) => setSelectedOwnerId(item?.id || '')} 
                        placeholder="Owner"
                        allowAddNew={false}
                    />
                    <ComboBox 
                        items={tenants} 
                        selectedId={selectedTenantId} 
                        onSelect={(item) => setSelectedTenantId(item?.id || '')} 
                        placeholder="Tenant"
                        allowAddNew={false}
                    />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-1">
                {filteredInvoices.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                        {filteredInvoices.map(invoice => {
                            const isSecurity = (invoice.securityDepositCharge || 0) > 0 || (invoice.description || '').toLowerCase().includes('security');
                            
                            return (
                            <div key={invoice.id} className="bg-white p-3 rounded border border-slate-200 hover:border-indigo-300 transition-all flex flex-col sm:flex-row sm:items-center gap-3 group shadow-sm cursor-pointer" onClick={() => setPaymentInvoice(invoice)}>
                                {/* Compact Left Info */}
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-slate-800 text-sm">#{invoice.invoiceNumber}</span>
                                        {isSecurity 
                                            ? <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold border border-amber-200">Security</span>
                                            : <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-bold border border-sky-200">Rent</span>
                                        }
                                        <span className="text-xs text-slate-500 truncate ml-1 font-medium">{invoice.tenantName}</span>
                                    </div>
                                    <div className="text-xs text-slate-600 italic truncate mb-1.5" title={invoice.description}>{invoice.description || 'No description'}</div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                        <span className="bg-slate-100 px-1.5 rounded border border-slate-200">Due: {formatDate(invoice.dueDate)}</span>
                                        <span className="truncate max-w-[150px] font-medium text-slate-600">{invoice.propertyName}</span>
                                    </div>
                                </div>
                                
                                {/* Compact Right Action */}
                                <div className="flex flex-row sm:flex-col justify-between sm:items-end gap-2 flex-shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                                     <span className="font-bold text-rose-600 text-sm">Due: {CURRENCY} {(invoice.amount - invoice.paidAmount).toLocaleString()}</span>
                                    <Button onClick={(e) => { e.stopPropagation(); setPaymentInvoice(invoice); }} size="sm" className="h-7 text-xs px-3 bg-indigo-600 hover:bg-indigo-700 shadow-sm py-0">
                                        Receive
                                    </Button>
                                </div>
                            </div>
                        )})}
                    </div>
                ) : (
                    <div className="text-center py-12 text-slate-500">
                        <div className="mx-auto h-12 w-12 opacity-30 mb-3">{ICONS.fileText}</div>
                        <p>No pending invoices match.</p>
                    </div>
                )}
            </div>

            {paymentInvoice && (
                <RentalPaymentModal 
                    isOpen={!!paymentInvoice} 
                    onClose={() => setPaymentInvoice(null)} 
                    invoice={paymentInvoice} 
                />
            )}
        </div>
    );
};

export default RentalPaymentSearch;
