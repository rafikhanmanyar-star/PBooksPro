
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { useNotification } from '../../context/NotificationContext';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { usePrintContext } from '../../context/PrintContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import TreeView from '../ui/TreeView';
import BrokerPayoutModal from '../payouts/BrokerPayoutModal';
import {
    BROKER_TREE_SELECT_AUTO,
    buildBrokerFeeTreeData,
    findFirstBrokerTreeId,
    resolveBrokerTreeSelection,
    getBrokerPropertyBalanceRows,
} from './brokerFeePropertyBalances';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

type SortKey = 'propertyName' | 'buildingName' | 'agreements' | 'totalFee' | 'paid' | 'amountDue';

interface PropertyReportRow {
    id: string;
    propertyName: string;
    buildingName: string;
    agreements: string;
    totalFee: number;
    paid: number;
    amountDue: number;
}

const BrokerFeeReport: React.FC = () => {
    const { state } = useAppContext();
    const { showAlert } = useNotification();
    const { print: triggerPrint } = usePrintContext();
    const { openChat } = useWhatsApp();

    const [dateRangeType, setDateRangeType] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()));

    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'propertyName',
        direction: 'asc',
    });

    const [selectedTreeId, setSelectedTreeId] = useState<string>(BROKER_TREE_SELECT_AUTO);
    const [treeSearchQuery, setTreeSearchQuery] = useState('');
    const [brokerPayModalOpen, setBrokerPayModalOpen] = useState(false);

    const { treeData, collectTreeNodeIds: treeVisibleIds } = useMemo(
        () => buildBrokerFeeTreeData(state, treeSearchQuery),
        [state, treeSearchQuery]
    );

    const firstBrokerIdInTree = useMemo(() => findFirstBrokerTreeId(treeData), [treeData]);

    const resolvedTreeIdForFilters = useMemo(() => {
        let id =
            selectedTreeId === BROKER_TREE_SELECT_AUTO ? (firstBrokerIdInTree ?? 'all') : selectedTreeId;
        if (id !== 'all' && !treeVisibleIds.has(id)) {
            id = firstBrokerIdInTree ?? 'all';
        }
        return id;
    }, [selectedTreeId, firstBrokerIdInTree, treeVisibleIds]);

    useEffect(() => {
        if (selectedTreeId === BROKER_TREE_SELECT_AUTO) return;
        if (selectedTreeId !== 'all' && !treeVisibleIds.has(selectedTreeId)) {
            setSelectedTreeId(firstBrokerIdInTree ?? 'all');
        }
    }, [selectedTreeId, treeVisibleIds, firstBrokerIdInTree]);

    const { brokerId: selectedBrokerId, propertyId: selectedPropertyId } = useMemo(
        () => resolveBrokerTreeSelection(resolvedTreeIdForFilters),
        [resolvedTreeIdForFilters]
    );

    const handleTreeSelect = useCallback((id: string) => {
        if (id === 'all' || id.startsWith('broker:')) {
            setSelectedTreeId(id);
        } else if (id.startsWith('brokerprop:')) {
            setSelectedTreeId(id);
        }
    }, []);

    const propertyRowsRaw = useMemo(() => {
        if (selectedBrokerId === 'all') return [];
        return getBrokerPropertyBalanceRows(state, selectedBrokerId);
    }, [state, selectedBrokerId]);

    const reportData = useMemo((): PropertyReportRow[] => {
        let rows = propertyRowsRaw.map((r) => ({
            id: r.propertyId,
            propertyName: r.propertyName,
            buildingName: r.buildingName,
            agreements: r.agreementSummary,
            totalFee: r.totalFee,
            paid: r.paid,
            amountDue: r.amountDue,
        }));

        if (selectedPropertyId !== 'all') {
            rows = rows.filter((r) => String(r.id) === String(selectedPropertyId));
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(
                (r) =>
                    r.propertyName.toLowerCase().includes(q) ||
                    r.buildingName.toLowerCase().includes(q) ||
                    r.agreements.toLowerCase().includes(q)
            );
        }

        const sk = sortConfig.key;
        const dir = sortConfig.direction === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
            let av: string | number = a[sk];
            let bv: string | number = b[sk];
            if (typeof av === 'string') {
                av = av.toLowerCase();
                bv = (bv as string).toLowerCase();
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });

        return rows;
    }, [propertyRowsRaw, selectedPropertyId, searchQuery, sortConfig]);

    const brokerPayableBalance = useMemo(() => {
        if (selectedBrokerId === 'all') return 0;
        const basis = selectedPropertyId !== 'all' ? reportData : propertyRowsRaw;
        return basis.reduce((s, r) => s + r.amountDue, 0);
    }, [selectedBrokerId, selectedPropertyId, reportData, propertyRowsRaw]);

    const payFromReportEligible = useMemo(() => {
        if (resolvedTreeIdForFilters === 'all') return false;
        if (!resolvedTreeIdForFilters.startsWith('broker:') && !resolvedTreeIdForFilters.startsWith('brokerprop:'))
            return false;
        return brokerPayableBalance > 0.01;
    }, [resolvedTreeIdForFilters, brokerPayableBalance]);

    useEffect(() => {
        if (!payFromReportEligible && brokerPayModalOpen) setBrokerPayModalOpen(false);
    }, [payFromReportEligible, brokerPayModalOpen]);

    const selectedBrokerContact = useMemo(
        () =>
            selectedBrokerId !== 'all' ? state.contacts.find((c) => c.id === selectedBrokerId) ?? null : null,
        [selectedBrokerId, state.contacts]
    );

    const brokerScopePropertyIds = useMemo((): Set<string> | undefined => {
        if (selectedPropertyId !== 'all') return new Set([String(selectedPropertyId)]);
        return undefined;
    }, [selectedPropertyId]);

    const brokers = useMemo(
        () => state.contacts.filter((c) => c.type === ContactType.BROKER || c.type === ContactType.DEALER),
        [state.contacts]
    );

    const handleRangeChange = (type: DateRangeOption) => {
        setDateRangeType(type);
        const now = new Date();
        if (type === 'all') {
            setStartDate('2000-01-01');
            setEndDate(toLocalDateString(new Date()));
        } else if (type === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
        } else if (type === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)));
        }
    };

    const handleDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        if (dateRangeType !== 'custom') setDateRangeType('custom');
    };

    const handleSort = (key: SortKey) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const totals = useMemo(() => {
        return reportData.reduce(
            (acc, r) => {
                acc.totalFee += r.totalFee;
                acc.paid += r.paid;
                acc.due += r.amountDue;
                return acc;
            },
            { totalFee: 0, paid: 0, due: 0 }
        );
    }, [reportData]);

    const handleExport = () => {
        const brokerName =
            selectedBrokerId === 'all'
                ? 'All'
                : state.contacts.find((c) => c.id === selectedBrokerId)?.name || '';
        const data = reportData.map((r) => ({
            Property: r.propertyName,
            Building: r.buildingName,
            Agreements: r.agreements,
            'Total commission': r.totalFee,
            Paid: r.paid,
            'Amount due': r.amountDue,
        }));
        exportJsonToExcel(data, `broker-fee-report-${brokerName || 'export'}.xlsx`, 'Broker Fees');
    };

    const handleWhatsApp = async () => {
        const selectedBroker = brokers.find((c) => c.id === selectedBrokerId);
        if (selectedBrokerId === 'all' || !selectedBroker?.contactNo) {
            await showAlert('Please select a broker in the tree with a contact number to send a summary.');
            return;
        }

        try {
            let message = `*Broker commission — ${selectedBroker.name}*\n`;
            message += `Statement window: ${formatDate(startDate)} to ${formatDate(endDate)}\n`;
            message += `(Balances are contract-to-date per property.)\n\n`;
            reportData.forEach((r) => {
                message += `• ${r.propertyName}: due ${CURRENCY} ${r.amountDue.toLocaleString()}\n`;
            });
            message += `\n*Total due: ${CURRENCY} ${brokerPayableBalance.toLocaleString()}*\n`;
            message += `\nPBooksPro — Broker Fee Report`;

            sendOrOpenWhatsApp(
                { contact: selectedBroker, message, phoneNumber: selectedBroker.contactNo },
                () => state.whatsAppMode,
                openChat
            );
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-app-muted">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const brokerDisplayName =
        selectedBrokerId === 'all'
            ? 'All Brokers'
            : state.contacts.find((c) => c.id === selectedBrokerId)?.name || 'Unknown';

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full">
                <div className="flex flex-1 min-h-0 gap-0">
                    <div className="flex flex-col w-64 flex-shrink-0 bg-app-card border-r border-app-border overflow-hidden no-print">
                        <div className="px-3 py-3 border-b border-app-border">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-8 h-8 rounded-lg bg-app-toolbar flex items-center justify-center text-app-muted">
                                    <div className="w-4 h-4">{ICONS.users}</div>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-app-text leading-tight">Brokers</h3>
                                    <p className="text-[10px] text-app-muted leading-tight">By property</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-1.5 border-b border-app-border min-w-0">
                            <div className="relative w-full min-w-0">
                                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-app-muted z-10">
                                    <span className="h-3.5 w-3.5 shrink-0">{ICONS.search}</span>
                                </div>
                                <Input
                                    placeholder="Search..."
                                    value={treeSearchQuery}
                                    onChange={(e) => setTreeSearchQuery(e.target.value)}
                                    className="ds-input-field pl-7 py-1 text-xs w-full min-w-0 max-w-full"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-1.5">
                            <TreeView
                                treeData={treeData}
                                selectedId={resolvedTreeIdForFilters}
                                onSelect={(id) => handleTreeSelect(id)}
                                showLines={true}
                                defaultExpanded={true}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col flex-1 min-w-0 min-h-0">
                        <div className="flex-shrink-0 no-print border-b border-app-border bg-app-card px-3 py-2">
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex bg-app-toolbar p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                                    {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map((opt) => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => handleRangeChange(opt)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                                dateRangeType === opt
                                                    ? 'bg-primary text-ds-on-primary shadow-sm font-bold'
                                                    : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                            }`}
                                        >
                                            {opt === 'all'
                                                ? 'Total'
                                                : opt === 'thisMonth'
                                                  ? 'This Month'
                                                  : opt === 'lastMonth'
                                                    ? 'Last Month'
                                                    : 'Custom'}
                                        </button>
                                    ))}
                                </div>

                                {dateRangeType === 'custom' && (
                                    <div className="flex items-center gap-2 animate-fade-in">
                                        <DatePicker
                                            value={startDate}
                                            onChange={(d) => handleDateChange(toLocalDateString(d), endDate)}
                                        />
                                        <span className="text-app-muted">-</span>
                                        <DatePicker
                                            value={endDate}
                                            onChange={(d) => handleDateChange(startDate, toLocalDateString(d))}
                                        />
                                    </div>
                                )}

                                <div className="relative flex-grow min-w-[180px] max-w-md">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                                        <span className="h-4 w-4">{ICONS.search}</span>
                                    </div>
                                    <Input
                                        placeholder="Search properties..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 py-1.5 text-sm"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                                        >
                                            <div className="w-4 h-4">{ICONS.x}</div>
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => setBrokerPayModalOpen(true)}
                                        disabled={!payFromReportEligible}
                                        className="whitespace-nowrap h-8 min-w-[100px] px-6 bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={
                                            payFromReportEligible
                                                ? 'Pay broker commission by property'
                                                : 'Select a broker (and optionally a property) with an amount due'
                                        }
                                    >
                                        Pay
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleWhatsApp}
                                        disabled={selectedBrokerId === 'all' || !selectedBrokerContact?.contactNo}
                                        className="text-ds-success bg-ds-success/10 hover:bg-ds-success/20 border-ds-success/30 whitespace-nowrap h-8"
                                    >
                                        <div className="w-4 h-4 mr-1">{ICONS.whatsapp}</div> Share
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleExport}
                                        className="whitespace-nowrap bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border h-8"
                                    >
                                        <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                                    </Button>
                                    <PrintButton
                                        variant="secondary"
                                        size="sm"
                                        onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                                        className="whitespace-nowrap h-8"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                            <Card className="min-h-full border-0 rounded-none shadow-none">
                                <ReportHeader />
                                <div className="text-center mb-4 px-6">
                                    <h3 className="text-2xl font-bold text-app-text">Broker Fee Report</h3>
                                    <p className="text-sm text-app-muted">
                                        Broker: <span className="font-semibold text-app-text">{brokerDisplayName}</span>
                                        {selectedPropertyId !== 'all' && (
                                            <>
                                                {' '}
                                                · Property:{' '}
                                                <span className="font-semibold text-app-text">
                                                    {state.properties.find((p) => p.id === selectedPropertyId)?.name}
                                                </span>
                                            </>
                                        )}
                                    </p>
                                    <p className="text-xs text-app-muted mt-1 max-w-xl mx-auto">
                                        Amounts due are <strong>contract-to-date</strong> per property (agreement fees
                                        minus broker-fee payments on that unit). The date range above applies to
                                        statements and export notes only.
                                    </p>
                                    <p className="text-xs text-app-muted">
                                        Period: {formatDate(startDate)} — {formatDate(endDate)}
                                    </p>
                                </div>

                                {selectedBrokerId === 'all' ? (
                                    <div className="text-center py-16 px-6">
                                        <p className="text-app-muted">
                                            Select a broker in the tree to see commission by property.
                                        </p>
                                    </div>
                                ) : reportData.length > 0 ? (
                                    <div className="overflow-x-auto px-6 pb-4">
                                        <table className="min-w-full divide-y divide-app-border text-sm">
                                            <thead className="bg-app-toolbar/40">
                                                <tr>
                                                    <th
                                                        onClick={() => handleSort('propertyName')}
                                                        className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer select-none"
                                                    >
                                                        Property <SortIcon column="propertyName" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort('buildingName')}
                                                        className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer select-none"
                                                    >
                                                        Building <SortIcon column="buildingName" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort('agreements')}
                                                        className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer select-none"
                                                    >
                                                        Agreement(s) <SortIcon column="agreements" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort('totalFee')}
                                                        className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer select-none whitespace-nowrap"
                                                    >
                                                        Total fee <SortIcon column="totalFee" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort('paid')}
                                                        className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer select-none whitespace-nowrap"
                                                    >
                                                        Paid <SortIcon column="paid" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort('amountDue')}
                                                        className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer select-none whitespace-nowrap"
                                                    >
                                                        Amount due <SortIcon column="amountDue" />
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-app-card divide-y divide-app-border">
                                                {reportData.map((r) => (
                                                    <tr key={r.id}>
                                                        <td className="px-3 py-2 text-app-text font-medium">{r.propertyName}</td>
                                                        <td className="px-3 py-2 text-app-muted">{r.buildingName}</td>
                                                        <td className="px-3 py-2 text-app-muted max-w-xs break-words">
                                                            {r.agreements}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-success whitespace-nowrap">
                                                            {CURRENCY} {r.totalFee.toLocaleString()}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-danger whitespace-nowrap">
                                                            {CURRENCY} {r.paid.toLocaleString()}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-bold text-app-text whitespace-nowrap">
                                                            {CURRENCY} {r.amountDue.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-app-toolbar/40 font-bold border-t border-app-border">
                                                <tr>
                                                    <td colSpan={3} className="px-3 py-2 text-right text-app-text">
                                                        Totals
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">
                                                        {CURRENCY} {totals.totalFee.toLocaleString()}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-danger whitespace-nowrap">
                                                        {CURRENCY} {totals.paid.toLocaleString()}
                                                    </td>
                                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                                        {CURRENCY} {totals.due.toLocaleString()}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-16 px-6">
                                        <p className="text-app-muted">
                                            No rental commission rows for this broker (or filter has no matches).
                                        </p>
                                    </div>
                                )}
                                <ReportFooter />
                            </Card>
                        </div>
                    </div>
                </div>
            </div>

            {selectedBrokerContact && (
                <BrokerPayoutModal
                    isOpen={brokerPayModalOpen}
                    onClose={() => setBrokerPayModalOpen(false)}
                    broker={selectedBrokerContact}
                    balanceDue={brokerPayableBalance}
                    context="Rental"
                    scopePropertyIds={brokerScopePropertyIds}
                    aggregateRentalByProperty
                />
            )}
        </>
    );
};

export default BrokerFeeReport;
