
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, ContactType } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { useNotification } from '../../context/NotificationContext';
import { ContactsApiRepository } from '../../services/api/repositories/contactsApi';

/** Normalize API contact (snake_case) to app Contact (camelCase) so it displays correctly. */
function normalizeContactFromApi(api: any): Contact {
    return {
        id: api.id,
        name: api.name,
        type: api.type,
        description: api.description ?? undefined,
        contactNo: api.contact_no ?? api.contactNo ?? undefined,
        companyName: api.company_name ?? api.companyName ?? undefined,
        address: api.address ?? undefined,
    };
}

interface ContactTypeOption {
    id: ContactType;
    label: string;
    icon: React.ReactNode;
    color: string;
    description: string;
}

const ContactsManagement: React.FC = () => {
    const { state: appState, dispatch: appDispatch } = useAppContext();
    const { showConfirm, showToast } = useNotification();

    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<ContactType>(ContactType.OWNER);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');

    // Grid state
    const [gridSearchQuery, setGridSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [selectedContactTypeFilter, setSelectedContactTypeFilter] = useState<ContactType | null>(null);

    // Contact type options matching the reference
    const contactTypes: ContactTypeOption[] = [
        {
            id: ContactType.OWNER,
            label: 'Owner',
            icon: ICONS.home,
            color: 'blue',
            description: 'Property owners and landlords'
        },
        {
            id: ContactType.TENANT,
            label: 'Tenant',
            icon: ICONS.users,
            color: 'emerald',
            description: 'Renters and tenants'
        },
        {
            id: ContactType.LEAD,
            label: 'Lead',
            icon: ICONS.target,
            color: 'amber',
            description: 'Potential customers'
        },
        {
            id: ContactType.BROKER,
            label: 'Broker',
            icon: ICONS.briefcase,
            color: 'purple',
            description: 'Real estate brokers'
        },
        {
            id: ContactType.FRIEND_FAMILY,
            label: 'Friend & Family',
            icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>,
            color: 'rose',
            description: 'Friends and family contacts'
        }
    ];

    // Calculate balances for contacts
    const balances = useMemo(() => {
        const balanceMap = new Map<string, number>();
        appState.transactions.forEach(t => {
            if (t.contactId) {
                const current = balanceMap.get(t.contactId) || 0;
                balanceMap.set(t.contactId, current + (t.amount || 0));
            }
        });
        return balanceMap;
    }, [appState.transactions]);


    // Get all contacts for grid, filtered and sorted
    const gridContacts = useMemo(() => {
        let contacts = [...appState.contacts];

        // Apply contact type filter if a tab is selected
        if (selectedContactTypeFilter) {
            contacts = contacts.filter(c => c.type === selectedContactTypeFilter);
        }

        // Apply search filter
        if (gridSearchQuery) {
            const query = gridSearchQuery.toLowerCase();
            contacts = contacts.filter(c =>
                c.name?.toLowerCase().includes(query) ||
                c.contactNo?.toLowerCase().includes(query) ||
                c.companyName?.toLowerCase().includes(query) ||
                c.address?.toLowerCase().includes(query) ||
                c.description?.toLowerCase().includes(query) ||
                (c.description && c.description.toLowerCase().includes(query)) // email might be in description
            );
        }

        // Apply sorting
        if (sortConfig) {
            contacts.sort((a, b) => {
                let aVal: any = a[sortConfig.key as keyof Contact];
                let bVal: any = b[sortConfig.key as keyof Contact];

                // Handle undefined/null values
                if (aVal === undefined || aVal === null) aVal = '';
                if (bVal === undefined || bVal === null) bVal = '';

                // Convert to strings for comparison
                aVal = String(aVal).toLowerCase();
                bVal = String(bVal).toLowerCase();

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            // Default sort by name
            contacts.sort((a, b) => a.name.localeCompare(b.name));
        }

        return contacts;
    }, [appState.contacts, gridSearchQuery, sortConfig, selectedContactTypeFilter]);

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const getTypeConfig = (type: ContactType) => {
        return contactTypes.find(t => t.id === type) || contactTypes[0];
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast('Full Name is required', 'error');
            return;
        }

        const contactData: Omit<Contact, 'id'> = {
            name: name.trim(),
            type: selectedType,
            contactNo: phone.trim() || undefined,
            companyName: company.trim() || undefined,
            address: address.trim() || undefined,
            description: notes.trim() || undefined
        };

        // Store email in description field (since Contact interface doesn't have email)
        // Format: "email:user@example.com\n[other notes]"
        if (email.trim()) {
            const emailLine = `email:${email.trim()}`;
            contactData.description = notes.trim()
                ? `${emailLine}\n${notes.trim()}`
                : emailLine;
        }

        try {
            const contactsApi = new ContactsApiRepository();

            if (editingContact) {
                const updated = await contactsApi.update(editingContact.id, contactData);
                showToast('Contact updated successfully', 'success');
                appDispatch({ type: 'UPDATE_CONTACT', payload: normalizeContactFromApi(updated) });
            } else {
                const created = await contactsApi.create(contactData);
                showToast('Contact created successfully', 'success');
                appDispatch({ type: 'ADD_CONTACT', payload: normalizeContactFromApi(created) });
            }

            // Reset form and close
            handleResetForm(true);
        } catch (error: any) {
            console.error('Error saving contact:', error);
            const errorMessage = error?.message || error?.error || 'Failed to save contact';

            if (error?.status === 409 || errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
                showToast('A contact with this name already exists', 'error');
            } else {
                showToast(`Error: ${errorMessage}`, 'error');
            }
        }
    };

    const handleResetForm = (closeForm = false) => {
        setName('');
        setEmail('');
        setPhone('');
        setCompany('');
        setAddress('');
        setNotes('');
        setEditingContact(null);
        setSelectedType(ContactType.OWNER);
        if (closeForm) {
            setIsFormOpen(false);
        }
    };

    const handleOpenForm = () => {
        // Reset form fields
        setName('');
        setEmail('');
        setPhone('');
        setCompany('');
        setAddress('');
        setNotes('');
        setEditingContact(null);
        // Set type based on filter or default to Owner
        if (selectedContactTypeFilter) {
            setSelectedType(selectedContactTypeFilter);
        } else {
            setSelectedType(ContactType.OWNER);
        }
        setIsFormOpen(true);
    };

    const handleEdit = (contact: Contact) => {
        setEditingContact(contact);
        setName(contact.name);
        setSelectedType(contact.type);
        setPhone(contact.contactNo || '');
        setCompany(contact.companyName || '');
        setAddress(contact.address || '');

        // Extract email from description
        const emailMatch = contact.description?.match(/^email:(.+?)(?:\n|$)/);
        if (emailMatch) {
            setEmail(emailMatch[1]);
            setNotes(contact.description.replace(/^email:.+?\n?/, '').trim());
        } else {
            setEmail('');
            setNotes(contact.description || '');
        }

        if (!isFormOpen) {
            setIsFormOpen(true);
        }
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (contact: Contact) => {
        const confirmed = await showConfirm(
            `Are you sure you want to delete "${contact.name}"? This action cannot be undone.`
        );
        if (confirmed) {
            try {
                const contactsApi = new ContactsApiRepository();
                await contactsApi.delete(contact.id);
                showToast('Contact deleted successfully', 'success');
                appDispatch({ type: 'DELETE_CONTACT', payload: contact.id });

                if (editingContact?.id === contact.id) {
                    handleResetForm();
                }
            } catch (error: any) {
                console.error('Error deleting contact:', error);
                showToast(`Error: ${error?.message || 'Failed to delete contact'}`, 'error');
            }
        }
    };

    const extractEmail = (contact: Contact): string => {
        const emailMatch = contact.description?.match(/^email:(.+?)(?:\n|$)/);
        return emailMatch ? emailMatch[1] : '';
    };

    const getTypeBadgeColor = (type: ContactType) => {
        const config = getTypeConfig(type);
        return {
            bg: config.color === 'blue' ? 'bg-blue-100' :
                config.color === 'emerald' ? 'bg-emerald-100' :
                    config.color === 'orange' ? 'bg-orange-100' :
                        config.color === 'amber' ? 'bg-amber-100' :
                            config.color === 'rose' ? 'bg-rose-100' :
                                'bg-purple-100',
            text: config.color === 'blue' ? 'text-blue-700' :
                config.color === 'emerald' ? 'text-emerald-700' :
                    config.color === 'orange' ? 'text-orange-700' :
                        config.color === 'amber' ? 'text-amber-700' :
                            config.color === 'rose' ? 'text-rose-700' :
                                'text-purple-700'
        };
    };

    const activeTypeConfig = getTypeConfig(selectedType);

    return (
        <div className="flex flex-col h-full space-y-4 overflow-hidden px-0 pt-2 pb-2">
            {/* Contact Type Filter Tabs - Top Level (for both form and grid) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 gap-2">
                    <div className="flex overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent flex-1 min-w-0">
                        <button
                            onClick={() => {
                                setSelectedContactTypeFilter(null);
                                setSelectedType(ContactType.OWNER);
                            }}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                                ${selectedContactTypeFilter === null
                                    ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-500'
                                    : 'border-2 border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }
                            `}
                        >
                            <div className={`w-4 h-4 ${selectedContactTypeFilter === null ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {ICONS.users}
                            </div>
                            <span>All Contacts</span>
                        </button>
                        {contactTypes.map((type) => {
                            const isSelected = selectedContactTypeFilter === type.id;
                            return (
                                <button
                                    key={type.id}
                                    onClick={() => {
                                        setSelectedContactTypeFilter(type.id);
                                        setSelectedType(type.id);
                                    }}
                                    className={`
                                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ml-2
                                        ${isSelected
                                            ? (type.color === 'blue' ? 'bg-blue-50 text-blue-700 border-2 border-blue-500' :
                                                type.color === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-500' :
                                                    type.color === 'orange' ? 'bg-orange-50 text-orange-700 border-2 border-orange-500' :
                                                        type.color === 'amber' ? 'bg-amber-50 text-amber-700 border-2 border-amber-500' :
                                                            'bg-purple-50 text-purple-700 border-2 border-purple-500')
                                            : 'border-2 border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }
                                    `}
                                >
                                    <div className={`w-4 h-4 ${isSelected ? (
                                        type.color === 'blue' ? 'text-blue-600' :
                                            type.color === 'emerald' ? 'text-emerald-600' :
                                                type.color === 'orange' ? 'text-orange-600' :
                                                    type.color === 'amber' ? 'text-amber-600' :
                                                        'text-purple-600'
                                    ) : 'text-slate-400'}`}>
                                        {type.icon}
                                    </div>
                                    <span>{type.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isFormOpen) {
                                setIsFormOpen(false);
                            } else {
                                handleOpenForm();
                            }
                        }}
                        className={`
                            flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg transition-all
                            ${isFormOpen
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                            }
                        `}
                        title={isFormOpen ? 'Close Form' : 'Add New Contact'}
                    >
                        <div className={`w-5 h-5 transition-transform ${isFormOpen ? 'rotate-45' : ''}`}>
                            {ICONS.plus}
                        </div>
                    </button>
                </div>
            </div>

            {/* Add New Contact Form - Collapsible */}
            {isFormOpen && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Add New Contact</h2>
                            <p className="text-xs text-slate-500">
                                {selectedContactTypeFilter
                                    ? `Fill in the details for the new ${getTypeConfig(selectedType).label}.`
                                    : 'Fill in the details. Select a contact type from the tabs above if needed.'}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Form Fields - Compact Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="sm:col-span-2 lg:col-span-1">
                                <Input
                                    label="Full Name *"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="John Doe"
                                    required
                                    autoFocus
                                    className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                                />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-1">
                                <Input
                                    label="Email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="john@example.com (optional)"
                                    className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                                />
                            </div>
                            <Input
                                label="Phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="+1 (555) 000-0000"
                                className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                            />
                            <Input
                                label="Company"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                placeholder="Company name"
                                className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input
                                label="Address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Street address, City, State"
                                className="text-sm border-slate-300 border-2 focus:border-indigo-500"
                            />
                            <div className="max-w-md">
                                <Textarea
                                    label="Notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Additional notes about this contact..."
                                    rows={1}
                                    className="text-sm !border-slate-300 !border-2 focus:!border-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="flex items-end gap-2">
                            {editingContact && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => handleResetForm()}
                                    className="flex-1 text-sm py-2"
                                >
                                    Cancel
                                </Button>
                            )}
                            <Button
                                type="submit"
                                className={`flex-1 text-sm py-2 ${activeTypeConfig.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' :
                                    activeTypeConfig.color === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                        activeTypeConfig.color === 'orange' ? 'bg-orange-600 hover:bg-orange-700' :
                                            activeTypeConfig.color === 'amber' ? 'bg-amber-600 hover:bg-amber-700' :
                                                'bg-purple-600 hover:bg-purple-700'
                                    } text-white`}
                            >
                                {editingContact ? 'Update' : `Add ${activeTypeConfig.label}`}
                            </Button>
                        </div>
                    </form>
                </div >
            )}

            {/* Data Grid - Full Width */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
                {/* Search Bar */}
                <div className="p-4 border-b border-slate-200 flex-shrink-0">
                    <div className="relative">
                        <Input
                            value={gridSearchQuery}
                            onChange={(e) => setGridSearchQuery(e.target.value)}
                            placeholder="Search contacts..."
                            className="w-full bg-white border-slate-200 shadow-sm focus:ring-2 focus:ring-indigo-100 transition-all rounded-lg pl-10"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        {gridSearchQuery && (
                            <button
                                onClick={() => setGridSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                    <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                {[
                                    { key: 'name', label: 'Name' },
                                    { key: 'type', label: 'Type' },
                                    { key: 'contactNo', label: 'Phone' },
                                    { key: 'companyName', label: 'Company' },
                                    { key: 'address', label: 'Address' },
                                    { key: 'description', label: 'Email/Notes' },
                                    { key: 'balance', label: 'Balance' },
                                    { key: 'actions', label: 'Actions' }
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        className={`px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${col.key === 'actions' || col.key === 'balance' ? 'text-right' : ''
                                            } ${col.key !== 'actions' ? 'cursor-pointer hover:bg-slate-100' : ''
                                            }`}
                                        onClick={() => col.key !== 'actions' && handleSort(col.key)}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {sortConfig?.key === col.key && (
                                                <div className="w-3 h-3 text-indigo-600">
                                                    {sortConfig.direction === 'asc' ? ICONS.arrowUp : ICONS.arrowDown}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-50">
                            {gridContacts.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                                        {gridSearchQuery
                                            ? 'No contacts found matching your search.'
                                            : 'No contacts found. Add your first contact above!'
                                        }
                                    </td>
                                </tr>
                            ) : (
                                gridContacts.map((contact) => {
                                    const typeConfig = getTypeConfig(contact.type);
                                    const badgeColors = getTypeBadgeColor(contact.type);
                                    const contactEmail = extractEmail(contact);
                                    const notesOnly = contact.description?.replace(/^email:.+?\n?/, '').trim() || '';

                                    return (
                                        <tr
                                            key={contact.id}
                                            className="hover:bg-indigo-50/30 transition-colors group"
                                        >
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <div className="font-semibold text-sm text-slate-900">{contact.name}</div>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badgeColors.bg} ${badgeColors.text}`}>
                                                    {typeConfig.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                                                {contact.contactNo || '-'}
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                                                {contact.companyName || '-'}
                                            </td>
                                            <td className="px-4 py-2 text-xs text-slate-600 max-w-xs truncate">
                                                {contact.address || '-'}
                                            </td>
                                            <td className="px-4 py-2 text-xs text-slate-600">
                                                <div className="space-y-0.5">
                                                    {contactEmail && (
                                                        <div className="text-slate-700 truncate max-w-xs">{contactEmail}</div>
                                                    )}
                                                    {notesOnly && (
                                                        <div className="text-slate-500 text-xs truncate max-w-xs">
                                                            {notesOnly}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-right text-xs font-semibold">
                                                <span className={(balances.get(contact.id) || 0) >= 0 ? 'text-slate-700' : 'text-rose-600'}>
                                                    {CURRENCY} {(balances.get(contact.id) || 0).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-right">
                                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleEdit(contact)}
                                                        className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-1 rounded transition-colors"
                                                        title="Edit"
                                                    >
                                                        <div className="w-3.5 h-3.5">{ICONS.edit}</div>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(contact)}
                                                        className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 p-1 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <div className="w-3.5 h-3.5">{ICONS.trash}</div>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
};

export default ContactsManagement;
