
import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, ContactType, Bill, Transaction } from '../../types';
import ContactForm from '../settings/ContactForm';
import VendorLedger from './VendorLedger';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { ICONS } from '../../constants';
import VendorInfo from './VendorInfo';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { useNotification } from '../../context/NotificationContext';

const AddVendorSection: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSubmit = (contact: Omit<Contact, 'id'>) => {
        dispatch({ type: 'ADD_CONTACT', payload: { ...contact, id: Date.now().toString() } });
        setIsModalOpen(false);
    };

    return (
        <>
            <div className="bg-white p-3 border-b border-gray-200 flex-shrink-0">
                <Button onClick={() => setIsModalOpen(true)}>
                    {ICONS.plus}
                    <span>Add New Vendor</span>
                </Button>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Vendor/Supplier">
                <ContactForm
                    onSubmit={handleSubmit}
                    onCancel={() => setIsModalOpen(false)}
                    fixedTypeForNew={ContactType.VENDOR}
                    existingContacts={state.contacts}
                />
            </Modal>
        </>
    );
};

const VendorPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm } = useNotification();
    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<{ id: string; type: 'bill' | 'transaction' } | null>(null);
    const [warningModalState, setWarningModalState] = useState<{
        isOpen: boolean;
        transaction: Transaction | null;
        action: 'edit' | 'delete' | null;
    }>({ isOpen: false, transaction: null, action: null });

    const vendors = state.contacts
        .filter(c => c.type === ContactType.VENDOR)
        .sort((a, b) => a.name.localeCompare(b.name));
        
    const selectedVendor = vendors.find(v => v.id === selectedVendorId) || null;
    
    const billToEdit = editingItem?.type === 'bill' ? state.bills.find(b => b.id === editingItem.id) : undefined;
    const transactionToEdit = editingItem?.type === 'transaction' ? state.transactions.find(t => t.id === editingItem.id) : undefined;


    const handleUpdateVendor = (contactData: Omit<Contact, 'id'>) => {
        if (!selectedVendor) return;
        dispatch({ type: 'UPDATE_CONTACT', payload: { ...selectedVendor, ...contactData } });
        setIsEditModalOpen(false);
    };

    const handleDeleteVendor = async () => {
        if (!selectedVendor) return;
        const confirmed = await showConfirm(`Are you sure you want to delete vendor "${selectedVendor.name}"? This cannot be undone.`);
        if (confirmed) {
            dispatch({ type: 'DELETE_CONTACT', payload: selectedVendor.id });
            setSelectedVendorId(null);
            setIsEditModalOpen(false);
        }
    };
    
    const handleLedgerItemSelect = (id: string, type: 'bill' | 'transaction') => {
        setEditingItem({ id, type });
    };

    const handleShowDeleteWarning = (tx: Transaction) => {
        setEditingItem(null); // Close the form modal first
        setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' });
    };

    const handleConfirmWarning = () => {
        const { transaction, action } = warningModalState;
        if (!transaction || action !== 'delete') return;

        dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
        
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const handleCloseWarning = () => {
        if (warningModalState.action === 'delete' && warningModalState.transaction) {
            setEditingItem({ id: warningModalState.transaction.id, type: 'transaction' });
        }
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const getLinkedItemName = (tx: Transaction | null): string => {
        if (!tx) return '';
        if (tx.invoiceId) {
            const invoice = state.invoices.find(i => i.id === tx.invoiceId);
            return `Invoice #${invoice?.invoiceNumber || 'N/A'}`;
        }
        if (tx.billId) {
            const bill = state.bills.find(b => b.id === tx.billId);
            return `Bill #${bill?.billNumber || 'N/A'}`;
        }
        if (tx.payslipId) {
            const allPayslips = [...state.projectPayslips, ...state.rentalPayslips];
            const payslip = allPayslips.find(p => p.id === tx.payslipId);
            const staff = payslip ? state.contacts.find(c => c.id === payslip.staffId) : null;
            return `the payslip for ${staff?.name || 'staff'} for month ${payslip?.month || 'N/A'}`;
        }
        return 'a linked item';
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <AddVendorSection />
            <div className="flex-grow flex gap-4 p-4 min-h-0">
                <div className="w-1/3 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-base font-semibold p-3 border-b border-gray-200 text-gray-700 flex-shrink-0">All Vendors</h3>
                    <div className="overflow-y-auto">
                        {vendors.length > 0 ? (
                            <ul className="divide-y divide-gray-200">
                                {vendors.map(vendor => (
                                    <li key={vendor.id}>
                                        <button 
                                            onClick={() => setSelectedVendorId(vendor.id)}
                                            className={`w-full text-left p-3 text-sm transition-colors duration-150 ${selectedVendorId === vendor.id ? 'bg-blue-50 text-primary font-semibold' : 'hover:bg-gray-50'}`}
                                        >
                                            {vendor.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="p-4 text-sm text-gray-500 text-center">No vendors added yet.</p>
                        )}
                    </div>
                </div>
                <div className="w-2/3 flex flex-col gap-4 min-h-0">
                    {selectedVendor ? (
                        <>
                            <VendorInfo vendor={selectedVendor} onEdit={() => setIsEditModalOpen(true)} />

                            <div className="flex-grow flex flex-col bg-white p-4 rounded-lg shadow-sm border border-gray-200 min-h-0">
                                <h3 className="text-base font-semibold mb-3 text-gray-700 flex-shrink-0">Transaction Ledger</h3>
                                <div className="flex-grow overflow-y-auto">
                                    <VendorLedger vendorId={selectedVendor.id} onItemClick={handleLedgerItemSelect} />
                                </div>
                            </div>

                            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit: ${selectedVendor.name}`}>
                                <ContactForm
                                    contactToEdit={selectedVendor}
                                    onSubmit={handleUpdateVendor}
                                    onDelete={handleDeleteVendor}
                                    onCancel={() => setIsEditModalOpen(false)}
                                    existingContacts={state.contacts}
                                />
                            </Modal>
                        </>
                    ) : (
                        <div className="flex-grow flex items-center justify-center bg-white rounded-lg shadow-sm border border-dashed border-gray-300">
                            <p className="text-gray-500">Select a vendor to view details and ledger.</p>
                        </div>
                    )}
                </div>
            </div>
            
            {billToEdit && (
                <Modal isOpen={true} onClose={() => setEditingItem(null)} title="Edit Bill">
                    <InvoiceBillForm 
                        onClose={() => setEditingItem(null)} 
                        type="bill" 
                        itemToEdit={billToEdit} 
                    />
                </Modal>
            )}

            {transactionToEdit && (
                <Modal isOpen={true} onClose={() => setEditingItem(null)} title="Edit Payment Transaction">
                    <TransactionForm 
                        key={transactionToEdit.id}
                        onClose={() => setEditingItem(null)} 
                        transactionToEdit={transactionToEdit}
                        onShowDeleteWarning={handleShowDeleteWarning}
                    />
                </Modal>
            )}

            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={handleCloseWarning}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action === 'edit' ? 'update' : 'delete'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
            />
        </div>
    );
};

export default VendorPage;
