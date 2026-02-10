
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { RecurringInvoiceTemplate, Invoice, InvoiceType, InvoiceStatus, RecurringFrequency } from '../../types';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';
import useLocalStorage from '../../hooks/useLocalStorage';
import Select from '../ui/Select';
import InvoiceTreeView, { TreeNode } from '../invoices/InvoiceTreeView';
import ResizeHandle from '../ui/ResizeHandle';

type SortKey = 'tenant' | 'property' | 'amount' | 'nextDue' | 'frequency';

const RecurringInvoicesList: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();
    
    // --- State ---
    const [templateToEdit, setTemplateToEdit] = useState<RecurringInvoiceTemplate | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    // Persistent UI State
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('recurring_sidebarWidth', 300);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [buildingFilter, setBuildingFilter] = useState('all');
    
    // Selection & Sorting
    const [selectedNode, setSelectedNode] = useState<{ id: string; type: 'group' | 'subgroup' | 'invoice' } | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'nextDue', direction: 'asc' });

    // Resizing Refs
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // Editing inputs
    const [editAmount, setEditAmount] = useState('');
    const [editDay, setEditDay] = useState('');
    const [editNextDate, setEditNextDate] = useState('');
    const [editDesc, setEditDesc] = useState('');
    
    // New Editing Inputs for Auto Config
    const [editAutoGenerate, setEditAutoGenerate] = useState(false);
    const [editFrequency, setEditFrequency] = useState<RecurringFrequency>('Monthly');
    const [editTotalTransactions, setEditTotalTransactions] = useState('');
    const [editGeneratedCount, setEditGeneratedCount] = useState(0);
    const [editInvoiceType, setEditInvoiceType] = useState<InvoiceType>(InvoiceType.RENTAL);

    // --- Data Preparation ---

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

    // Base Data
    const templates = useMemo(() => state.recurringInvoiceTemplates || [], [state.recurringInvoiceTemplates]);

    // 1. Tree Data Construction
    const treeData = useMemo<TreeNode[]>(() => {
        const buildingMap = new Map<string, TreeNode>();

        // Initialize Buildings
        state.buildings.forEach(b => {
            buildingMap.set(b.id, {
                id: b.id,
                name: b.name,
                type: 'group',
                children: [],
                invoices: [], // Not used here but required by type
                count: 0,
                balance: 0 // Using this field to sum amounts
            });
        });

        // Add Unassigned
        buildingMap.set('unassigned', {
            id: 'unassigned',
            name: 'Unassigned',
            type: 'group',
            children: [],
            invoices: [],
            count: 0,
            balance: 0
        });

        templates.forEach(t => {
            const bId = t.buildingId || 'unassigned';
            const group = buildingMap.get(bId);
            
            if (group) {
                group.count++;
                group.balance += t.amount;

                // Subgroup by Property
                const property = state.properties.find(p => p.id === t.propertyId);
                const subId = t.propertyId || t.contactId; // Fallback to contact if property missing
                const subName = property ? property.name : (state.contacts.find(c => c.id === t.contactId)?.name || 'Unknown');

                let subgroup = group.children.find(c => c.id === subId);
                if (!subgroup) {
                    subgroup = {
                        id: subId,
                        name: subName,
                        type: 'subgroup',
                        children: [],
                        invoices: [],
                        count: 0,
                        balance: 0
                    };
                    group.children.push(subgroup);
                }
                
                subgroup.count++;
                subgroup.balance += t.amount;
            }
        });

        return Array.from(buildingMap.values())
            .filter(g => g.count > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [templates, state.buildings, state.properties, state.contacts]);

    // 2. Filtering for Grid
    const filteredTemplates = useMemo(() => {
        let result = templates;

        // Global Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(t => {
                const tenant = state.contacts.find(c => c.id === t.contactId);
                const property = state.properties.find(p => p.id === t.propertyId);
                return (
                    tenant?.name.toLowerCase().includes(q) ||
                    property?.name.toLowerCase().includes(q) ||
                    t.descriptionTemplate.toLowerCase().includes(q)
                );
            });
        }

        // Building Dropdown Filter
        if (buildingFilter !== 'all') {
            result = result.filter(t => t.buildingId === buildingFilter);
        }

        // Tree Selection Filter
        if (selectedNode) {
            if (selectedNode.type === 'group') {
                if (selectedNode.id === 'unassigned') {
                    result = result.filter(t => !t.buildingId);
                } else {
                    result = result.filter(t => t.buildingId === selectedNode.id);
                }
            } else if (selectedNode.type === 'subgroup') {
                // Filter by Property ID (which is the subgroup ID logic above)
                result = result.filter(t => t.propertyId === selectedNode.id || t.contactId === selectedNode.id);
            }
        }

        // Sorting
        return result.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (sortConfig.key) {
                case 'amount': valA = a.amount; valB = b.amount; break;
                case 'nextDue': valA = new Date(a.nextDueDate).getTime(); valB = new Date(b.nextDueDate).getTime(); break;
                case 'tenant': 
                    valA = state.contacts.find(c => c.id === a.contactId)?.name || '';
                    valB = state.contacts.find(c => c.id === b.contactId)?.name || '';
                    break;
                case 'property':
                    valA = state.properties.find(p => p.id === a.propertyId)?.name || '';
                    valB = state.properties.find(p => p.id === b.propertyId)?.name || '';
                    break;
                case 'frequency': valA = a.dayOfMonth || 0; valB = b.dayOfMonth || 0; break;
            }

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    }, [templates, searchQuery, buildingFilter, selectedNode, sortConfig, state.contacts, state.properties]);

    // --- Resize Logic ---
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = sidebarWidth;

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);

    const handleResize = useCallback((e: MouseEvent) => {
        if (isResizing.current) {
            const delta = e.clientX - startX.current;
            const newWidth = Math.max(200, Math.min(600, startWidth.current + delta));
            setSidebarWidth(newWidth);
        }
    }, [setSidebarWidth]);

    const stopResize = useCallback(() => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    // --- Handlers ---
    
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const calculateNextDate = (currentDate: Date, frequency: RecurringFrequency, dayOfMonth?: number): Date => {
        const nextDate = new Date(currentDate);
        
        if (frequency === 'Daily') {
            nextDate.setDate(nextDate.getDate() + 1);
        } else if (frequency === 'Weekly') {
            nextDate.setDate(nextDate.getDate() + 7);
        } else {
            // Monthly
            nextDate.setMonth(nextDate.getMonth() + 1);
            // Adjust day clamping if originally set (e.g. 31st)
            if (dayOfMonth) {
                const targetMonth = nextDate.getMonth();
                const targetYear = nextDate.getFullYear();
                const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
                const targetDay = Math.min(dayOfMonth, daysInTargetMonth);
                nextDate.setDate(targetDay);
            }
        }
        return nextDate;
    };

    const handleGenerateInvoice = async (template: RecurringInvoiceTemplate, isManual: boolean = true) => {
        const { rentalInvoiceSettings } = state;
        const { prefix, nextNumber, padding } = rentalInvoiceSettings;
        
        let maxNum = nextNumber;
        state.invoices.forEach(inv => {
             if (inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix)) {
                 const part = inv.invoiceNumber.substring(prefix.length);
                 if (/^\d+$/.test(part)) {
                     const num = parseInt(part, 10);
                     if (num >= maxNum) {
                         maxNum = num + 1;
                     }
                 }
             }
        });

        const invoiceNumber = `${prefix}${String(maxNum).padStart(padding, '0')}`;
        const issueDate = template.nextDueDate; 
        const dueDateObj = new Date(issueDate);
        dueDateObj.setDate(dueDateObj.getDate() + 7);
        const dueDate = dueDateObj.toISOString();
        
        const issueDateObj = new Date(issueDate);
        const monthYear = issueDateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
        const description = template.descriptionTemplate.replace('{Month}', monthYear);

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');

        const templateInvoiceType = template.invoiceType || InvoiceType.RENTAL;
        const newInvoice: Invoice = {
            id: `inv-rec-${Date.now()}`,
            invoiceNumber,
            contactId: template.contactId,
            invoiceType: templateInvoiceType,
            propertyId: template.propertyId,
            buildingId: template.buildingId,
            amount: template.amount,
            paidAmount: 0,
            status: InvoiceStatus.UNPAID,
            issueDate: issueDate,
            dueDate: dueDate,
            description,
            categoryId: rentalIncomeCategory?.id,
            agreementId: template.agreementId,
            rentalMonth: issueDate.slice(0, 7),
            securityDepositCharge: 0,
        };

        dispatch({ type: 'ADD_INVOICE', payload: newInvoice });
        dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: { ...rentalInvoiceSettings, nextNumber: maxNum + 1 } });

        // Calculate next date based on frequency
        const nextDate = calculateNextDate(new Date(issueDate), template.frequency || 'Monthly', template.dayOfMonth);

        const newGeneratedCount = (template.generatedCount || 0) + 1;
        let isActive = template.active;
        
        // Auto-disable if max reached
        if (template.maxOccurrences && newGeneratedCount >= template.maxOccurrences) {
            isActive = false;
        }

        const updatedTemplate: RecurringInvoiceTemplate = {
            ...template,
            nextDueDate: nextDate.toISOString().split('T')[0],
            lastGeneratedDate: new Date().toISOString(),
            generatedCount: newGeneratedCount,
            active: isActive
        };
        
        dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: updatedTemplate });
        
        if (isManual) {
            showToast(`Invoice #${invoiceNumber} created successfully.`, 'success');
            setIsEditModalOpen(false); // Close modal on success
        }
    };

    const handleDelete = async () => {
        if (!templateToEdit) return;
        const confirmed = await showConfirm('Are you sure you want to stop recurring and delete this template?', { title: 'Remove Template', confirmLabel: 'Delete' });
        if (confirmed) {
            dispatch({ type: 'DELETE_RECURRING_TEMPLATE', payload: templateToEdit.id });
            setIsEditModalOpen(false);
            setTemplateToEdit(null);
            showToast('Template deleted.', 'info');
        }
    };
    
    const openEditModal = (template: RecurringInvoiceTemplate) => {
        setTemplateToEdit(template);
        setEditAmount(String(template.amount));
        setEditDay(String(template.dayOfMonth));
        setEditNextDate(template.nextDueDate);
        setEditDesc(template.descriptionTemplate);
        
        setEditAutoGenerate(template.autoGenerate || false);
        setEditFrequency(template.frequency || 'Monthly');
        setEditTotalTransactions(template.maxOccurrences ? String(template.maxOccurrences) : '');
        setEditGeneratedCount(template.generatedCount || 0);
        setEditInvoiceType(template.invoiceType || InvoiceType.RENTAL);
        
        setIsEditModalOpen(true);
    };
    
    const handleSaveEdit = async () => {
        if (!templateToEdit) return;

        let updated: RecurringInvoiceTemplate = {
            ...templateToEdit,
            amount: parseFloat(editAmount) || 0,
            dayOfMonth: parseInt(editDay) || 1,
            nextDueDate: editNextDate,
            descriptionTemplate: editDesc,
            invoiceType: editInvoiceType,
            autoGenerate: editAutoGenerate,
            frequency: editFrequency,
            maxOccurrences: editTotalTransactions ? parseInt(editTotalTransactions) : undefined
        };

        // --- CATCH-UP LOGIC ---
        // If Auto-Generate is ON and Next Date is in the past/today, create invoices until caught up
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let loopDate = new Date(updated.nextDueDate);
        loopDate.setHours(0, 0, 0, 0);

        let createdCount = 0;
        
        if (updated.autoGenerate && loopDate <= today) {
            const { rentalInvoiceSettings } = state;
            const { prefix, nextNumber, padding } = rentalInvoiceSettings;

            // Determine safe starting invoice number
            let maxNum = nextNumber;
            state.invoices.forEach(inv => {
                 if (inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix)) {
                     const part = inv.invoiceNumber.substring(prefix.length);
                     if (/^\d+$/.test(part)) {
                         const num = parseInt(part, 10);
                         if (num >= maxNum) maxNum = num + 1;
                     }
                 }
            });

            let currentNextNum = maxNum;
            const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
            
            // Limit catch-up to avoid infinite loops (e.g. daily for 10 years)
            const SAFE_LOOP_LIMIT = 60; 

            while (loopDate <= today) {
                // Check Max limit if set
                if (updated.maxOccurrences && (updated.generatedCount || 0) >= updated.maxOccurrences) {
                    updated.active = false;
                    break;
                }
                
                if (createdCount >= SAFE_LOOP_LIMIT) break;

                // Create Invoice
                const invoiceNumber = `${prefix}${String(currentNextNum).padStart(padding, '0')}`;
                const issueDateStr = loopDate.toISOString().split('T')[0];
                
                const dueDateObj = new Date(loopDate);
                dueDateObj.setDate(dueDateObj.getDate() + 7);
                
                const issueDateObjForDesc = new Date(loopDate);
                const monthYear = issueDateObjForDesc.toLocaleString('default', { month: 'long', year: 'numeric' });
                const description = updated.descriptionTemplate.replace('{Month}', monthYear);

                const newInvoice: Invoice = {
                    id: `inv-rec-${Date.now()}-${createdCount}`,
                    invoiceNumber,
                    contactId: updated.contactId,
                    invoiceType: updated.invoiceType || InvoiceType.RENTAL,
                    propertyId: updated.propertyId,
                    buildingId: updated.buildingId,
                    amount: updated.amount,
                    paidAmount: 0,
                    status: InvoiceStatus.UNPAID,
                    issueDate: issueDateStr,
                    dueDate: dueDateObj.toISOString(),
                    description,
                    categoryId: rentalIncomeCategory?.id,
                    agreementId: updated.agreementId,
                    rentalMonth: issueDateStr.slice(0, 7),
                    securityDepositCharge: 0,
                };

                dispatch({ type: 'ADD_INVOICE', payload: newInvoice });
                
                // Advance loop
                createdCount++;
                currentNextNum++;
                updated.generatedCount = (updated.generatedCount || 0) + 1;
                updated.lastGeneratedDate = new Date().toISOString();

                // Calculate next date
                loopDate = calculateNextDate(loopDate, updated.frequency || 'Monthly', updated.dayOfMonth);
                updated.nextDueDate = loopDate.toISOString().split('T')[0];
            }

            // Update settings after loop
            if (createdCount > 0) {
                dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: { ...rentalInvoiceSettings, nextNumber: currentNextNum } });
                showToast(`Auto-generated ${createdCount} past due invoices.`, 'success');
            }
        }
        
        dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: updated });
        setIsEditModalOpen(false);
        setTemplateToEdit(null);
        if (createdCount === 0) {
            showToast('Template updated', 'success');
        }
    };

    const handleManualGenerateFromModal = async () => {
        if (templateToEdit) {
            // Check if we need to save changes first? 
            // For simplicity, we use the current edit state to generate, 
            // effectively saving and generating.
            const tempTemplate: RecurringInvoiceTemplate = {
                 ...templateToEdit,
                 amount: parseFloat(editAmount) || 0,
                 descriptionTemplate: editDesc,
                 invoiceType: editInvoiceType,
                 frequency: editFrequency,
                 nextDueDate: editNextDate
            };
            
            const confirmed = await showConfirm(`Generate invoice for ${CURRENCY} ${tempTemplate.amount.toLocaleString()} due on ${formatDate(tempTemplate.nextDueDate)}?`, { title: 'Generate Invoice', confirmLabel: 'Generate' });
            if (confirmed) {
                await handleGenerateInvoice(tempTemplate, true);
            }
        }
    }

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const filterInputClass = "w-full pl-3 py-2 text-sm border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white";

    return (
        <div className="flex h-full gap-4">
            {/* Left Sidebar */}
            <div 
                className="flex-shrink-0 flex flex-col h-full gap-3"
                style={{ width: sidebarWidth }}
            >
                <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3 flex-shrink-0">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <span className="h-4 w-4">{ICONS.search}</span>
                        </div>
                        <Input 
                            placeholder="Search templates..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className={`${filterInputClass} pl-9`}
                        />
                         {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600">
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    <Select 
                        value={buildingFilter} 
                        onChange={(e) => setBuildingFilter(e.target.value)} 
                        className={filterInputClass}
                        hideIcon={true}
                    >
                        <option value="all">All Buildings</option>
                        {buildings.filter(b => b.id !== 'all').map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </Select>
                </div>

                <div className="flex-grow overflow-hidden">
                     <div className="font-bold text-slate-700 mb-2 px-1 flex justify-between items-center">
                        <span>Buildings & Properties</span>
                        {selectedNode && (
                            <button onClick={() => setSelectedNode(null)} className="text-xs text-accent hover:underline">Clear</button>
                        )}
                    </div>
                    <InvoiceTreeView 
                        treeData={treeData} 
                        selectedNodeId={selectedNode?.id || null} 
                        onNodeSelect={(id, type) => setSelectedNode(selectedNode?.id === id && selectedNode.type === type ? null : { id, type: type as any })} 
                    />
                </div>
            </div>

            {/* Resizer */}
            <div className="hidden md:block h-full">
                <ResizeHandle onMouseDown={startResizing} />
            </div>

            {/* Right Grid */}
            <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="flex-grow overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th onClick={() => handleSort('property')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Property <SortIcon column="property"/></th>
                                <th onClick={() => handleSort('tenant')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Tenant <SortIcon column="tenant"/></th>
                                <th onClick={() => handleSort('amount')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Amount <SortIcon column="amount"/></th>
                                <th onClick={() => handleSort('nextDue')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Next Due <SortIcon column="nextDue"/></th>
                                <th onClick={() => handleSort('frequency')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Freq <SortIcon column="frequency"/></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {filteredTemplates.length > 0 ? filteredTemplates.map(template => {
                                const tenantName = state.contacts.find(c => c.id === template.contactId)?.name || 'Unknown';
                                const propertyName = state.properties.find(p => p.id === template.propertyId)?.name || 'Unknown';
                                
                                return (
                                    <tr key={template.id} onClick={() => openEditModal(template)} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                                        <td className="px-4 py-3 font-medium text-slate-800">{propertyName}</td>
                                        <td className="px-4 py-3 text-slate-600">{tenantName}</td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">{CURRENCY} {template.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-medium border border-slate-200">
                                                {formatDate(template.nextDueDate)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-500">
                                            {template.autoGenerate ? (
                                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Auto {template.frequency || 'Monthly'}</span>
                                            ) : (
                                                <span className="text-xs text-slate-500">Manual</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                                        No recurring templates found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-sm font-medium text-slate-600">
                    <span>Count: {filteredTemplates.length}</span>
                    <span>Total Monthly: {CURRENCY} {filteredTemplates.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}</span>
                </div>
            </div>
            
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Recurring Template">
                <div className="space-y-4">
                    {/* Top Row: Amount, Invoice Type & Mode */}
                    <div className="grid grid-cols-3 gap-4">
                        <Input label="Amount" type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                        <Select
                            label="Invoice Type"
                            value={editInvoiceType}
                            onChange={(e) => setEditInvoiceType(e.target.value as InvoiceType)}
                        >
                            <option value={InvoiceType.RENTAL}>Rental</option>
                            <option value={InvoiceType.SERVICE_CHARGE}>Service Charge</option>
                            <option value={InvoiceType.INSTALLMENT}>Installment</option>
                        </Select>
                        <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
                             <div className="flex gap-2">
                                <button 
                                    type="button"
                                    onClick={() => setEditAutoGenerate(false)} 
                                    className={`flex-1 py-2 text-sm border rounded ${!editAutoGenerate ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300'}`}
                                >
                                    Manual
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setEditAutoGenerate(true)} 
                                    className={`flex-1 py-2 text-sm border rounded ${editAutoGenerate ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'}`}
                                >
                                    Auto
                                </button>
                             </div>
                        </div>
                    </div>
                    
                    {/* Configuration Section */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Schedule Configuration</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <Select 
                                label="How Often" 
                                value={editFrequency} 
                                onChange={(e) => setEditFrequency(e.target.value as any)}
                            >
                                <option value="Monthly">Monthly</option>
                                <option value="Weekly">Weekly</option>
                                <option value="Daily">Daily</option>
                            </Select>
                            
                            <Input label="Next Invoice Date" type="date" value={editNextDate} onChange={e => setEditNextDate(e.target.value)} />
                        </div>

                        {editFrequency === 'Monthly' && (
                             <Input label="Day of Month (Ideal)" type="number" min="1" max="31" value={editDay} onChange={e => setEditDay(e.target.value)} helperText="Preferred day if date shifts (e.g. Feb 28)" />
                        )}

                        {editAutoGenerate && (
                            <div className="pt-2 border-t border-slate-200 mt-2">
                                <div className="grid grid-cols-2 gap-4">
                                     <Input 
                                        label="Total Number of Transactions" 
                                        type="number" 
                                        value={editTotalTransactions} 
                                        onChange={e => setEditTotalTransactions(e.target.value)} 
                                        placeholder="Unlimited" 
                                        helperText={editGeneratedCount > 0 ? `Already generated: ${editGeneratedCount}` : ''}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <Input label="Description Template" value={editDesc} onChange={e => setEditDesc(e.target.value)} helperText="Use {Month} as a placeholder." />
                    
                    <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                        <Button variant="danger" onClick={handleDelete} className="bg-white border border-rose-200 text-rose-600 hover:bg-rose-50">Delete</Button>
                        <div className="flex gap-2">
                            {/* Manual Generate Button */}
                            <Button 
                                type="button" 
                                onClick={handleManualGenerateFromModal} 
                                className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            >
                                Generate Invoice Now
                            </Button>
                            
                            <Button onClick={handleSaveEdit}>Save Changes</Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default RecurringInvoicesList;
