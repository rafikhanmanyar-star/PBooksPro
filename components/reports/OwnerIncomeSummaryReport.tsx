
import React, { useState, useMemo, useEffect } from 'react';
import { useRentalReportAppState } from '../../hooks/useSelectiveState';
import { ContactType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { formatCurrency } from '../../utils/numberUtils';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import {
    computeOwnerIncomeSummaryReport,
    type OwnerSummary,
} from './ownerIncomeSummaryReportEngine';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { fetchOwnerIncomeSummaryReport } from '../../services/api/rentalReportsApi';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

const OwnerIncomeSummaryReport: React.FC = () => {
    const rentalState = useRentalReportAppState();
    const { print: triggerPrint } = usePrintContext();

    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    const [groupBy, setGroupBy] = useState<'' | 'owner'>('');
    const [searchQuery, setSearchQuery] = useState('');

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...rentalState.buildings], [rentalState.buildings]);

    const owners = useMemo(() => {
        const ownerContacts = rentalState.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
        return [{ id: 'all', name: 'All Owners' }, ...ownerContacts];
    }, [rentalState.contacts]);

    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();

        if (option === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (option === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
        } else if (option === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)));
        }
    };

    const handleCustomDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        setDateRange('custom');
    };

    const localOnly = isLocalOnlyMode();
    const [serverSummaries, setServerSummaries] = useState<OwnerSummary[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        if (localOnly) {
            setServerSummaries(null);
            setFetchError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setFetchError(null);
        void fetchOwnerIncomeSummaryReport({
            startDate,
            endDate,
            buildingId: selectedBuildingId,
            ownerId: selectedOwnerId,
            search: searchQuery,
        })
            .then((r) => {
                if (!cancelled) setServerSummaries(r.summaries);
            })
            .catch((e) => {
                if (!cancelled) setFetchError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [localOnly, startDate, endDate, selectedBuildingId, selectedOwnerId, searchQuery]);

    const localReportData = useMemo(
        () =>
            computeOwnerIncomeSummaryReport(rentalState, {
                startDate,
                endDate,
                selectedBuildingId,
                selectedOwnerId,
                searchQuery,
            }),
        [rentalState, startDate, endDate, selectedBuildingId, selectedOwnerId, searchQuery]
    );

    const reportData = localOnly ? localReportData : (serverSummaries ?? localReportData);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            collected: acc.collected + curr.units.reduce((s, u) => s + u.collected, 0),
            expenses: acc.expenses + curr.units.reduce((s, u) => s + u.expenses, 0),
            brokerFees: acc.brokerFees + curr.totalBrokerFee,
            billAmounts: acc.billAmounts + curr.totalBillAmount,
            payouts: acc.payouts + curr.generalPayouts,
            payable: acc.payable + curr.totalPayable
        }), { collected: 0, expenses: 0, brokerFees: 0, billAmounts: 0, payouts: 0, payable: 0 });
    }, [reportData]);

    const handleExport = () => {
        const flatData: any[] = [];
        reportData.forEach(owner => {
            owner.units.forEach(unit => {
                flatData.push({
                    Owner: owner.ownerName,
                    Unit: unit.unitName,
                    Collected: unit.collected,
                    Expenses: unit.expenses,
                    'Broker Fee': unit.brokerFee,
                    Bill: unit.billAmount,
                    'Unit Net': unit.payable,
                    'General Payouts': '',
                    'Total Payable': ''
                });
            });
            if (owner.generalPayouts !== 0) {
                flatData.push({
                    Owner: owner.ownerName,
                    Unit: 'General/Payouts',
                    Collected: 0,
                    Expenses: owner.generalPayouts,
                    'Broker Fee': 0,
                    Bill: 0,
                    'Unit Net': -owner.generalPayouts,
                    'General Payouts': owner.generalPayouts,
                    'Total Payable': ''
                });
            }
            flatData.push({
                Owner: `Total for ${owner.ownerName}`,
                Unit: '',
                Collected: '',
                Expenses: '',
                'Broker Fee': owner.totalBrokerFee || '',
                Bill: owner.totalBillAmount || '',
                'Unit Net': '',
                'General Payouts': '',
                'Total Payable': owner.totalPayable
            });
        });

        exportJsonToExcel(flatData, 'owner-rental-income-summary.xlsx', 'Owner Rental Income Summary');
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>

            <div className="bg-app-card p-3 rounded-lg border border-app-border shadow-ds-card no-print">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Date Range Pills */}
                    <div className="flex bg-app-toolbar p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                        {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${dateRange === opt
                                    ? 'bg-primary text-ds-on-primary shadow-sm font-bold'
                                    : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                    }`}
                            >
                                {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Pickers */}
                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(toLocalDateString(d), endDate)} />
                            <span className="text-app-muted">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, toLocalDateString(d))} />
                        </div>
                    )}

                    {/* Building Filter */}
                    <div className="w-48 flex-shrink-0">
                        <ComboBox
                            items={buildings}
                            selectedId={selectedBuildingId}
                            onSelect={(item) => setSelectedBuildingId(item?.id || 'all')}
                            allowAddNew={false}
                            placeholder="Filter Building"
                        />
                    </div>

                    {/* Owner Filter */}
                    <div className="w-48 flex-shrink-0">
                        <ComboBox
                            items={owners}
                            selectedId={selectedOwnerId}
                            onSelect={(item) => setSelectedOwnerId(item?.id || 'all')}
                            allowAddNew={false}
                            placeholder="Filter Owner"
                        />
                    </div>

                    {/* Group By Filter */}
                    <div className="w-48 flex-shrink-0">
                        <Select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value as any)}
                            className="ds-input-field text-sm py-1.5"
                        >
                            <option value="">No Grouping</option>
                            <option value="owner">Group by Owner</option>
                        </Select>
                    </div>

                    {/* Search Input */}
                    <div className="relative flex-grow min-w-[180px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                            <span className="h-4 w-4">{ICONS.search}</span>
                        </div>
                        <Input
                            placeholder="Search report..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 py-1.5 text-sm"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    {/* Actions Group */}
                    <div className="flex items-center gap-2 ml-auto">
                        <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border">
                            <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                        </Button>
                        <PrintButton
                            variant="secondary"
                            size="sm"
                            onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                            className="whitespace-nowrap"
                        />
                    </div>
                </div>
                {!localOnly && loading && (
                    <p className="text-sm text-app-muted mt-2 px-1">Loading summary from server…</p>
                )}
                {!localOnly && fetchError && (
                    <p className="text-sm text-danger mt-2 px-1">Failed to load report: {fetchError}</p>
                )}
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-app-text">Owner Rental Income Summary</h3>
                        <p className="text-sm text-app-muted mt-1">
                            {dateRange === 'all' ? 'All Time' : `${formatDate(startDate)} - ${formatDate(endDate)}`}
                        </p>
                        {(selectedBuildingId !== 'all' || selectedOwnerId !== 'all' || groupBy) && (
                            <p className="text-xs text-app-muted mt-1">
                                Filters:
                                {selectedBuildingId !== 'all' && ` Building: ${rentalState.buildings.find(b => b.id === selectedBuildingId)?.name} `}
                                {selectedOwnerId !== 'all' && ` Owner: ${rentalState.contacts.find(c => c.id === selectedOwnerId)?.name}`}
                                {groupBy && ` | Grouped by: ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`}
                            </p>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-app-border text-sm">
                            <thead className="bg-app-toolbar/40 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold text-app-text">Owner / Unit</th>
                                    <th className="px-4 py-3 text-right font-bold text-app-text">Collected</th>
                                    <th className="px-4 py-3 text-right font-bold text-app-text">Expenses</th>
                                    <th className="px-4 py-3 text-right font-bold text-app-text">Broker Fee</th>
                                    <th className="px-4 py-3 text-right font-bold text-app-text">Bill</th>
                                    <th className="px-4 py-3 text-right font-bold text-app-text">Net Payable</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border bg-app-card">
                                {reportData.map(owner => (
                                    <React.Fragment key={owner.ownerId}>
                                        {/* Owner Header Row */}
                                        <tr className="bg-primary/10">
                                            <td className="px-4 py-3 font-bold text-primary" colSpan={6}>
                                                {owner.ownerName}
                                            </td>
                                        </tr>

                                        {/* Unit Rows */}
                                        {owner.units.map(unit => (
                                            <tr key={unit.unitId} className="hover:bg-app-toolbar/30 transition-colors">
                                                <td className="px-8 py-2 text-app-muted italic">
                                                    {unit.unitName}
                                                </td>
                                                <td className="px-4 py-2 text-right text-success">
                                                    {unit.collected > 0 ? `${CURRENCY} ${formatCurrency(unit.collected)}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-danger">
                                                    {unit.expenses > 0 ? `${CURRENCY} ${formatCurrency(unit.expenses)}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-ds-warning">
                                                    {unit.brokerFee > 0 ? `${CURRENCY} ${formatCurrency(unit.brokerFee)}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-ds-warning">
                                                    {unit.billAmount > 0 ? `${CURRENCY} ${formatCurrency(unit.billAmount)}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right font-medium text-app-text">
                                                    {CURRENCY} {formatCurrency(unit.payable)}
                                                </td>
                                            </tr>
                                        ))}

                                        {/* General Payouts Row (if any) */}
                                        {owner.generalPayouts !== 0 && (
                                            <tr className="bg-ds-danger/10">
                                                <td className="px-8 py-2 text-app-muted italic">
                                                    General Payouts / Adjustments
                                                </td>
                                                <td className="px-4 py-2 text-right">-</td>
                                                <td className="px-4 py-2 text-right text-danger">
                                                    {CURRENCY} {formatCurrency(owner.generalPayouts)}
                                                </td>
                                                <td className="px-4 py-2 text-right">-</td>
                                                <td className="px-4 py-2 text-right">-</td>
                                                <td className="px-4 py-2 text-right font-medium text-danger">
                                                    -{CURRENCY} {formatCurrency(owner.generalPayouts)}
                                                </td>
                                            </tr>
                                        )}

                                        {/* Owner Subtotal Row */}
                                        <tr className="bg-app-toolbar/50 font-bold">
                                            <td className="px-4 py-2 text-right text-app-text">
                                                Total for {owner.ownerName}
                                            </td>
                                            <td className="px-4 py-2 text-right text-success">
                                                {CURRENCY} {formatCurrency(owner.units.reduce((s, u) => s + u.collected, 0))}
                                            </td>
                                            <td className="px-4 py-2 text-right text-danger">
                                                {CURRENCY} {formatCurrency(owner.units.reduce((s, u) => s + u.expenses, 0) + owner.generalPayouts)}
                                            </td>
                                            <td className="px-4 py-2 text-right text-ds-warning">
                                                {owner.totalBrokerFee > 0 ? `${CURRENCY} ${formatCurrency(owner.totalBrokerFee)}` : '-'}
                                            </td>
                                            <td className="px-4 py-2 text-right text-ds-warning">
                                                {owner.totalBillAmount > 0 ? `${CURRENCY} ${formatCurrency(owner.totalBillAmount)}` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-primary text-base">
                                                {CURRENCY} {formatCurrency(owner.totalPayable)}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                ))}

                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-app-muted">
                                            No summary data found for the selected owner and period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {reportData.length > 0 && (
                                <tfoot className="bg-app-toolbar/60 font-bold border-t-2 border-app-border">
                                    <tr>
                                        <td className="px-4 py-4 text-right text-lg text-app-text">GRAND TOTAL</td>
                                        <td className="px-4 py-4 text-right text-success text-lg">
                                            {CURRENCY} {formatCurrency(totals.collected)}
                                        </td>
                                        <td className="px-4 py-4 text-right text-danger text-lg">
                                            {CURRENCY} {formatCurrency(totals.expenses + totals.payouts)}
                                        </td>
                                        <td className="px-4 py-4 text-right text-ds-warning text-lg">
                                            {totals.brokerFees > 0 ? `${CURRENCY} ${formatCurrency(totals.brokerFees)}` : '-'}
                                        </td>
                                        <td className="px-4 py-4 text-right text-ds-warning text-lg">
                                            {totals.billAmounts > 0 ? `${CURRENCY} ${formatCurrency(totals.billAmounts)}` : '-'}
                                        </td>
                                        <td className="px-4 py-4 text-right text-primary text-xl">
                                            {CURRENCY} {formatCurrency(totals.payable)}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    <ReportFooter />
                </Card>
            </div>
        </div>
    );
};

export default OwnerIncomeSummaryReport;
