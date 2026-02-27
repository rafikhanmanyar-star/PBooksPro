
import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { RecurringInvoiceTemplate, Invoice, InvoiceType, InvoiceStatus } from '../../types';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';
import Select from '../ui/Select';

type SortKey = 'property' | 'amount' | 'nextDue' | 'status';

const RecurringInvoicesList: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();

    // --- State ---
    const [templateToEdit, setTemplateToEdit] = useState<RecurringInvoiceTemplate | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [buildingFilter, setBuildingFilter] = useState('all');

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'nextDue', direction: 'asc' });

    // Edit form fields
    const [editAmount, setEditAmount] = useState('');
    const [editDay, setEditDay] = useState('');
    const [editNextDate, setEditNextDate] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editInvoiceType, setEditInvoiceType] = useState<InvoiceType>(InvoiceType.RENTAL);
    const [editActive, setEditActive] = useState(true);

    // --- Data --- (exclude soft-deleted templates)
    const templates = useMemo(() => (state.recurringInvoiceTemplates || []).filter(t => !t.deletedAt), [state.recurringInvoiceTemplates]);

    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const todayStr = useMemo(() => today.toISOString().split('T')[0], [today]);

    // --- Filtering & Sorting ---
    const filteredTemplates = useMemo(() => {
        let result = templates;

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

        if (buildingFilter !== 'all') {
            result = result.filter(t => t.buildingId === buildingFilter);
        }

        return result.sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (sortConfig.key) {
                case 'amount': valA = a.amount; valB = b.amount; break;
                case 'nextDue': valA = new Date(a.nextDueDate).getTime(); valB = new Date(b.nextDueDate).getTime(); break;
                case 'status': valA = a.active ? 1 : 0; valB = b.active ? 1 : 0; break;
                case 'property':
                    valA = state.properties.find(p => p.id === a.propertyId)?.name || '';
                    valB = state.properties.find(p => p.id === b.propertyId)?.name || '';
                    break;
            }

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = (valB as string).toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [templates, searchQuery, buildingFilter, sortConfig, state.contacts, state.properties]);

    // Overdue templates: active, nextDueDate <= today
    const overdueTemplates = useMemo(() => {
        return filteredTemplates.filter(t => t.active && t.nextDueDate <= todayStr);
    }, [filteredTemplates, todayStr]);

    const activeCount = useMemo(() => filteredTemplates.filter(t => t.active).length, [filteredTemplates]);

    // --- Helpers ---

    const getDateStatus = (dateStr: string, isActive: boolean): 'upcoming' | 'due' | 'overdue' | 'paused' => {
        if (!isActive) return 'paused';
        const diff = Math.floor((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diff > 0) return 'upcoming';
        if (diff >= -7) return 'due';
        return 'overdue';
    };

    const getDateBadgeClasses = (status: 'upcoming' | 'due' | 'overdue' | 'paused') => {
        switch (status) {
            case 'upcoming': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'due': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'overdue': return 'bg-red-50 text-red-700 border-red-200';
            case 'paused': return 'bg-slate-100 text-slate-400 border-slate-200';
        }
    };

    const getDateLabel = (status: 'upcoming' | 'due' | 'overdue' | 'paused', dateStr: string) => {
        const formatted = formatDate(dateStr);
        switch (status) {
            case 'overdue': return `Overdue - ${formatted}`;
            case 'due': return `Due - ${formatted}`;
            default: return formatted;
        }
    };

    const calculateNextMonthDate = (currentDate: Date, dayOfMonth: number): Date => {
        const nextDate = new Date(currentDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        const targetMonth = nextDate.getMonth();
        const targetYear = nextDate.getFullYear();
        const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const targetDay = Math.min(dayOfMonth, daysInTargetMonth);
        nextDate.setDate(targetDay);
        return nextDate;
    };

    const getNextInvoiceNumber = useCallback(() => {
        const { rentalInvoiceSettings } = state;
        const { prefix, nextNumber, padding } = rentalInvoiceSettings;
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
        return { maxNum, prefix, padding };
    }, [state]);

    // --- Generate a single invoice from a template ---
    const generateSingleInvoice = useCallback((template: RecurringInvoiceTemplate, invoiceNum: number, prefix: string, padding: number): Invoice => {
        const invoiceNumber = `${prefix}${String(invoiceNum).padStart(padding, '0')}`;
        const issueDate = template.nextDueDate;
        const dueDateObj = new Date(issueDate);
        dueDateObj.setDate(dueDateObj.getDate() + 7);

        const issueDateObj = new Date(issueDate);
        const monthYear = issueDateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
        const description = template.descriptionTemplate.replace('{Month}', monthYear);

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');

        return {
            id: `inv-rec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            invoiceNumber,
            contactId: template.contactId,
            invoiceType: template.invoiceType || InvoiceType.RENTAL,
            propertyId: template.propertyId,
            buildingId: template.buildingId,
            amount: template.amount,
            paidAmount: 0,
            status: InvoiceStatus.UNPAID,
            issueDate,
            dueDate: dueDateObj.toISOString(),
            description,
            categoryId: rentalIncomeCategory?.id,
            agreementId: template.agreementId,
            rentalMonth: issueDate.slice(0, 7),
            securityDepositCharge: 0,
        };
    }, [state.categories]);

    // --- Generate all due invoices (bulk) ---
    const handleGenerateAllDue = useCallback(async () => {
        const dueTemplates = templates.filter(t => t.active && !t.deletedAt && t.nextDueDate <= todayStr);
        if (dueTemplates.length === 0) return;

        const confirmed = await showConfirm(
            `This will generate ${dueTemplates.length} invoice${dueTemplates.length > 1 ? 's' : ''} for all due schedules. Continue?`,
            { title: 'Generate Due Invoices', confirmLabel: 'Generate All' }
        );
        if (!confirmed) return;

        setIsGenerating(true);
        let totalCreated = 0;
        let { maxNum, prefix, padding } = getNextInvoiceNumber();

        const rentalAgreements = state.rentalAgreements || [];

        for (const template of dueTemplates) {
            let currentTemplate = { ...template };
            let loopDate = new Date(currentTemplate.nextDueDate);
            loopDate.setHours(0, 0, 0, 0);
            const SAFE_LIMIT = 60;
            let count = 0;

            // Get agreement end date when template is linked to a rental agreement
            const agreement = currentTemplate.agreementId
                ? rentalAgreements.find((ra) => ra.id === currentTemplate.agreementId)
                : undefined;
            const agreementEndDate = agreement?.endDate
                ? (() => {
                    const d = new Date(agreement.endDate);
                    d.setHours(0, 0, 0, 0);
                    return d;
                })()
                : undefined;

            while (loopDate <= today && count < SAFE_LIMIT) {
                if (currentTemplate.maxOccurrences && (currentTemplate.generatedCount || 0) >= currentTemplate.maxOccurrences) {
                    currentTemplate.active = false;
                    break;
                }
                // Do not generate invoices beyond the agreement end date
                if (agreementEndDate && loopDate > agreementEndDate) {
                    currentTemplate.active = false;
                    break;
                }

                const invoice = generateSingleInvoice(currentTemplate, maxNum, prefix, padding);
                dispatch({ type: 'ADD_INVOICE', payload: invoice });

                maxNum++;
                count++;
                totalCreated++;
                currentTemplate.generatedCount = (currentTemplate.generatedCount || 0) + 1;
                currentTemplate.lastGeneratedDate = new Date().toISOString();

                loopDate = calculateNextMonthDate(loopDate, currentTemplate.dayOfMonth);
                currentTemplate.nextDueDate = loopDate.toISOString().split('T')[0];
            }

            dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: currentTemplate });
        }

        if (totalCreated > 0) {
            dispatch({
                type: 'UPDATE_RENTAL_INVOICE_SETTINGS',
                payload: { ...state.rentalInvoiceSettings, nextNumber: maxNum }
            });
            showToast(`Generated ${totalCreated} invoice${totalCreated > 1 ? 's' : ''} successfully.`, 'success');
        }
        setIsGenerating(false);
    }, [templates, todayStr, today, getNextInvoiceNumber, generateSingleInvoice, dispatch, state.rentalInvoiceSettings, state.rentalAgreements, showConfirm, showToast]);

    // --- Generate for a single template (from row or modal) ---
    const handleGenerateSingle = useCallback(async (template: RecurringInvoiceTemplate) => {
        // Do not generate if invoice date would exceed agreement end date
        if (template.agreementId) {
            const agreement = state.rentalAgreements?.find((ra) => ra.id === template.agreementId);
            if (agreement?.endDate) {
                const nextDue = new Date(template.nextDueDate);
                nextDue.setHours(0, 0, 0, 0);
                const endDate = new Date(agreement.endDate);
                endDate.setHours(0, 0, 0, 0);
                if (nextDue > endDate) {
                    showToast(`Cannot generate: invoice date ${formatDate(template.nextDueDate)} is after agreement end date ${formatDate(agreement.endDate)}.`, 'error');
                    return;
                }
            }
        }

        const confirmed = await showConfirm(
            `Generate invoice for ${CURRENCY} ${template.amount.toLocaleString()} due on ${formatDate(template.nextDueDate)}?`,
            { title: 'Generate Invoice', confirmLabel: 'Generate' }
        );
        if (!confirmed) return;

        let { maxNum, prefix, padding } = getNextInvoiceNumber();
        const invoice = generateSingleInvoice(template, maxNum, prefix, padding);
        dispatch({ type: 'ADD_INVOICE', payload: invoice });
        dispatch({
            type: 'UPDATE_RENTAL_INVOICE_SETTINGS',
            payload: { ...state.rentalInvoiceSettings, nextNumber: maxNum + 1 }
        });

        const nextDate = calculateNextMonthDate(new Date(template.nextDueDate), template.dayOfMonth);
        const newCount = (template.generatedCount || 0) + 1;
        let isActive = template.active;
        if (template.maxOccurrences && newCount >= template.maxOccurrences) {
            isActive = false;
        }
        // Deactivate when next date would exceed agreement end
        if (template.agreementId && isActive) {
            const agreement = state.rentalAgreements?.find((ra) => ra.id === template.agreementId);
            if (agreement?.endDate) {
                const endDate = new Date(agreement.endDate);
                endDate.setHours(0, 0, 0, 0);
                if (nextDate > endDate) {
                    isActive = false;
                }
            }
        }

        const updatedTemplate: RecurringInvoiceTemplate = {
            ...template,
            nextDueDate: nextDate.toISOString().split('T')[0],
            lastGeneratedDate: new Date().toISOString(),
            generatedCount: newCount,
            active: isActive,
        };
        dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: updatedTemplate });
        showToast(`Invoice #${invoice.invoiceNumber} created.`, 'success');
        setIsEditModalOpen(false);
    }, [getNextInvoiceNumber, generateSingleInvoice, dispatch, state.rentalInvoiceSettings, state.rentalAgreements, showConfirm, showToast]);

    // --- Toggle active/paused inline ---
    const handleToggleActive = useCallback((template: RecurringInvoiceTemplate, e: React.MouseEvent) => {
        e.stopPropagation();
        dispatch({
            type: 'UPDATE_RECURRING_TEMPLATE',
            payload: { ...template, active: !template.active }
        });
        showToast(template.active ? 'Schedule paused.' : 'Schedule activated.', 'info');
    }, [dispatch, showToast]);

    // --- Sort handler ---
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // --- Edit Modal ---
    const openEditModal = (template: RecurringInvoiceTemplate) => {
        setTemplateToEdit(template);
        setEditAmount(String(template.amount));
        setEditDay(String(template.dayOfMonth || 1));
        setEditNextDate(template.nextDueDate);
        setEditDesc(template.descriptionTemplate);
        setEditInvoiceType(template.invoiceType || InvoiceType.RENTAL);
        setEditActive(template.active);
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!templateToEdit) return;

        const updated: RecurringInvoiceTemplate = {
            ...templateToEdit,
            amount: parseFloat(editAmount) || 0,
            dayOfMonth: Math.max(1, Math.min(28, parseInt(editDay) || 1)),
            nextDueDate: editNextDate,
            descriptionTemplate: editDesc,
            invoiceType: editInvoiceType,
            active: editActive,
            autoGenerate: true,
            frequency: 'Monthly',
        };

        dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: updated });
        setIsEditModalOpen(false);
        setTemplateToEdit(null);
        showToast('Schedule updated.', 'success');
    };

    const handleDelete = async () => {
        if (!templateToEdit) return;
        const confirmed = await showConfirm(
            'This will permanently remove this invoice schedule. Continue?',
            { title: 'Delete Schedule', confirmLabel: 'Delete' }
        );
        if (confirmed) {
            dispatch({ type: 'DELETE_RECURRING_TEMPLATE', payload: templateToEdit.id });
            setIsEditModalOpen(false);
            setTemplateToEdit(null);
            showToast('Schedule deleted.', 'info');
        }
    };

    const handleGenerateFromModal = async () => {
        if (!templateToEdit) return;
        const tempTemplate: RecurringInvoiceTemplate = {
            ...templateToEdit,
            amount: parseFloat(editAmount) || 0,
            descriptionTemplate: editDesc,
            invoiceType: editInvoiceType,
            nextDueDate: editNextDate,
        };
        await handleGenerateSingle(tempTemplate);
    };

    // --- SortIcon ---
    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    // --- Resolve names for edit modal ---
    const editPropertyName = templateToEdit ? (state.properties.find(p => p.id === templateToEdit.propertyId)?.name || 'Unknown') : '';
    const editTenantName = templateToEdit ? (state.contacts.find(c => c.id === templateToEdit.contactId)?.name || 'Unknown') : '';
    const editAgreement = templateToEdit?.agreementId ? state.rentalAgreements.find(a => a.id === templateToEdit.agreementId) : null;

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Overdue Banner */}
            {overdueTemplates.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 text-amber-600">{ICONS.alertTriangle}</div>
                        <span className="text-sm font-medium text-amber-800">
                            {overdueTemplates.length} invoice{overdueTemplates.length > 1 ? 's are' : ' is'} due for generation
                        </span>
                    </div>
                    <Button
                        onClick={handleGenerateAllDue}
                        disabled={isGenerating}
                        className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600 text-sm px-4 py-1.5"
                    >
                        {isGenerating ? 'Generating...' : `Generate All (${overdueTemplates.length})`}
                    </Button>
                </div>
            )}

            {/* Filters Row */}
            <div className="flex items-center gap-3 flex-shrink-0">
                <div className="relative flex-grow max-w-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <span className="h-4 w-4">{ICONS.search}</span>
                    </div>
                    <input
                        type="text"
                        placeholder="Search by property, tenant..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600">
                            <div className="w-4 h-4">{ICONS.x}</div>
                        </button>
                    )}
                </div>
                <select
                    value={buildingFilter}
                    onChange={(e) => setBuildingFilter(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg shadow-sm bg-white focus:ring-2 focus:ring-accent/50 focus:border-accent"
                >
                    <option value="all">All Buildings</option>
                    {state.buildings.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="flex-grow overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th onClick={() => handleSort('property')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">
                                    Property / Tenant <SortIcon column="property" />
                                </th>
                                <th onClick={() => handleSort('amount')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">
                                    Amount <SortIcon column="amount" />
                                </th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600 select-none">
                                    Schedule
                                </th>
                                <th onClick={() => handleSort('nextDue')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">
                                    Next Invoice <SortIcon column="nextDue" />
                                </th>
                                <th onClick={() => handleSort('status')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">
                                    Status <SortIcon column="status" />
                                </th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600 select-none w-24">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {filteredTemplates.length > 0 ? filteredTemplates.map(template => {
                                const tenantName = state.contacts.find(c => c.id === template.contactId)?.name || 'Unknown';
                                const propertyName = state.properties.find(p => p.id === template.propertyId)?.name || 'Unknown';
                                const dateStatus = getDateStatus(template.nextDueDate, template.active);
                                const isOverdue = dateStatus === 'overdue' || dateStatus === 'due';

                                return (
                                    <tr
                                        key={template.id}
                                        onClick={() => openEditModal(template)}
                                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${isOverdue && template.active ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-transparent'}`}
                                    >
                                        {/* Property / Tenant */}
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-800">{propertyName}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{tenantName}</div>
                                        </td>

                                        {/* Amount */}
                                        <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">
                                            {CURRENCY} {template.amount.toLocaleString()}
                                        </td>

                                        {/* Schedule */}
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-xs text-slate-600">
                                                Monthly on {template.dayOfMonth || 1}{getOrdinalSuffix(template.dayOfMonth || 1)}
                                            </span>
                                        </td>

                                        {/* Next Invoice */}
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getDateBadgeClasses(dateStatus)}`}>
                                                {getDateLabel(dateStatus, template.nextDueDate)}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={(e) => handleToggleActive(template, e)}
                                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${template.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                title={template.active ? 'Active - click to pause' : 'Paused - click to activate'}
                                            >
                                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${template.active ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </button>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                {template.active && template.nextDueDate <= todayStr && (
                                                    <button
                                                        onClick={() => handleGenerateSingle(template)}
                                                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                                        title="Generate invoice now"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openEditModal(template)}
                                                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                                                    title="Edit schedule"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={6} className="px-4 py-16 text-center">
                                        <div className="text-slate-400 mb-2">
                                            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <p className="text-sm text-slate-500 font-medium">No invoice schedules found</p>
                                        <p className="text-xs text-slate-400 mt-1">Schedules are created automatically when you create a rental agreement.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-sm font-medium text-slate-600 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <span>{filteredTemplates.length} schedule{filteredTemplates.length !== 1 ? 's' : ''}</span>
                        <span className="text-emerald-600">{activeCount} active</span>
                        {overdueTemplates.length > 0 && (
                            <span className="text-amber-600">{overdueTemplates.length} due</span>
                        )}
                    </div>
                    <span>Monthly Total: {CURRENCY} {filteredTemplates.filter(t => t.active).reduce((sum, t) => sum + t.amount, 0).toLocaleString()}</span>
                </div>
            </div>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Invoice Schedule">
                {templateToEdit && (
                    <div className="space-y-5">
                        {/* Read-only Header */}
                        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                                    <span className="text-xs text-slate-500">Property</span>
                                    <span className="text-sm font-medium text-slate-800">{editPropertyName}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                                    <span className="text-xs text-slate-500">Tenant</span>
                                    <span className="text-sm font-medium text-slate-800">{editTenantName}</span>
                                </div>
                                {editAgreement && (
                                    <div className="flex items-center justify-between py-1.5 col-span-2">
                                        <span className="text-xs text-slate-500">Agreement</span>
                                        <span className="text-sm font-medium text-slate-800">{editAgreement.agreementNumber}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Invoice Settings */}
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Monthly Amount"
                                    type="number"
                                    value={editAmount}
                                    onChange={e => setEditAmount(e.target.value)}
                                />
                                <Select
                                    label="Invoice Type"
                                    value={editInvoiceType}
                                    onChange={(e) => setEditInvoiceType(e.target.value as InvoiceType)}
                                >
                                    <option value={InvoiceType.RENTAL}>Rental</option>
                                    <option value={InvoiceType.SECURITY_DEPOSIT}>Security Deposit</option>
                                    <option value={InvoiceType.SERVICE_CHARGE}>Service Charge</option>
                                    <option value={InvoiceType.INSTALLMENT}>Installment</option>
                                </Select>
                            </div>
                            <Input
                                label="Description Template"
                                value={editDesc}
                                onChange={e => setEditDesc(e.target.value)}
                                helperText="Use {Month} for auto month/year (e.g. 'Rent for {Month}')"
                            />
                        </div>

                        {/* Schedule Settings */}
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-700">Auto-generate invoices</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">Invoices will be created on the scheduled day each month</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEditActive(!editActive)}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${editActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${editActive ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Create on day</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="28"
                                        value={editDay}
                                        onChange={e => setEditDay(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Day of month (1-28)</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Next scheduled date</label>
                                    <input
                                        type="date"
                                        value={editNextDate}
                                        onChange={e => setEditNextDate(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white"
                                    />
                                </div>
                            </div>

                            {(templateToEdit.generatedCount || 0) > 0 && (
                                <div className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                                    {templateToEdit.generatedCount} invoice{(templateToEdit.generatedCount || 0) > 1 ? 's' : ''} generated so far
                                    {templateToEdit.lastGeneratedDate && (
                                        <span> &middot; Last: {formatDate(templateToEdit.lastGeneratedDate)}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                            <Button
                                variant="danger"
                                onClick={handleDelete}
                                className="bg-white border border-rose-200 text-rose-600 hover:bg-rose-50"
                            >
                                Delete
                            </Button>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    onClick={handleGenerateFromModal}
                                    className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                >
                                    Generate Now
                                </Button>
                                <Button onClick={handleSaveEdit}>Save</Button>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

// Helper: ordinal suffix for day number
function getOrdinalSuffix(day: number): string {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

export default RecurringInvoicesList;
