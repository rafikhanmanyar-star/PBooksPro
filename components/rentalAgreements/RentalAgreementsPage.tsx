
import React, { useState, useMemo, useEffect, useCallback, type SetStateAction } from 'react';
import { useStateSelector, useDispatchOnly } from '../../hooks/useSelectiveState';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import { RentalAgreement, RentalAgreementStatus } from '../../types';
import RentalAgreementForm from './RentalAgreementForm';
import RentalAgreementTerminationModal from './RentalAgreementTerminationModal';
import RentalAgreementRenewalModal from './RentalAgreementRenewalModal';
import RentalAgreementDetailPanel from './RentalAgreementDetailPanel';
import RentalAgreementsDashboard from './RentalAgreementsDashboard';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import useLocalStorage from '../../hooks/useLocalStorage';
import { usePairColumnResize } from '../../hooks/usePairColumnResize';
import { ImportType } from '../../services/importService';

type ViewMode = 'summary' | 'list';
type StatusFilter = 'all' | 'active' | 'expiring' | 'renewed' | 'terminated';
type SortKey = 'agreementNumber' | 'tenant' | 'owner' | 'property' | 'rent' | 'security' | 'startDate' | 'endDate' | 'status';
type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

const AGREEMENT_COL_ORDER = [
    'agreementNumber', 'tenant', 'property', 'owner', 'rent', 'security', 'startDate', 'endDate', 'status',
] as const;
type AgreementColKey = (typeof AGREEMENT_COL_ORDER)[number];

const AGREEMENT_COL_MIN: Record<AgreementColKey, number> = {
    agreementNumber: 72,
    tenant: 72,
    property: 80,
    owner: 64,
    rent: 72,
    security: 72,
    startDate: 80,
    endDate: 80,
    status: 88,
};

const DEFAULT_AGREEMENT_COL_WIDTHS: Record<AgreementColKey, number> = {
    agreementNumber: 100,
    tenant: 140,
    property: 160,
    owner: 120,
    rent: 96,
    security: 100,
    startDate: 96,
    endDate: 96,
    status: 112,
};

