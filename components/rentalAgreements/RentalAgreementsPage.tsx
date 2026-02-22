
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import { RentalAgreement, RentalAgreementStatus } from '../../types';
import RentalAgreementForm from './RentalAgreementForm';
import RentalAgreementTerminationModal from './RentalAgreementTerminationModal';
import RentalAgreementRenewalModal from './RentalAgreementRenewalModal';
import RentalAgreementDetailPanel from './RentalAgreementDetailPanel';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { formatDate } from '../../utils/dateUtils';
import useLocalStorage from '../../hooks/useLocalStorage';
import { ImportType } from '../../services/importService';

type StatusFilter = 'all' | 'active' | 'expiring' | 'renewed' | 'terminated';
type SortKey = 'agreementNumber' | 'tenant' | 'owner' | 'property' | 'rent' | 'security' | 'startDate' | 'endDate' | 'status';
type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

const RentalAgreementsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();

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

    // --- Helpers ---
    const today = useMemo(() => new Date(), []);
    const thirtyDaysLater = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; }, []);

    const getAgreementDetails = (ra: RentalAgreement) => {
        const property = state.properties.find(p => p.id === ra.propertyId);
        const tenant = state.contacts.find(c => c.id === ra.contactId);
        const ownerId = ra.ownerId || property?.ownerId;
        const owner = ownerId ? state.contacts.find(c => c.id === ownerId) : null;
        const building = property ? state.buildings.find(b => b.id === property.buildingId) : null;
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
        const active = state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.ACTIVE);
        const expiring = state.rentalAgreements.filter(isExpiringSoon);
        const totalRent = active.reduce((sum, a) => sum + (parseFloat(String(a.monthlyRent)) || 0), 0);
        const totalSecurity = active.reduce((sum, a) => sum + (parseFloat(String(a.securityDeposit)) || 0), 0);
        return {
            activeCount: active.length,
            totalRent,
            expiringCount: expiring.length,
            totalSecurity,
        };
    }, [state.rentalAgreements, today, thirtyDaysLater]);

    // --- Date Handling ---
    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();
        if (option === 'all') { setStartDate(''); setEndDate(''); }
        else if (option === 'thisMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (option === 'lastMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
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
            const agreement = state.rentalAgreements.find(a => a.id === agreementId);
            if (agreement) setSelectedAgreement(agreement);
        }
    }, [state.rentalAgreements]);

    // --- Filtered & Sorted Data ---
    const filteredAgreements = useMemo(() => {
        let agreements = state.rentalAgreements.map(getAgreementDetails);

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
    }, [state.rentalAgreements, state.properties, state.contacts, state.buildings, searchQuery, statusFilter, buildingFilter, startDate, endDate, sortConfig, today, thirtyDaysLater]);

    const handleSort = (key: SortKey) => {
        setSortConfig(c => ({ key, direction: c.key === key && c.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const getStatusBadge = (ra: RentalAgreement) => {
        const expiring = isExpiringSoon(ra);
        if (expiring) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800">Expiring</span>;
        if (ra.status === RentalAgreementStatus.ACTIVE) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">Active</span>;
        if (ra.status === RentalAgreementStatus.RENEWED) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800">Renewed</span>;
        if (ra.status === RentalAgreementStatus.TERMINATED) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800">Terminated</span>;
        if (ra.status === RentalAgreementStatus.EXPIRED) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-200 text-slate-700">Expired</span>;
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{ra.status}</span>;
    };

    // --- Status tab counts ---
    const statusCounts = useMemo(() => {
        const all = state.rentalAgreements.length;
        const active = state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.ACTIVE).length;
        const expiring = state.rentalAgreements.filter(isExpiringSoon).length;
        const renewed = state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.RENEWED).length;
        const terminated = state.rentalAgreements.filter(a => a.status === RentalAgreementStatus.TERMINATED || a.status === RentalAgreementStatus.EXPIRED).length;
        return { all, active, expiring, renewed, terminated };
    }, [state.rentalAgreements, today, thirtyDaysLater]);

    // Keep selected agreement in sync with state
    useEffect(() => {
        if (selectedAgreement) {
            const updated = state.rentalAgreements.find(a => a.id === selectedAgreement.id);
            if (updated) setSelectedAgreement(updated);
            else setSelectedAgreement(null);
        }
    }, [state.rentalAgreements]);

    return (
        <div className="flex flex-col h-full min-h-0 pt-2 px-3 sm:pt-3 sm:px-4 pb-1 gap-2">
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
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex-shrink-0 space-y-1.5">
                {/* Row 1: Status Tabs */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <div className="flex bg-slate-100 p-0.5 rounded-md flex-shrink-0 overflow-x-auto">
                        {([
                            { key: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
                            { key: 'active' as StatusFilter, label: 'Active', count: statusCounts.active },
                            { key: 'expiring' as StatusFilter, label: 'Expiring', count: statusCounts.expiring },
                            { key: 'renewed' as StatusFilter, label: 'Renewed', count: statusCounts.renewed },
                            { key: 'terminated' as StatusFilter, label: 'Ended', count: statusCounts.terminated },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setStatusFilter(tab.key)}
                                className={`px-2.5 py-1 text-xs font-medium rounded transition-all whitespace-nowrap flex items-center gap-1 ${
                                    statusFilter === tab.key
                                        ? 'bg-white text-accent shadow-sm font-bold'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                }`}
                            >
                                {tab.label}
                                <span className={`text-[10px] tabular-nums px-1 py-0.5 rounded-full ${
                                    statusFilter === tab.key ? 'bg-accent/10 text-accent' : 'bg-slate-200 text-slate-500'
                                }`}>{tab.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Date range filter */}
                    <div className="flex bg-slate-100 p-0.5 rounded-md flex-shrink-0 ml-auto">
                        {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-2 py-1 text-[10px] font-medium rounded transition-all whitespace-nowrap capitalize ${
                                    dateRange === opt ? 'bg-white text-accent shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                }`}
                            >
                                {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                            </button>
                        ))}
                    </div>
                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-1.5 animate-fade-in flex-shrink-0">
                            <DatePicker value={startDate} onChange={(d) => { setStartDate(d.toISOString().split('T')[0]); setDateRange('custom'); }} />
                            <span className="text-slate-400 text-xs">-</span>
                            <DatePicker value={endDate} onChange={(d) => { setEndDate(d.toISOString().split('T')[0]); setDateRange('custom'); }} />
                        </div>
                    )}
                </div>

                {/* Row 2: Search + Building Filter + Actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <div className="relative flex-grow min-w-[180px] max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                            <div className="w-4 h-4">{ICONS.search}</div>
                        </div>
                        <Input
                            placeholder="Search by tenant, owner, property, building..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-9 py-1.5 text-sm border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                        />
                        {searchQuery && (
                            <button type="button" onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600">
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    {/* Building Filter */}
                    <select
                        value={buildingFilter}
                        onChange={e => setBuildingFilter(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 min-w-[130px]"
                    >
                        <option value="">All Buildings</option>
                        {state.buildings.map(b => (
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
                <div className={`flex-1 min-w-0 overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm transition-all ${selectedAgreement ? 'mr-0 rounded-r-none border-r-0' : ''}`}>
                    <div className="flex-grow overflow-auto min-h-0">
                        <table className="min-w-full divide-y divide-slate-100 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th onClick={() => handleSort('agreementNumber')} className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">ID <SortIcon column="agreementNumber" /></th>
                                    <th onClick={() => handleSort('tenant')} className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">Tenant <SortIcon column="tenant" /></th>
                                    <th onClick={() => handleSort('property')} className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">Property <SortIcon column="property" /></th>
                                    <th onClick={() => handleSort('owner')} className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">Owner <SortIcon column="owner" /></th>
                                    <th onClick={() => handleSort('rent')} className="px-3 py-1.5 text-right text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">Rent <SortIcon column="rent" /></th>
                                    <th onClick={() => handleSort('security')} className="px-3 py-1.5 text-right text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">Security <SortIcon column="security" /></th>
                                    <th onClick={() => handleSort('startDate')} className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">Start <SortIcon column="startDate" /></th>
                                    <th onClick={() => handleSort('endDate')} className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">End <SortIcon column="endDate" /></th>
                                    <th onClick={() => handleSort('status')} className="px-3 py-1.5 text-center text-[10px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap uppercase tracking-wider">Status <SortIcon column="status" /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredAgreements.length > 0 ? filteredAgreements.map((agreement, index) => (
                                    <tr
                                        key={agreement.id}
                                        onClick={() => setSelectedAgreement(agreement)}
                                        className={`cursor-pointer transition-colors group ${
                                            selectedAgreement?.id === agreement.id ? 'bg-orange-50 border-l-2 border-l-orange-400' :
                                            index % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100'
                                        }`}
                                    >
                                        <td className="px-3 py-1.5 font-mono text-xs font-medium text-slate-600">{agreement.agreementNumber}</td>
                                        <td className="px-3 py-1.5 font-medium text-slate-800 truncate max-w-[140px]" title={agreement.tenantName}>{agreement.tenantName}</td>
                                        <td className="px-3 py-1.5 text-slate-600 truncate max-w-[140px]" title={`${agreement.propertyName} (${agreement.buildingName})`}>
                                            <span>{agreement.propertyName}</span>
                                            <span className="text-slate-400 text-[10px] ml-1">({agreement.buildingName})</span>
                                        </td>
                                        <td className="px-3 py-1.5 text-slate-500 truncate max-w-[120px]">{agreement.ownerName}</td>
                                        <td className="px-3 py-1.5 text-right font-medium text-slate-700 tabular-nums">{CURRENCY} {(parseFloat(String(agreement.monthlyRent)) || 0).toLocaleString()}</td>
                                        <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{agreement.securityDeposit ? `${CURRENCY} ${(parseFloat(String(agreement.securityDeposit)) || 0).toLocaleString()}` : '-'}</td>
                                        <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap text-xs">{formatDate(agreement.startDate)}</td>
                                        <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap text-xs">{formatDate(agreement.endDate)}</td>
                                        <td className="px-3 py-1.5 text-center">{getStatusBadge(agreement)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                                            <div className="flex flex-col items-center gap-1.5">
                                                <div className="w-9 h-9 text-slate-300">{ICONS.fileText}</div>
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
                    <div className="flex-shrink-0 px-3 py-1.5 border-t border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-600 flex items-center justify-between">
                        <span>Showing {filteredAgreements.length} of {state.rentalAgreements.length} agreements</span>
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
