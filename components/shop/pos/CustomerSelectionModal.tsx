
import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import { ICONS, CURRENCY } from '../../../constants';
import { usePOS } from '../../../context/POSContext';
import { ContactsApiRepository } from '../../../services/api/repositories/contactsApi';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { POSCustomer } from '../../../types/pos';
import { Contact } from '../../../types';

interface CustomerSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CustomerSelectionModal: React.FC<CustomerSelectionModalProps> = ({ isOpen, onClose }) => {
    const { setCustomer } = usePOS();
    const { members } = useLoyalty();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    const contactsApi = new ContactsApiRepository();

    useEffect(() => {
        if (isOpen) {
            fetchContacts();
        }
    }, [isOpen]);

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const data = await contactsApi.findAll();
            setContacts(data);
        } catch (error) {
            console.error('Failed to fetch contacts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (contact: Contact) => {
        // Find if this contact is a loyalty member
        const loyaltyMember = members.find(m => m.customerId === contact.id || m.phone === contact.contactNo);

        const posCustomer: POSCustomer = {
            id: contact.id,
            name: contact.name,
            phone: contact.contactNo || 'N/A',
            email: undefined, // Add if available
            points: loyaltyMember?.pointsBalance || 0,
            creditLimit: 0, // Default or fetch from somewhere
            balance: 0, // Default or fetch from somewhere
            tier: loyaltyMember?.tier || 'Standard'
        };

        setCustomer(posCustomer);
        onClose();
    };

    const filteredContacts = contacts.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.contactNo && c.contactNo.includes(searchQuery))
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Select Customer"
            size="lg"
        >
            <div className="space-y-4">
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {ICONS.search}
                    </span>
                    <input
                        type="text"
                        placeholder="Search by name or phone..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center gap-4 text-slate-400">
                            <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin"></div>
                            <span className="font-bold text-xs uppercase tracking-widest">Loading Customers...</span>
                        </div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="py-20 text-center text-slate-400">
                            <p className="font-bold italic">No customers found</p>
                            <p className="text-xs">Try searching with a different name or phone number.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {filteredContacts.map(contact => {
                                const loyaltyMember = members.find(m => m.customerId === contact.id || m.phone === contact.contactNo);
                                return (
                                    <button
                                        key={contact.id}
                                        onClick={() => handleSelect(contact)}
                                        className="flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-300 hover:bg-slate-50 transition-all text-left group"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-lg group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                            {contact.name.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-slate-800 truncate">{contact.name}</div>
                                            <div className="text-[10px] text-slate-500 font-medium">{contact.contactNo || 'No phone'}</div>
                                            {loyaltyMember && (
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase tracking-widest">
                                                        {loyaltyMember.tier}
                                                    </span>
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                                        {loyaltyMember.pointsBalance} Points
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        {ICONS.chevronRight}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                    <button className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2">
                        {ICONS.plus} Register New Customer
                    </button>
                    <button
                        onClick={() => {
                            setCustomer({
                                id: 'walk-in',
                                name: 'Walk-in Customer',
                                phone: '',
                                points: 0,
                                creditLimit: 0,
                                balance: 0,
                                tier: 'Standard'
                            });
                            onClose();
                        }}
                        className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                    >
                        Use Walk-in
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CustomerSelectionModal;
