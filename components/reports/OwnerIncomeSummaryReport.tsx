
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType, Transaction } from '../../types';
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
import { getPropertyIdsForOwner, hasMultipleOwnersOnDate, getOwnerSharePercentageOnDate } from '../../services/propertyOwnershipService';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface UnitSummary {
    unitId: string;
    unitName: string;
    collected: number;
    expenses: number;
    brokerFee: number;
    billAmount: number;
    payable: number;
}

interface OwnerSummary {
    ownerId: string;
    ownerName: string;
    units: UnitSummary[];
    generalPayouts: number; // Payouts not linked to a specific unit
    totalBrokerFee: number; // Total broker fees across all units
    totalBillAmount: number; // Total bill amounts (cost center = owner) across all units
    totalPayable: number;
}

const OwnerIncomeSummaryReport: React.FC = () => {
    const { state } = useAppContext();
    const { print: triggerPrint } = usePrintContext();

    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    const [groupBy, setGroupBy] = useState<'' | 'owner'>('');
    const [searchQuery, setSearchQuery] = useState('');

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

    const owners = useMemo(() => {
        const ownerContacts = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
        return [{ id: 'all', name: 'All Owners' }, ...ownerContacts];
    }, [state.contacts]);

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

    const reportData = useMemo<OwnerSummary[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const ownerShareCat = state.categories.find(c => c.name === 'Owner Rental Income Share');
        const clearingRentCat = state.categories.find(c => c.name === 'Owner Rental Allocation (Clearing)');

        if (!rentalIncomeCategory) return [];

        // Build a set of broker fee transaction IDs for quick lookup (to exclude from expenses)
        const brokerFeeTxIds = new Set<string>();
        if (brokerFeeCategory) {
            state.transactions.forEach(tx => {
                if (tx.type === TransactionType.EXPENSE && tx.categoryId === brokerFeeCategory.id) {
                    brokerFeeTxIds.add(tx.id);
                }
            });
        }

        // 1. Filter owners
        const filteredOwners = state.contacts.filter(c =>
            (c.type === ContactType.OWNER || c.type === ContactType.CLIENT) &&
            (selectedOwnerId === 'all' || c.id === selectedOwnerId)
        );

        const summaries: OwnerSummary[] = filteredOwners.map(owner => {
            const b = selectedBuildingId === 'all' ? undefined : selectedBuildingId;
            const stakeIds = getPropertyIdsForOwner(state, owner.id, b);
            const ownerProperties = state.properties.filter((p) => stakeIds.has(String(p.id)));
            const unitData: { [unitId: string]: UnitSummary } = {};

            ownerProperties.forEach(p => {
                unitData[p.id] = {
                    unitId: p.id,
                    unitName: p.name,
                    collected: 0,
                    expenses: 0,
                    brokerFee: 0,
                    billAmount: 0,
                    payable: 0
                };
            });

            // Include properties that have transactions with tx.ownerId === owner (historical ownership)
            state.transactions.forEach(tx => {
                if (tx.ownerId === owner.id && tx.propertyId && !unitData[tx.propertyId]) {
                    const prop = state.properties.find(p => p.id === tx.propertyId);
                    if (prop && (selectedBuildingId === 'all' || prop.buildingId === selectedBuildingId)) {
                        unitData[tx.propertyId] = {
                            unitId: tx.propertyId,
                            unitName: prop.name,
                            collected: 0,
                            expenses: 0,
                            brokerFee: 0,
                            billAmount: 0,
                            payable: 0
                        };
                    }
                }
            });

            let generalPayouts = 0;

            // Derive broker fees from rental agreements (same approach as BrokerFeeReport)
            // This is the most reliable source - shows fee accrued per property from agreements
            state.rentalAgreements.forEach(ra => {
                if (!ra.brokerId || !(ra.brokerFee) || ra.brokerFee <= 0) return;
                if (!ra.propertyId || !unitData[ra.propertyId]) return;

                const raDate = new Date(ra.startDate);
                if (raDate < start || raDate > end) return;

                const fee = typeof ra.brokerFee === 'string' ? parseFloat(ra.brokerFee) : Number(ra.brokerFee);
                if (!isNaN(fee)) unitData[ra.propertyId].brokerFee += fee;
            });

            // Derive bill amounts (cost center = owner property) — even if bill not paid yet
            (state.bills || []).forEach(bill => {
                if (!bill.propertyId || bill.projectId || !unitData[bill.propertyId]) return;
                const billDate = new Date(bill.issueDate);
                if (billDate < start || billDate > end) return;
                const amount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
                if (!isNaN(amount) && amount > 0) unitData[bill.propertyId].billAmount += amount;
            });

            // Build set of bill payment tx IDs to exclude from expenses (bill amount already in billAmount above)
            const ownerBillIds = new Set((state.bills || []).filter(b => b.propertyId && !b.projectId).map(b => b.id));
            const billPaymentTxIds = new Set<string>();
            state.transactions.forEach(tx => {
                if (tx.type === TransactionType.EXPENSE && tx.billId && ownerBillIds.has(tx.billId)) billPaymentTxIds.add(tx.id);
            });

            // Process transactions for this owner
            state.transactions.forEach(tx => {
                const txDate = new Date(tx.date);
                if (txDate < start || txDate > end) return;

                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(amount)) return;

                if (clearingRentCat && tx.categoryId === clearingRentCat.id) return;

                // Case 1: Rental Income — gross (single-owner) or per-owner share (multi-owner)
                if (tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id) {
                    if (tx.propertyId && unitData[tx.propertyId]) {
                        const d = (tx.date || '').slice(0, 10);
                        if (d && hasMultipleOwnersOnDate(state, String(tx.propertyId), d)) {
                            // Multi-owner: check for explicit share lines; if none, compute proportional share
                            const hasExplicitShares = ownerShareCat && state.transactions.some(
                                st => st.categoryId === ownerShareCat.id &&
                                    ((st.invoiceId && st.invoiceId === tx.invoiceId) || (st.batchId && st.batchId === tx.batchId))
                            );
                            if (!hasExplicitShares) {
                                const pct = getOwnerSharePercentageOnDate(state, String(tx.propertyId), owner.id, d);
                                if (pct > 0) unitData[tx.propertyId].collected += Math.round(amount * pct) / 100;
                            }
                            return;
                        }
                        const belongsToOwner = tx.ownerId ? tx.ownerId === owner.id : (state.properties.find(p => p.id === tx.propertyId)?.ownerId === owner.id);
                        if (belongsToOwner) unitData[tx.propertyId].collected += amount;
                    }
                }

                if (
                    tx.type === TransactionType.INCOME &&
                    ownerShareCat &&
                    tx.categoryId === ownerShareCat.id &&
                    tx.contactId === owner.id &&
                    tx.propertyId &&
                    unitData[tx.propertyId]
                ) {
                    unitData[tx.propertyId].collected += amount;
                }

                // Case 2: Expenses & Payouts
                if (tx.type === TransactionType.EXPENSE) {
                    const category = state.categories.find(c => c.id === tx.categoryId);
                    const catName = category?.name || '';

                    // Exclude Security/Tenant items (same as OwnerPayoutsPage)
                    if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;

                    // Skip broker fee payment transactions (broker fee is derived from agreements above)
                    if (brokerFeeTxIds.has(tx.id)) return;
                    // Skip bill payment transactions (bill amount is derived from bills above)
                    if (billPaymentTxIds.has(tx.id)) return;

                    // A. Property-linked Expense — use tx.ownerId when set
                    if (tx.propertyId && unitData[tx.propertyId]) {
                        const belongsToOwner = tx.ownerId ? tx.ownerId === owner.id : (state.properties.find(p => p.id === tx.propertyId)?.ownerId === owner.id);
                        if (belongsToOwner) unitData[tx.propertyId].expenses += amount;
                    }
                    // B. Direct Owner Payout or General Expense
                    else if (tx.contactId === owner.id) {
                        generalPayouts += amount;
                    }
                }
            });

            const units = Object.values(unitData).map(u => ({
                ...u,
                payable: u.collected - u.expenses - u.brokerFee - u.billAmount
            })).filter(u => u.collected !== 0 || u.expenses !== 0 || u.brokerFee !== 0 || u.billAmount !== 0);

            const totalUnitPayable = units.reduce((sum, u) => sum + u.payable, 0);
            const totalBrokerFee = units.reduce((sum, u) => sum + u.brokerFee, 0);
            const totalBillAmount = units.reduce((sum, u) => sum + u.billAmount, 0);

            return {
                ownerId: owner.id,
                ownerName: owner.name,
                units,
                generalPayouts,
                totalBrokerFee,
                totalBillAmount,
                totalPayable: totalUnitPayable - generalPayouts
            };
        }).filter(s => s.units.length > 0 || s.generalPayouts !== 0);

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return summaries.filter(s =>
                s.ownerName.toLowerCase().includes(q) ||
                s.units.some(u => u.unitName.toLowerCase().includes(q))
            );
        }

        return summaries;
    }, [state, startDate, endDate, selectedOwnerId, selectedBuildingId, searchQuery]);

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
                                {selectedBuildingId !== 'all' && ` Building: ${state.buildings.find(b => b.id === selectedBuildingId)?.name} `}
                                {selectedOwnerId !== 'all' && ` Owner: ${state.contacts.find(c => c.id === selectedOwnerId)?.name}`}
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
