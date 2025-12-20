
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, ContactType, TransactionType, LoanSubtype } from '../../types';
import ContactForm from '../settings/ContactForm';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { ICONS, CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import Input from '../ui/Input';
import SettingsLedgerModal from '../settings/SettingsLedgerModal';
import Tabs from '../ui/Tabs';
import { ImportType } from '../../services/importService';

type SortKey = 'name' | 'type' | 'companyName' | 'contactNo' | 'address' | 'balance';

const ContactsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm } = useNotification();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
    const [ledgerModal, setLedgerModal] = useState<{ isOpen: boolean; contact: Contact | null }>({ isOpen: false, contact: null });

    const TABS = ['All', 'Owners', 'Tenants', 'Brokers', 'Friends & Family'];

    // Compute balances for all contacts
    const contactBalances = useMemo(() => {
        const balances = new Map<string, number>();
        
        state.transactions.forEach(tx => {
            if (!tx.contactId) return;
            
            let amount = 0;
            if (tx.type === TransactionType.INCOME) amount = tx.amount; // They paid us (positive)
            else if (tx.type === TransactionType.EXPENSE) amount = -tx.amount; // We paid them (negative)
            else if (tx.type === TransactionType.LOAN) {
                if (tx.subtype === LoanSubtype.RECEIVE) amount = tx.amount; // Money in
                else amount = -tx.amount; // Money out
            }
            
            balances.set(tx.contactId, (balances.get(tx.contactId) || 0) + amount);
        });

        return balances;
    }, [state.transactions]);

    const contacts = useMemo(() => {
        let filtered = state.contacts.filter(c => c.type !== ContactType.VENDOR && c.type !== ContactType.STAFF);
        
        if (activeTab !== 'All') {
            if (activeTab === 'Owners') filtered = filtered.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
            else if (activeTab === 'Tenants') filtered = filtered.filter(c => c.type === ContactType.TENANT);
            else if (activeTab === 'Brokers') filtered = filtered.filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER);
            else if (activeTab === 'Friends & Family') filtered = filtered.filter(c => c.type === ContactType.FRIEND_FAMILY);
        }
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(c => 
                c.name.toLowerCase().includes(q) || 
                c.contactNo?.includes(q) ||
                (c.companyName && c.companyName.toLowerCase().includes(q)) ||
                (c.address && c.address.toLowerCase().includes(q))
            );
        }
        
        return filtered.sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortConfig.key === 'balance') {
                valA = contactBalances.get(a.id) || 0;
                valB = contactBalances.get(b.id) || 0;
            } else {
                valA = (a[sortConfig.key] || '').toString().toLowerCase();
                valB = (b[sortConfig.key] || '').toString().toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [state.contacts, activeTab, searchQuery, sortConfig, contactBalances]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const handleSaveContact = (contactData: Omit<Contact, 'id'>) => {
        if (contactToEdit) {
            dispatch({ type: 'UPDATE_CONTACT', payload: { ...contactToEdit, ...contactData } });
        } else {
            dispatch({ type: 'ADD_CONTACT', payload: { ...contactData, id: Date.now().toString() } });
        }
        setIsModalOpen(false);
        setContactToEdit(null);
    };

    const handleDeleteContact = async () => {
        if (!contactToEdit) return;
        const confirmed = await showConfirm(`Are you sure you want to delete "${contactToEdit.name}"? This cannot be undone.`);
        if (confirmed) {
            dispatch({ type: 'DELETE_CONTACT', payload: contactToEdit.id });
            setIsModalOpen(false);
            setContactToEdit(null);
        }
    };
    
    const openAddModal = () => {
        setContactToEdit(null);
        setIsModalOpen(true);
    };

    const openEditModal = (contact: Contact, e: React.MouseEvent) => {
        e.stopPropagation();
        setContactToEdit(contact);
        setIsModalOpen(true);
    };

    const openLedger = (contact: Contact) => {
        setLedgerModal({ isOpen: true, contact });
    };

    // Determine default type for new contact based on active tab
    const getDefaultType = () => {
        switch(activeTab) {
            case 'Owners': return ContactType.OWNER;
            case 'Tenants': return ContactType.TENANT;
            case 'Brokers': return ContactType.BROKER;
            case 'Friends & Family': return ContactType.FRIEND_FAMILY;
            default: return undefined;
        }
    };

    const allowedTypes = [
        ContactType.OWNER, ContactType.TENANT, ContactType.CLIENT, 
        ContactType.BROKER, ContactType.DEALER, ContactType.FRIEND_FAMILY
    ];

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex flex-col gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex-shrink-0">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-slate-800">Contacts</h2>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.CONTACTS });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                        >
                            <div className="w-4 h-4 mr-2">{ICONS.download}</div> Bulk Import
                        </Button>
                        <Button onClick={openAddModal}>
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div> Add Contact
                        </Button>
                    </div>
                </div>
                
                <Tabs tabs={TABS} activeTab={activeTab} onTabClick={setActiveTab} />
                
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <span className="h-4 w-4">{ICONS.search}</span>
                    </div>
                    <Input 
                        placeholder="Search contacts..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="pl-9"
                    />
                </div>
            </div>

            <div className="flex-grow overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
                <div className="overflow-auto flex-grow">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                            <tr>
                                <th onClick={() => handleSort('name')} className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap transition-colors">
                                    Name <SortIcon column="name"/>
                                </th>
                                <th onClick={() => handleSort('type')} className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap transition-colors">
                                    Type <SortIcon column="type"/>
                                </th>
                                <th onClick={() => handleSort('companyName')} className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap transition-colors">
                                    Company <SortIcon column="companyName"/>
                                </th>
                                <th onClick={() => handleSort('contactNo')} className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap transition-colors">
                                    Phone <SortIcon column="contactNo"/>
                                </th>
                                <th onClick={() => handleSort('address')} className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap transition-colors">
                                    Address <SortIcon column="address"/>
                                </th>
                                <th onClick={() => handleSort('balance')} className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap transition-colors">
                                    Balance <SortIcon column="balance"/>
                                </th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700 whitespace-nowrap">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {contacts.length > 0 ? (
                                contacts.map(contact => {
                                    const balance = contactBalances.get(contact.id) || 0;
                                    return (
                                        <tr 
                                            key={contact.id} 
                                            className="hover:bg-gray-50 cursor-pointer transition-colors group"
                                            onClick={() => openLedger(contact)}
                                        >
                                            <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                                                {contact.name}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-block bg-gray-100 text-gray-700 text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide whitespace-nowrap">
                                                    {contact.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                                {contact.companyName || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 font-mono whitespace-nowrap">
                                                {contact.contactNo || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 truncate max-w-xs" title={contact.address}>
                                                {contact.address || '-'}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold font-mono whitespace-nowrap ${balance > 0 ? 'text-green-600' : balance < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                {CURRENCY} {Math.abs(balance).toLocaleString()}
                                                <span className="text-[10px] font-normal ml-1 text-gray-400">
                                                    {balance > 0 ? '(Cr)' : balance < 0 ? '(Dr)' : ''}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button 
                                                    onClick={(e) => openEditModal(contact, e)}
                                                    className="text-gray-400 hover:text-green-600 p-1.5 rounded-full hover:bg-green-50 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Edit Contact"
                                                >
                                                    <div className="w-4 h-4">{ICONS.edit}</div>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-12 h-12 opacity-20 mb-2">{ICONS.users}</div>
                                            <p>No contacts found.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 font-medium">
                    Total Contacts: {contacts.length}
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={contactToEdit ? `Edit Contact` : `New Contact`}>
                <ContactForm 
                    onSubmit={handleSaveContact} 
                    onCancel={() => setIsModalOpen(false)} 
                    contactToEdit={contactToEdit || undefined}
                    onDelete={handleDeleteContact}
                    existingContacts={state.contacts}
                    fixedTypeForNew={contactToEdit ? undefined : getDefaultType()}
                    allowedTypesForNew={allowedTypes}
                />
            </Modal>

            {ledgerModal.contact && (
                <SettingsLedgerModal 
                    isOpen={ledgerModal.isOpen}
                    onClose={() => setLedgerModal({ isOpen: false, contact: null })}
                    entityId={ledgerModal.contact.id}
                    entityType="contact"
                    entityName={ledgerModal.contact.name}
                />
            )}
        </div>
    );
};

export default ContactsPage;