const RentalAgreementsPage: React.FC = () => {
    const dispatch = useDispatchOnly();
    const rentalAgreements = useStateSelector(s => s.rentalAgreements);
    const properties = useStateSelector(s => s.properties);
    const contacts = useStateSelector(s => s.contacts);
    const buildings = useStateSelector(s => s.buildings);
    const [viewMode, setViewMode] = useLocalStorage<ViewMode>('agreements_view_mode', 'summary');

    // --- Modals / Panels ---
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingAgreement, setEditingAgreement] = useState<RentalAgreement | null>(null);
    const [selectedAgreement, setSelectedAgreement] = useState<RentalAgreement | null>(null);
    const [terminationAgreement, setTerminationAgreement] = useState<RentalAgreement | null>(null);
    const [renewalAgreement, setRenewalAgreement] = useState<RentalAgreement | null>(null);

    // --- Filters ---
    const [statusFilter, setStatusFilter] = useLocalStorage<StatusFilter>('rentalAgreements_statusFilter', 'all');
    const [searchQuery, setSearchQuery] = useState('');
    const [buildingFilter, setBuildingFilter] = useLocalStorage<string>('rentalAgreements_buildingFilter', '');
    const [dateRange, setDateRange] = useLocalStorage<DateRangeOption>('rentalAgreements_dateRange', 'all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [sortConfig, setSortConfig] = useLocalStorage<{ key: SortKey; direction: 'asc' | 'desc' }>('rentalAgreements_sort', { key: 'startDate', direction: 'desc' });
    const [colWidthsStored, setColWidths] = useLocalStorage<Record<AgreementColKey, number>>(
        'rentalAgreements_tableColWidths',
        DEFAULT_AGREEMENT_COL_WIDTHS
    );
    const colWidths = useMemo(
        () => ({ ...DEFAULT_AGREEMENT_COL_WIDTHS, ...colWidthsStored }),
        [colWidthsStored]
    );

    const setColWidthsMerged = useCallback(
        (action: SetStateAction<Record<AgreementColKey, number>>) => {
            setColWidths(prevRaw => {
                const prev = { ...DEFAULT_AGREEMENT_COL_WIDTHS, ...prevRaw };
                return typeof action === 'function' ? action(prev) : action;
            });
        },
        [setColWidths]
    );

    const { startResize } = usePairColumnResize<AgreementColKey>(
        setColWidthsMerged,
        AGREEMENT_COL_MIN,
        AGREEMENT_COL_ORDER
    );

    const canPairResize = useCallback(
        (k: AgreementColKey) => AGREEMENT_COL_ORDER.indexOf(k) < AGREEMENT_COL_ORDER.length - 1,
        []
    );

    const headerResizer = useCallback(
        (column: AgreementColKey) =>
            canPairResize(column) ? (
                <div
                    className="absolute right-0 top-0 bottom-0 w-3 flex justify-end pr-0 cursor-col-resize z-20 select-none group"
                    onMouseDown={startResize(column)}
                    onClick={e => e.stopPropagation()}
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize column"
                >
                    <div className="w-px h-full bg-transparent group-hover:bg-primary/70" />
                </div>
            ) : null,
        [canPairResize, startResize]
    );

    const thBase = 'px-3 py-1.5 text-[10px] font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap uppercase tracking-wider relative';

    // --- Helpers ---
    const today = useMemo(() => new Date(), []);
    const thirtyDaysLater = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; }, []);

    // Build O(1) lookup maps to avoid repeated .find() calls
    const propertyMap = useMemo(() => new Map(properties.map(p => [p.id, p])), [properties]);
    const contactMap = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
    const buildingMap = useMemo(() => new Map(buildings.map(b => [b.id, b])), [buildings]);

    const getAgreementDetails = (ra: RentalAgreement) => {
        const property = propertyMap.get(ra.propertyId);
        const tenant = contactMap.get(ra.contactId);
        const ownerId = ra.ownerId || property?.ownerId;
        const owner = ownerId ? contactMap.get(ownerId) : null;
        const building = property ? buildingMap.get(property.buildingId || '') : null;
        return {
            ...ra,
            propertyName: property?.name || 'Unknown',
            tenantName: tenant?.name || 'Unknown',
            ownerName: owner?.name || 'Unknown',
            buildingId: property?.buildingId || '',
            buildingName: building?.name || 'Unassigned',
            ownerId: ownerId || '',
        };
    };

    const isExpiringSoon = (ra: RentalAgreement) =>
        ra.status === RentalAgreementStatus.ACTIVE &&
        new Date(ra.endDate) <= thirtyDaysLater &&
        new Date(ra.endDate) >= today;

    // --- KPI Calculations ---
    const kpiData = useMemo(() => {
        const active = rentalAgreements.filter(a => a.status === RentalAgreementStatus.ACTIVE);
        const expiring = rentalAgreements.filter(isExpiringSoon);
        const totalRent = active.reduce((sum, a) => sum + (parseFloat(String(a.monthlyRent)) || 0), 0);
        const totalSecurity = active.reduce((sum, a) => sum + (parseFloat(String(a.securityDeposit)) || 0), 0);
        return {
            activeCount: active.length,
            totalRent,
            expiringCount: expiring.length,
            totalSecurity,
        };
    }, [rentalAgreements, today, thirtyDaysLater]);

    // --- Date Handling ---
    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();
        if (option === 'all') { setStartDate(''); setEndDate(''); }
        else if (option === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
        } else if (option === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)));
        }
    };

    useEffect(() => {
        if (dateRange !== 'custom' && dateRange !== 'all') handleRangeChange(dateRange);
    }, []);

    // Check if we need to open an agreement from search
    useEffect(() => {
        const agreementId = sessionStorage.getItem('openRentalAgreementId');
        if (agreementId) {
            sessionStorage.removeItem('openRentalAgreementId');
            const agreement = rentalAgreements.find(a => a.id === agreementId);
            if (agreement) setSelectedAgreement(agreement);
        }
    }, [rentalAgreements]);

    // --- Filtered & Sorted Data ---
    const filteredAgreements = useMemo(() => {
        let agreements = rentalAgreements.map(getAgreementDetails);

        // Date range
        if (startDate && endDate) {
            const s = new Date(startDate); s.setHours(0, 0, 0, 0);
            const e = new Date(endDate); e.setHours(23, 59, 59, 999);
            agreements = agreements.filter(a => { const d = new Date(a.startDate); return d >= s && d <= e; });
        }

        // Status filter
        if (statusFilter === 'active') agreements = agreements.filter(a => a.status === RentalAgreementStatus.ACTIVE);
        else if (statusFilter === 'expiring') agreements = agreements.filter(a => isExpiringSoon(a));
        else if (statusFilter === 'renewed') agreements = agreements.filter(a => a.status === RentalAgreementStatus.RENEWED);
        else if (statusFilter === 'terminated') agreements = agreements.filter(a => a.status === RentalAgreementStatus.TERMINATED || a.status === RentalAgreementStatus.EXPIRED);

        // Building filter
        if (buildingFilter) agreements = agreements.filter(a => a.buildingId === buildingFilter);

        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            agreements = agreements.filter(a =>
                a.agreementNumber.toLowerCase().includes(q) ||
                a.tenantName.toLowerCase().includes(q) ||
                a.propertyName.toLowerCase().includes(q) ||
                a.ownerName.toLowerCase().includes(q) ||
                a.buildingName.toLowerCase().includes(q)
            );
        }

        // Sort
        return agreements.sort((a, b) => {
            let valA: any = '', valB: any = '';
            switch (sortConfig.key) {
                case 'agreementNumber': valA = a.agreementNumber; valB = b.agreementNumber; break;
                case 'tenant': valA = a.tenantName; valB = b.tenantName; break;
                case 'owner': valA = a.ownerName; valB = b.ownerName; break;
                case 'property': valA = a.propertyName; valB = b.propertyName; break;
                case 'rent': valA = parseFloat(String(a.monthlyRent)) || 0; valB = parseFloat(String(b.monthlyRent)) || 0; break;
                case 'security': valA = parseFloat(String(a.securityDeposit)) || 0; valB = parseFloat(String(b.securityDeposit)) || 0; break;
                case 'startDate': valA = new Date(a.startDate).getTime(); valB = new Date(b.startDate).getTime(); break;
                case 'endDate': valA = new Date(a.endDate).getTime(); valB = new Date(b.endDate).getTime(); break;
                case 'status': valA = a.status; valB = b.status; break;
            }
            if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rentalAgreements, properties, contacts, buildings, searchQuery, statusFilter, buildingFilter, startDate, endDate, sortConfig, today, thirtyDaysLater]);

    const handleSort = (key: SortKey) => {
        setSortConfig(c => ({ key, direction: c.key === key && c.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-app-muted">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const getStatusBadge = (ra: RentalAgreement) => {
        const expiring = isExpiringSoon(ra);
        const pill = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border';
        if (expiring) return <span className={`${pill} border-ds-warning/35 bg-app-toolbar text-ds-warning`}>Expiring</span>;
        if (ra.status === RentalAgreementStatus.ACTIVE) return <span className={`${pill} border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success`}>Active</span>;
        if (ra.status === RentalAgreementStatus.RENEWED) return <span className={`${pill} border-primary/25 bg-app-toolbar text-primary`}>Renewed</span>;
        if (ra.status === RentalAgreementStatus.TERMINATED) return <span className={`${pill} border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] text-ds-danger`}>Terminated</span>;
        if (ra.status === RentalAgreementStatus.EXPIRED) return <span className={`${pill} border-app-border bg-app-toolbar text-app-muted`}>Expired</span>;
        return <span className={`${pill} border-app-border bg-app-toolbar text-app-muted`}>{ra.status}</span>;
    };

    // --- Status tab counts ---
    const statusCounts = useMemo(() => {
        let active = 0, expiring = 0, renewed = 0, terminated = 0;
        rentalAgreements.forEach(a => {
            if (a.status === RentalAgreementStatus.ACTIVE) {
                active++;
                if (isExpiringSoon(a)) expiring++;
            } else if (a.status === RentalAgreementStatus.RENEWED) {
                renewed++;
            } else if (a.status === RentalAgreementStatus.TERMINATED || a.status === RentalAgreementStatus.EXPIRED) {
                terminated++;
            }
        });
        return { all: rentalAgreements.length, active, expiring, renewed, terminated };
    }, [rentalAgreements, today, thirtyDaysLater]);

    // Keep selected agreement in sync with state
    useEffect(() => {
        if (selectedAgreement) {
            const updated = rentalAgreements.find(a => a.id === selectedAgreement.id);
            if (updated) setSelectedAgreement(updated);
            else setSelectedAgreement(null);
        }
    }, [rentalAgreements]);

    if (viewMode === 'summary') {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-end px-3 py-1.5 bg-app-card border-b border-app-border flex-shrink-0">
                    <div className="flex items-center bg-app-toolbar rounded-md p-0.5 border border-app-border">
                        <button type="button" onClick={() => setViewMode('summary')} className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${viewMode === 'summary' ? 'bg-app-card text-primary shadow-sm border border-primary/25' : 'text-app-muted hover:text-app-text'}`}>Summary</button>
                        <button type="button" onClick={() => setViewMode('list')} className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${viewMode === 'list' ? 'bg-app-card text-primary shadow-sm border border-primary/25' : 'text-app-muted hover:text-app-text'}`}>List</button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                    <RentalAgreementsDashboard />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0 pt-2 px-3 sm:pt-3 sm:px-4 pb-1 gap-2">
            {/* View mode toggle */}
            <div className="flex justify-end flex-shrink-0">
                <div className="flex items-center bg-app-toolbar rounded-md p-0.5 border border-app-border">
                    <button type="button" onClick={() => setViewMode('summary')} className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${viewMode === 'summary' ? 'bg-app-card text-primary shadow-sm border border-primary/25' : 'text-app-muted hover:text-app-text'}`}>Summary</button>
                    <button type="button" onClick={() => setViewMode('list')} className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${viewMode === 'list' ? 'bg-app-card text-primary shadow-sm border border-primary/25' : 'text-app-muted hover:text-app-text'}`}>List</button>
                </div>
            </div>
            {/* === KPI Summary Cards - compact (match invoices/bills) === */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 flex-shrink-0">
                {/* Active Agreements */}
                <div className="bg-white rounded-lg border border-emerald-200 shadow-sm px-2.5 py-1.5 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-emerald-600">
                        <div className="w-4 h-4">{ICONS.checkCircle}</div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Active</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800 leading-tight">{kpiData.activeCount}</span>
                    <span className="text-xs text-slate-500 truncate">Rent, {CURRENCY} {kpiData.totalRent.toLocaleString()}</span>
                </div>
                {/* Expiring Soon */}
                <div className={`bg-white rounded-lg border shadow-sm px-2.5 py-1.5 flex flex-col gap-0.5 ${kpiData.expiringCount > 0 ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-1.5 text-amber-600">
                        <div className="w-4 h-4">{ICONS.clock}</div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Expiring Soon</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800 leading-tight">{kpiData.expiringCount}</span>
                    <span className="text-xs text-slate-500">Within 30 days</span>
                </div>
                {/* Security Deposits */}
                <div className="bg-white rounded-lg border border-blue-200 shadow-sm px-2.5 py-1.5 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-blue-600">
                        <div className="w-4 h-4">{ICONS.shield}</div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Security Held</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800 leading-tight truncate">{CURRENCY} {kpiData.totalSecurity.toLocaleString()}</span>
                    <span className="text-xs text-slate-500">Active agreements</span>
                </div>
                {/* New Agreement Action */}
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-lg shadow-sm px-2.5 py-1.5 flex flex-col items-center justify-center gap-1 text-white transition-all hover:shadow-md cursor-pointer"
                >
                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                        <div className="w-4 h-4">{ICONS.plus}</div>
                    </div>
                    <span className="text-xs font-semibold">New Agreement</span>
                </button>
            </div>

            {/* === Filter Toolbar - compact (match invoices/bills) === */}
            <div className="bg-app-card p-2 rounded-lg border border-app-border shadow-ds-card flex-shrink-0 space-y-1.5">
                {/* Row 1: Status Tabs */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <div className="flex bg-app-toolbar p-0.5 rounded-md flex-shrink-0 overflow-x-auto border border-app-border">
                        {([
                            { key: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
                            { key: 'active' as StatusFilter, label: 'Active', count: statusCounts.active },
                            { key: 'expiring' as StatusFilter, label: 'Expiring', count: statusCounts.expiring },
                            { key: 'renewed' as StatusFilter, label: 'Renewed', count: statusCounts.renewed },
                            { key: 'terminated' as StatusFilter, label: 'Ended', count: statusCounts.terminated },
                        ]).map(tab => (
                            <button
                                type="button"
                                key={tab.key}
                                onClick={() => setStatusFilter(tab.key)}
                                className={`px-2.5 py-1 text-xs font-medium rounded transition-all whitespace-nowrap flex items-center gap-1 ${
                                    statusFilter === tab.key
                                        ? 'bg-app-card text-primary shadow-sm font-bold border border-primary/25'
                                        : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                }`}
                            >
                                {tab.label}
                                <span className={`text-[10px] tabular-nums px-1 py-0.5 rounded-full ${
                                    statusFilter === tab.key ? 'bg-primary/15 text-primary' : 'bg-app-toolbar text-app-muted'
                                }`}>{tab.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Date range filter */}
                    <div className="flex bg-app-toolbar p-0.5 rounded-md flex-shrink-0 ml-auto border border-app-border">
                        {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                type="button"
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-2 py-1 text-[10px] font-medium rounded transition-all whitespace-nowrap capitalize ${
                                    dateRange === opt ? 'bg-app-card text-primary shadow-sm font-bold border border-primary/25' : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                }`}
                            >
                                {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                            </button>
                        ))}
                    </div>
                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-1.5 animate-fade-in flex-shrink-0">
                            <DatePicker value={startDate} onChange={(d) => { setStartDate(toLocalDateString(d)); setDateRange('custom'); }} />
                            <span className="text-app-muted text-xs">-</span>
                            <DatePicker value={endDate} onChange={(d) => { setEndDate(toLocalDateString(d)); setDateRange('custom'); }} />
                        </div>
                    )}
                </div>

                {/* Row 2: Search + Building Filter + Actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <div className="relative flex-grow min-w-[180px] max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-app-muted">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <Input
                            placeholder="Search by tenant, owner, property, building..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="ds-input-field pl-9 py-1.5 text-sm rounded-md placeholder:text-app-muted"
                        />
                        {searchQuery && (
                            <button type="button" onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text">
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    {/* Building Filter */}
                    <select
                        value={buildingFilter}
                        onChange={e => setBuildingFilter(e.target.value)}
                        className="ds-input-field px-2.5 py-1.5 text-xs min-w-[130px]"
                        aria-label="Filter by building"
                    >
                        <option value="">All Buildings</option>
                        {buildings.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>

                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.RENTAL_AGREEMENTS });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                            className="justify-center whitespace-nowrap !py-1 !px-2.5 !text-xs"
                        >
                            <div className="w-3.5 h-3.5 mr-1">{ICONS.download}</div>
                            <span>Import</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* === Main Content: Table + Detail Panel === */}
            <div className="flex-1 min-h-0 flex overflow-hidden gap-0">
                {/* Data Grid */}
                <div className={`flex-1 min-w-0 overflow-hidden flex flex-col bg-app-card rounded-lg border border-app-border shadow-ds-card transition-all ${selectedAgreement ? 'mr-0 rounded-r-none border-r-0' : ''}`}>
                    <div className="flex-grow overflow-auto min-h-0">
                        <table className="min-w-full table-fixed divide-y divide-app-border text-sm">
                            <colgroup>
                                {AGREEMENT_COL_ORDER.map(k => (
                                    <col key={k} style={{ width: colWidths[k], minWidth: AGREEMENT_COL_MIN[k] }} />
                                ))}
                            </colgroup>
                            <thead className="bg-app-table-header sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th
                                        style={{ width: colWidths.agreementNumber, minWidth: AGREEMENT_COL_MIN.agreementNumber }}
                                        onClick={() => handleSort('agreementNumber')}
                                        className={`${thBase} text-left`}
                                    >
                                        ID <SortIcon column="agreementNumber" />
                                        {headerResizer('agreementNumber')}
                                    </th>
                                    <th
                                        style={{ width: colWidths.tenant, minWidth: AGREEMENT_COL_MIN.tenant }}
                                        onClick={() => handleSort('tenant')}
                                        className={`${thBase} text-left`}
                                    >
                                        Tenant <SortIcon column="tenant" />
                                        {headerResizer('tenant')}
                                    </th>
                                    <th
                                        style={{ width: colWidths.property, minWidth: AGREEMENT_COL_MIN.property }}
                                        onClick={() => handleSort('property')}
                                        className={`${thBase} text-left`}
                                    >
                                        Property <SortIcon column="property" />
                                        {headerResizer('property')}
                                    </th>
                                    <th
                                        style={{ width: colWidths.owner, minWidth: AGREEMENT_COL_MIN.owner }}
                                        onClick={() => handleSort('owner')}
                                        className={`${thBase} text-left`}
                                    >
                                        Owner <SortIcon column="owner" />
                                        {headerResizer('owner')}
                                    </th>
                                    <th
                                        style={{ width: colWidths.rent, minWidth: AGREEMENT_COL_MIN.rent }}
                                        onClick={() => handleSort('rent')}
                                        className={`${thBase} text-right`}
                                    >
                                        Rent <SortIcon column="rent" />
                                        {headerResizer('rent')}
                                    </th>
                                    <th
                                        style={{ width: colWidths.security, minWidth: AGREEMENT_COL_MIN.security }}
                                        onClick={() => handleSort('security')}
                                        className={`${thBase} text-right`}
                                    >
                                        Security <SortIcon column="security" />
                                        {headerResizer('security')}
                                    </th>
                                    <th
                                        style={{ width: colWidths.startDate, minWidth: AGREEMENT_COL_MIN.startDate }}
                                        onClick={() => handleSort('startDate')}
                                        className={`${thBase} text-left`}
                                    >
                                        Start <SortIcon column="startDate" />
                                        {headerResizer('startDate')}
                                    </th>
                                    <th
                                        style={{ width: colWidths.endDate, minWidth: AGREEMENT_COL_MIN.endDate }}
                                        onClick={() => handleSort('endDate')}
                                        className={`${thBase} text-left`}
                                    >
                                        End <SortIcon column="endDate" />
                                        {headerResizer('endDate')}
                                    </th>
                                    <th
                                        style={{ width: colWidths.status, minWidth: AGREEMENT_COL_MIN.status }}
                                        onClick={() => handleSort('status')}
                                        className="px-3 py-1.5 text-center text-[10px] font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap uppercase tracking-wider relative"
                                    >
                                        Status <SortIcon column="status" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border">
                                {filteredAgreements.length > 0 ? filteredAgreements.map((agreement, index) => (
                                    <tr
                                        key={agreement.id}
                                        onClick={() => setSelectedAgreement(agreement)}
                                        className={`cursor-pointer transition-colors group ${
                                            selectedAgreement?.id === agreement.id ? 'bg-primary/10 border-l-2 border-l-primary' :
                                            index % 2 === 0 ? 'bg-app-card hover:bg-app-toolbar/60' : 'bg-app-toolbar/30 hover:bg-app-toolbar/60'
                                        }`}
                                    >
                                        <td style={{ width: colWidths.agreementNumber, minWidth: AGREEMENT_COL_MIN.agreementNumber }} className="px-3 py-1.5 font-mono text-xs font-medium text-app-muted truncate" title={agreement.agreementNumber}>{agreement.agreementNumber}</td>
                                        <td style={{ width: colWidths.tenant, minWidth: AGREEMENT_COL_MIN.tenant }} className="px-3 py-1.5 font-medium text-app-text truncate" title={agreement.tenantName}>{agreement.tenantName}</td>
                                        <td style={{ width: colWidths.property, minWidth: AGREEMENT_COL_MIN.property }} className="px-3 py-1.5 text-app-text truncate" title={`${agreement.propertyName} (${agreement.buildingName})`}>
                                            <span>{agreement.propertyName}</span>
                                            <span className="text-app-muted text-[10px] ml-1">({agreement.buildingName})</span>
                                        </td>
                                        <td style={{ width: colWidths.owner, minWidth: AGREEMENT_COL_MIN.owner }} className="px-3 py-1.5 text-app-muted truncate" title={agreement.ownerName}>{agreement.ownerName}</td>
                                        <td style={{ width: colWidths.rent, minWidth: AGREEMENT_COL_MIN.rent }} className="px-3 py-1.5 text-right font-medium text-app-text tabular-nums whitespace-nowrap">{CURRENCY} {(parseFloat(String(agreement.monthlyRent)) || 0).toLocaleString()}</td>
                                        <td style={{ width: colWidths.security, minWidth: AGREEMENT_COL_MIN.security }} className="px-3 py-1.5 text-right text-app-muted tabular-nums whitespace-nowrap">{agreement.securityDeposit ? `${CURRENCY} ${(parseFloat(String(agreement.securityDeposit)) || 0).toLocaleString()}` : '-'}</td>
                                        <td style={{ width: colWidths.startDate, minWidth: AGREEMENT_COL_MIN.startDate }} className="px-3 py-1.5 text-app-text whitespace-nowrap text-xs">{formatDate(agreement.startDate)}</td>
                                        <td style={{ width: colWidths.endDate, minWidth: AGREEMENT_COL_MIN.endDate }} className="px-3 py-1.5 text-app-text whitespace-nowrap text-xs">{formatDate(agreement.endDate)}</td>
                                        <td style={{ width: colWidths.status, minWidth: AGREEMENT_COL_MIN.status }} className="px-3 py-1.5 text-center">{getStatusBadge(agreement)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-8 text-center text-app-muted">
                                            <div className="flex flex-col items-center gap-1.5">
                                                <div className="w-9 h-9 text-app-border">{ICONS.fileText}</div>
                                                <span className="text-sm">No agreements found matching your criteria.</span>
                                                <Button onClick={() => setIsCreateModalOpen(true)} size="sm" className="mt-1 !text-xs">
                                                    <div className="w-3.5 h-3.5 mr-1">{ICONS.plus}</div> Create New Agreement
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex-shrink-0 px-3 py-1.5 border-t border-app-border bg-app-toolbar/40 text-xs font-medium text-app-muted flex items-center justify-between">
                        <span>Showing {filteredAgreements.length} of {rentalAgreements.length} agreements</span>
                        <span className="tabular-nums">Total Rent: {CURRENCY} {filteredAgreements.reduce((s, a) => s + (parseFloat(String(a.monthlyRent)) || 0), 0).toLocaleString()}</span>
                    </div>
                </div>

                {/* Detail Panel (Slide-Over) */}
                {selectedAgreement && (
                    <RentalAgreementDetailPanel
                        agreement={selectedAgreement}
                        onClose={() => setSelectedAgreement(null)}
                        onEdit={(a) => { setEditingAgreement(a); setSelectedAgreement(null); }}
                        onRenew={(a) => { setRenewalAgreement(a); }}
                        onTerminate={(a) => { setTerminationAgreement(a); }}
                    />
                )}
            </div>

            {/* === Create Agreement Modal (Wizard) === */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Create New Rental Agreement"
                size="xl"
                disableScroll
            >
                <div className="h-full min-h-0 flex flex-col p-4">
                    <RentalAgreementForm
                        key="new"
                        onClose={() => setIsCreateModalOpen(false)}
                        agreementToEdit={null}
                    />
                </div>
            </Modal>

            {/* === Edit Agreement Modal === */}
            <Modal
                isOpen={!!editingAgreement}
                onClose={() => setEditingAgreement(null)}
                title={editingAgreement ? `Edit Agreement ${editingAgreement.agreementNumber}` : ''}
                size="xl"
                disableScroll
            >
                <div className="h-full min-h-0 flex flex-col p-4">
                    <RentalAgreementForm
                        key={editingAgreement?.id || 'edit'}
                        onClose={() => setEditingAgreement(null)}
                        agreementToEdit={editingAgreement}
                    />
                </div>
            </Modal>

            {/* === Renewal Modal === */}
            <RentalAgreementRenewalModal
                isOpen={!!renewalAgreement}
                onClose={() => setRenewalAgreement(null)}
                agreement={renewalAgreement}
            />

            {/* === Termination Modal === */}
            <RentalAgreementTerminationModal
                isOpen={!!terminationAgreement}
                onClose={() => setTerminationAgreement(null)}
                agreement={terminationAgreement}
            />
        </div>
    );
};

export default RentalAgreementsPage;
