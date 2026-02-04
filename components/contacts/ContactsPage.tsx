
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, Vendor, ContactType, TransactionType, LoanSubtype } from '../../types';
import ContactForm from '../settings/ContactForm';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { ICONS, CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import Input from '../ui/Input';
import SettingsLedgerModal from '../settings/SettingsLedgerModal';
import Tabs from '../ui/Tabs';
import { ImportType } from '../../services/importService';
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import useLocalStorage from '../../hooks/useLocalStorage';

type SortKey = 'name' | 'type' | 'companyName' | 'contactNo' | 'address' | 'balance';

interface ContactTreeNode {
    id: string;
    label: string;
    type: 'type' | 'contact';
    children: ContactTreeNode[];
    value?: number;
}

/** Premium tree sidebar: same style as Project Agreements (Directories, avatars, orange active, chevron) */
const ContactTreeSidebar: React.FC<{
    nodes: ContactTreeNode[];
    selectedId: string | null;
    selectedType: 'type' | 'contact' | null;
    onSelect: (id: string, type: 'type' | 'contact') => void;
}> = ({ nodes, selectedId, selectedType, onSelect }) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(nodes.map(n => n.id)));

    useEffect(() => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            nodes.forEach(n => next.add(n.id));
            return next;
        });
    }, [nodes]);

    const toggleExpanded = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const renderNode = (node: ContactTreeNode, level: number) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const isSelected = selectedId === node.id && selectedType === node.type;
        const initials = node.label.slice(0, 2).toUpperCase();

        return (
            <div key={node.id} className={level > 0 ? 'ml-4 border-l border-slate-200/80 pl-3' : ''}>
                <div
                    className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg -mx-0.5 transition-all cursor-pointer ${isSelected ? 'bg-orange-500/10 text-orange-700' : 'hover:bg-slate-100/80 text-slate-700 hover:text-slate-900'
                        }`}
                    onClick={() => onSelect(node.id, node.type)}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(node.id); }}
                            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        >
                            <div className="w-3.5 h-3.5">{ICONS.chevronRight}</div>
                        </button>
                    ) : (
                        <span className="w-5 flex-shrink-0" />
                    )}
                    <span className="flex-shrink-0 w-6 h-6 rounded-md bg-slate-800 text-slate-200 text-[10px] font-bold flex items-center justify-center">
                        {initials}
                    </span>
                    <span className="flex-1 text-xs font-medium truncate">{node.label}</span>
                    {node.value !== undefined && node.value > 0 && (
                        <span className={`text-[10px] font-semibold tabular-nums ${isSelected ? 'text-orange-600' : 'text-slate-500'}`}>
                            {node.value}
                        </span>
                    )}
                </div>
                {hasChildren && isExpanded && (
                    <div className="mt-0.5">
                        {node.children.map(child => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (!nodes || nodes.length === 0) {
        return <div className="text-xs text-slate-400 italic p-2">No directories match your search</div>;
    }

    return (
        <div className="space-y-0.5">
            {nodes.map(node => renderNode(node, 0))}
        </div>
    );
};

const ContactsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showAlert } = useNotification();
    const { openChat } = useWhatsApp();

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

    // Tree sidebar (same style as Project Agreements)
    const [treeSearchQuery, setTreeSearchQuery] = useState('');
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<'type' | 'contact' | null>(null);
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('contacts_sidebarWidth', 280);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
    const [ledgerModal, setLedgerModal] = useState<{ isOpen: boolean; contact: Contact | null }>({ isOpen: false, contact: null });
    const isSubmittingRef = useRef(false);

    const TABS = ['All', 'Owners', 'Tenants', 'Brokers', 'Vendors', 'Friends & Family'];

    // Sync activeTab when tree type is selected
    useEffect(() => {
        if (selectedTreeType === 'type' && selectedTreeId && TABS.includes(selectedTreeId)) {
            setActiveTab(selectedTreeId);
        }
    }, [selectedTreeType, selectedTreeId]);

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

    // Tree data: two levels — Type (Owners, Tenants, Brokers, Friends & Family) -> Contacts
    const treeData = useMemo<ContactTreeNode[]>(() => {
        const baseContacts = state.contacts.filter(c => c.type !== ContactType.STAFF);
        const typeConfig: { id: string; label: string; filter: (c: Contact) => boolean }[] = [
            { id: 'Owners', label: 'Owners', filter: c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT },
            { id: 'Tenants', label: 'Tenants', filter: c => c.type === ContactType.TENANT },
            { id: 'Brokers', label: 'Brokers', filter: c => c.type === ContactType.BROKER || c.type === ContactType.DEALER },
            { id: 'Friends & Family', label: 'Friends & Family', filter: c => c.type === ContactType.FRIEND_FAMILY },
        ];

        const nodes = typeConfig.map(({ id, label, filter }) => {
            const childrenContacts = baseContacts.filter(filter);
            return {
                id,
                label,
                type: 'type' as const,
                value: childrenContacts.length,
                children: childrenContacts
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(c => ({ id: c.id, label: c.name, type: 'contact' as const, children: [], value: undefined })),
            };
        });

        // Add Vendors Node
        if (state.vendors && state.vendors.length > 0) {
            nodes.push({
                id: 'Vendors',
                label: 'Vendors',
                type: 'type',
                value: state.vendors.length,
                children: state.vendors
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(v => ({ id: v.id, label: v.name, type: 'contact', children: [], value: undefined }))
            });
        }

        return nodes.filter(node => node.value! > 0);
    }, [state.contacts, state.vendors]);

    const filterContactTree = useCallback((nodes: ContactTreeNode[], q: string): ContactTreeNode[] => {
        if (!q.trim()) return nodes;
        const lower = q.toLowerCase();
        return nodes
            .map(node => {
                const labelMatch = node.label.toLowerCase().includes(lower);
                const filteredChildren = node.children?.length ? filterContactTree(node.children, q) : [];
                const childMatch = filteredChildren.length > 0;
                if (labelMatch && !filteredChildren.length) return node;
                if (childMatch) return { ...node, children: filteredChildren };
                if (labelMatch) return node;
                return null;
            })
            .filter((n): n is ContactTreeNode => n != null);
    }, []);

    const filteredTreeData = useMemo(() => filterContactTree(treeData, treeSearchQuery), [treeData, treeSearchQuery, filterContactTree]);

    // Sidebar resize: container-relative (150–600px)
    const handleMouseMoveSidebar = useCallback((e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerLeft = containerRef.current.getBoundingClientRect().left;
        const newWidth = e.clientX - containerLeft;
        if (newWidth > 150 && newWidth < 600) setSidebarWidth(newWidth);
    }, [setSidebarWidth]);

    useEffect(() => {
        if (!isResizing) return;
        const handleUp = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMoveSidebar);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMoveSidebar);
            window.removeEventListener('mouseup', handleUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, handleMouseMoveSidebar]);

    const startResizingSidebar = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
    }, []);

    const contacts = useMemo(() => {
        let filtered = state.contacts.filter(c => c.type !== ContactType.STAFF);

        if (selectedTreeType === 'contact' && selectedTreeId) {
            // Check both contacts and vendors for selection
            const vendor = state.vendors?.find(v => v.id === selectedTreeId);
            if (vendor) {
                filtered = [vendor as unknown as Contact];
            } else {
                filtered = filtered.filter(c => c.id === selectedTreeId);
            }
        } else if (activeTab !== 'All') {
            if (activeTab === 'Owners') filtered = filtered.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
            else if (activeTab === 'Tenants') filtered = filtered.filter(c => c.type === ContactType.TENANT);
            else if (activeTab === 'Brokers') filtered = filtered.filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER);
            else if (activeTab === 'Friends & Family') filtered = filtered.filter(c => c.type === ContactType.FRIEND_FAMILY);
            else if (activeTab === 'Vendors') filtered = (state.vendors || []) as unknown as Contact[];
        } else {
            // All tab: include vendors
            filtered = [...filtered, ...((state.vendors || []) as unknown as Contact[])];
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
    }, [state.contacts, state.vendors, activeTab, searchQuery, sortConfig, contactBalances, selectedTreeType, selectedTreeId]);

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
        // Prevent multiple submissions
        if (isSubmittingRef.current) {
            return;
        }
        isSubmittingRef.current = true;

        try {
            if (contactToEdit) {
                if (contactToEdit.type === ContactType.VENDOR) {
                    dispatch({ type: 'UPDATE_VENDOR', payload: { ...contactToEdit, ...contactData } as Vendor });
                } else {
                    dispatch({ type: 'UPDATE_CONTACT', payload: { ...contactToEdit, ...contactData } });
                }
            } else {
                if (activeTab === 'Vendors' || (contactData as any).type === ContactType.VENDOR) {
                    const vendorId = `vendor_${Date.now()}`; // Use vendor ID format
                    dispatch({ type: 'ADD_VENDOR', payload: { ...contactData, id: vendorId, type: ContactType.VENDOR } as Vendor });
                } else {
                    // Generate a unique ID that includes timestamp and random component
                    const contactId = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    dispatch({ type: 'ADD_CONTACT', payload: { ...contactData, id: contactId } });
                }
            }
            setIsModalOpen(false);
            setContactToEdit(null);
        } finally {
            // Reset after a short delay to allow the action to process
            setTimeout(() => {
                isSubmittingRef.current = false;
            }, 1000);
        }
    };

    const handleDeleteContact = async () => {
        if (!contactToEdit) return;
        const confirmed = await showConfirm(`Are you sure you want to delete "${contactToEdit.name}"? This cannot be undone.`);
        if (confirmed) {
            if (contactToEdit.type === ContactType.VENDOR) {
                dispatch({ type: 'DELETE_VENDOR', payload: contactToEdit.id });
            } else {
                dispatch({ type: 'DELETE_CONTACT', payload: contactToEdit.id });
            }
            handleCloseModal();
        }
    };

    const openAddModal = () => {
        setContactToEdit(null);
        isSubmittingRef.current = false; // Reset submission guard
        setIsModalOpen(true);
    };

    const openEditModal = (contact: Contact, e: React.MouseEvent) => {
        e.stopPropagation();
        setContactToEdit(contact);
        isSubmittingRef.current = false; // Reset submission guard
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setContactToEdit(null);
        isSubmittingRef.current = false; // Reset submission guard
    };

    const openLedger = (contact: Contact) => {
        setLedgerModal({ isOpen: true, contact });
    };

    const handleSendWhatsApp = async (contact: Contact, e: React.MouseEvent) => {
        e.stopPropagation();

        if (!contact.contactNo) {
            showAlert("This contact does not have a phone number saved.");
            return;
        }

        try {
            // Check if WhatsApp API is configured
            const { WhatsAppChatService } = await import('../../services/whatsappChatService');
            const isApiConfigured = await WhatsAppChatService.isConfigured();

            if (isApiConfigured) {
                // Open WhatsApp side panel (API connected)
                openChat(contact, contact.contactNo);
            } else {
                // Use manual WhatsApp (wa.me) - old method
                WhatsAppService.sendMessage({
                    contact,
                    message: `Hello ${contact.name}!`
                });
            }
        } catch (error) {
            // Fallback to manual WhatsApp if check fails
            console.warn('WhatsApp API check failed, using manual method:', error);
            WhatsAppService.sendMessage({
                contact,
                message: `Hello ${contact.name}!`
            });
        }
    };

    // Determine default type for new contact based on active tab
    const getDefaultType = () => {
        switch (activeTab) {
            case 'Owners': return ContactType.OWNER;
            case 'Tenants': return ContactType.TENANT;
            case 'Brokers': return ContactType.BROKER;
            case 'Vendors': return ContactType.VENDOR;
            case 'Friends & Family': return ContactType.FRIEND_FAMILY;
            default: return undefined;
        }
    };

    const allowedTypes = [
        ContactType.OWNER, ContactType.TENANT, ContactType.CLIENT,
        ContactType.BROKER, ContactType.DEALER, ContactType.FRIEND_FAMILY,
        ContactType.VENDOR
    ];

    return (
        <div className="flex flex-col h-full space-y-3 md:space-y-4">
            <div className="flex flex-col gap-3 md:gap-4 bg-white p-3 md:p-4 rounded-lg shadow-sm border border-slate-200 flex-shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800">Contacts</h2>
                    <div className="flex gap-2 w-full md:w-auto">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.CONTACTS });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                            className="flex-1 md:flex-none text-xs md:text-sm"
                        >
                            <div className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2">{ICONS.download}</div> <span className="hidden sm:inline">Bulk </span>Import
                        </Button>
                        <Button onClick={openAddModal} className="flex-1 md:flex-none text-xs md:text-sm">
                            <div className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2">{ICONS.plus}</div> Add<span className="hidden sm:inline"> Contact</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main: same layout as Project Agreements — sidebar + resize + content */}
            <div ref={containerRef} className="flex-grow flex flex-col md:flex-row overflow-hidden min-h-0">
                {/* Left: Resizable Tree Sidebar (Directories style) */}
                <aside
                    className="hidden md:flex flex-col flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                    style={{ width: `${sidebarWidth}px` }}
                >
                    <div className="flex-shrink-0 p-3 border-b border-slate-100 bg-slate-50/50">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Directories</span>
                    </div>
                    <div className="flex-shrink-0 px-2 pt-2 pb-1 border-b border-slate-100">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-slate-400">
                                <div className="w-3.5 h-3.5">{ICONS.search}</div>
                            </div>
                            <input
                                type="text"
                                placeholder="Search types, contacts..."
                                value={treeSearchQuery}
                                onChange={(e) => setTreeSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/80 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 placeholder:text-slate-400 transition-all"
                            />
                            {treeSearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setTreeSearchQuery('')}
                                    className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-rose-500"
                                >
                                    <div className="w-3.5 h-3.5">{ICONS.x}</div>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto overflow-x-hidden p-2 min-h-0">
                        <ContactTreeSidebar
                            nodes={filteredTreeData}
                            selectedId={selectedTreeId}
                            selectedType={selectedTreeType}
                            onSelect={(id, type) => {
                                if (selectedTreeId === id && selectedTreeType === type) {
                                    setSelectedTreeId(null);
                                    setSelectedTreeType(null);
                                } else {
                                    setSelectedTreeId(id);
                                    setSelectedTreeType(type);
                                }
                            }}
                        />
                    </div>
                </aside>

                <div
                    className="hidden md:flex items-center justify-center flex-shrink-0 w-2 cursor-col-resize select-none touch-none group hover:bg-blue-500/10 transition-colors"
                    onMouseDown={startResizingSidebar}
                    title="Drag to resize sidebar"
                >
                    <div className="w-0.5 h-12 rounded-full bg-slate-200 group-hover:bg-blue-500 group-hover:w-1 transition-all" />
                </div>

                {/* Right: Tabs, search, table */}
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                    <div className="flex flex-col gap-3 flex-shrink-0 bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-3 md:mb-0">
                        <Tabs tabs={TABS} activeTab={activeTab} onTabClick={(tab) => { setActiveTab(tab); setSelectedTreeId(null); setSelectedTreeType(null); }} />
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
                        {/* Mobile: Horizontal scroll wrapper with subtle scroll indicator */}
                        <div className="overflow-x-auto overflow-y-auto flex-grow -mx-px">
                            <table className="min-w-full divide-y divide-gray-200 text-xs md:text-sm">
                                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm border-b border-gray-200">
                                    <tr>
                                        <th onClick={() => handleSort('name')} className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 active:bg-gray-200 select-none whitespace-nowrap transition-colors touch-manipulation">
                                            Name <SortIcon column="name" />
                                        </th>
                                        <th onClick={() => handleSort('type')} className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 active:bg-gray-200 select-none whitespace-nowrap transition-colors touch-manipulation">
                                            Type <SortIcon column="type" />
                                        </th>
                                        <th onClick={() => handleSort('companyName')} className="hidden sm:table-cell px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 active:bg-gray-200 select-none whitespace-nowrap transition-colors touch-manipulation">
                                            Company <SortIcon column="companyName" />
                                        </th>
                                        <th onClick={() => handleSort('contactNo')} className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 active:bg-gray-200 select-none whitespace-nowrap transition-colors touch-manipulation">
                                            Phone <SortIcon column="contactNo" />
                                        </th>
                                        <th onClick={() => handleSort('address')} className="hidden lg:table-cell px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 active:bg-gray-200 select-none whitespace-nowrap transition-colors touch-manipulation">
                                            Address <SortIcon column="address" />
                                        </th>
                                        <th onClick={() => handleSort('balance')} className="px-2 md:px-4 py-2 md:py-3 text-right text-[10px] md:text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 active:bg-gray-200 select-none whitespace-nowrap transition-colors touch-manipulation">
                                            Balance <SortIcon column="balance" />
                                        </th>
                                        <th className="px-2 md:px-4 py-2 md:py-3 text-right text-[10px] md:text-xs font-semibold text-gray-700 whitespace-nowrap">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {contacts.length > 0 ? (
                                        contacts.map((contact, index) => {
                                            const balance = contactBalances.get(contact.id) || 0;
                                            return (
                                                <tr
                                                    key={contact.id}
                                                    className={`cursor-pointer transition-colors group touch-manipulation ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-slate-100`}
                                                    onClick={() => openLedger(contact)}
                                                >
                                                    <td className="px-2 md:px-4 py-2 md:py-3 font-medium text-gray-800 whitespace-nowrap text-xs md:text-sm">
                                                        {contact.name}
                                                    </td>
                                                    <td className="px-2 md:px-4 py-2 md:py-3">
                                                        <span className="inline-block bg-gray-100 text-gray-700 text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full font-medium uppercase tracking-wide whitespace-nowrap">
                                                            {contact.type}
                                                        </span>
                                                    </td>
                                                    <td className="hidden sm:table-cell px-2 md:px-4 py-2 md:py-3 text-gray-600 whitespace-nowrap text-xs md:text-sm">
                                                        {contact.companyName || '-'}
                                                    </td>
                                                    <td className="px-2 md:px-4 py-2 md:py-3 text-gray-600 font-mono whitespace-nowrap text-xs md:text-sm">
                                                        {contact.contactNo || '-'}
                                                    </td>
                                                    <td className="hidden lg:table-cell px-2 md:px-4 py-2 md:py-3 text-gray-600 truncate max-w-xs text-xs md:text-sm" title={contact.address}>
                                                        {contact.address || '-'}
                                                    </td>
                                                    <td className={`px-2 md:px-4 py-2 md:py-3 text-right font-bold font-mono whitespace-nowrap text-xs md:text-sm ${balance > 0 ? 'text-green-600' : balance < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                        <span className="hidden sm:inline">{CURRENCY} </span>{Math.abs(balance).toLocaleString()}
                                                        <span className="text-[9px] md:text-[10px] font-normal ml-0.5 md:ml-1 text-gray-400">
                                                            {balance > 0 ? '(Cr)' : balance < 0 ? '(Dr)' : ''}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 md:px-4 py-2 md:py-3 text-right">
                                                        <div className="flex justify-end gap-0.5 md:gap-1">
                                                            {contact.contactNo && WhatsAppService.isValidPhoneNumber(contact.contactNo) && (
                                                                <button
                                                                    onClick={(e) => handleSendWhatsApp(contact, e)}
                                                                    className="text-gray-400 hover:text-green-600 active:text-green-700 p-1 md:p-1.5 rounded-full hover:bg-green-50 active:bg-green-100 transition-colors md:opacity-0 md:group-hover:opacity-100 touch-manipulation"
                                                                    title="Send WhatsApp Message"
                                                                >
                                                                    <div className="w-3.5 h-3.5 md:w-4 md:h-4">{ICONS.whatsapp}</div>
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={(e) => openEditModal(contact, e)}
                                                                className="text-gray-400 hover:text-blue-600 active:text-blue-700 p-1 md:p-1.5 rounded-full hover:bg-blue-50 active:bg-blue-100 transition-colors md:opacity-0 md:group-hover:opacity-100 touch-manipulation"
                                                                title="Edit Contact"
                                                            >
                                                                <div className="w-3.5 h-3.5 md:w-4 md:h-4">{ICONS.edit}</div>
                                                            </button>
                                                        </div>
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
                        <div className="p-2 md:p-3 border-t border-slate-200 bg-slate-50 text-[10px] md:text-xs text-slate-500 font-medium">
                            Total Contacts: {contacts.length}
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={contactToEdit ? `Edit Contact` : `New Contact`}>
                <ContactForm
                    onSubmit={handleSaveContact}
                    onCancel={handleCloseModal}
                    contactToEdit={contactToEdit || undefined}
                    onDelete={handleDeleteContact}
                    existingContacts={state.contacts}
                    fixedTypeForNew={contactToEdit ? undefined : getDefaultType()}
                    allowedTypesForNew={allowedTypes}
                    isVendorForm={contactToEdit?.type === ContactType.VENDOR || activeTab === 'Vendors'}
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
