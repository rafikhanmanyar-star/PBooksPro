
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
import { formatDate } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface UnitSummary {
    unitId: string;
    unitName: string;
    collected: number;
    expenses: number;
    brokerFee: number;
    payable: number;
}

interface OwnerSummary {
    ownerId: string;
    ownerName: string;
    units: UnitSummary[];
    generalPayouts: number; // Payouts not linked to a specific unit
    totalBrokerFee: number; // Total broker fees across all units
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
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (option === 'lastMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
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
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');

        if (!rentalIncomeCategory) return [];

        // 1. Filter owners
        const filteredOwners = state.contacts.filter(c =>
            (c.type === ContactType.OWNER || c.type === ContactType.CLIENT) &&
            (selectedOwnerId === 'all' || c.id === selectedOwnerId)
        );

        const summaries: OwnerSummary[] = filteredOwners.map(owner => {
            const ownerProperties = state.properties.filter(p =>
                p.ownerId === owner.id &&
                (selectedBuildingId === 'all' || p.buildingId === selectedBuildingId)
            );
            const unitData: { [unitId: string]: UnitSummary } = {};

            ownerProperties.forEach(p => {
                unitData[p.id] = {
                    unitId: p.id,
                    unitName: p.name,
                    collected: 0,
                    expenses: 0,
                    brokerFee: 0,
                    payable: 0
                };
            });

            let generalPayouts = 0;

            // Process transactions for this owner
            state.transactions.forEach(tx => {
                const txDate = new Date(tx.date);
                if (txDate < start || txDate > end) return;

                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(amount)) return;

                // Case 1: Rental Income
                if (tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id) {
                    if (tx.propertyId && unitData[tx.propertyId]) {
                        unitData[tx.propertyId].collected += amount;
                    }
                }

                // Case 2: Expenses & Payouts
                if (tx.type === TransactionType.EXPENSE) {
                    const category = state.categories.find(c => c.id === tx.categoryId);
                    const catName = category?.name || '';

                    // Exclude Security/Tenant items (same as OwnerPayoutsPage)
                    if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;

                    // A. Property-linked Expense
                    if (tx.propertyId && unitData[tx.propertyId]) {
                        // Separate broker fees from other expenses
                        if (brokerFeeCategory && tx.categoryId === brokerFeeCategory.id) {
                            unitData[tx.propertyId].brokerFee += amount;
                        } else {
                            unitData[tx.propertyId].expenses += amount;
                        }
                    }
                    // B. Direct Owner Payout or General Expense
                    else if (tx.contactId === owner.id) {
                        generalPayouts += amount;
                    }
                }
            });

            const units = Object.values(unitData).map(u => ({
                ...u,
                payable: u.collected - u.expenses - u.brokerFee
            })).filter(u => u.collected !== 0 || u.expenses !== 0 || u.brokerFee !== 0);

            const totalUnitPayable = units.reduce((sum, u) => sum + u.payable, 0);
            const totalBrokerFee = units.reduce((sum, u) => sum + u.brokerFee, 0);

            return {
                ownerId: owner.id,
                ownerName: owner.name,
                units,
                generalPayouts,
                totalBrokerFee,
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
            payouts: acc.payouts + curr.generalPayouts,
            payable: acc.payable + curr.totalPayable
        }), { collected: 0, expenses: 0, brokerFees: 0, payouts: 0, payable: 0 });
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
                'Unit Net': '',
                'General Payouts': '',
                'Total Payable': owner.totalPayable
            });
        });

        exportJsonToExcel(flatData, 'owner-income-summary.xlsx', 'Owner Income Summary');
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>

            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Date Range Pills */}
                    <div className="flex bg-slate-100 p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                        {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${dateRange === opt
                                    ? 'bg-white text-accent shadow-sm font-bold'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                    }`}
                            >
                                {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Pickers */}
                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} />
                            <span className="text-slate-400">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} />
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
                            className="text-sm py-1.5"
                        >
                            <option value="">No Grouping</option>
                            <option value="owner">Group by Owner</option>
                        </Select>
                    </div>

                    {/* Search Input */}
                    <div className="relative flex-grow min-w-[180px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
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
                                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
                            >
                                <div className="w-4 h-4">{ICONS.x}</div>
                            </button>
                        )}
                    </div>

                    {/* Actions Group */}
                    <div className="flex items-center gap-2 ml-auto">
                        <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
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
                        <h3 className="text-2xl font-bold text-slate-800">Owner Income Summary</h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {dateRange === 'all' ? 'All Time' : `${formatDate(startDate)} - ${formatDate(endDate)}`}
                        </p>
                        {(selectedBuildingId !== 'all' || selectedOwnerId !== 'all' || groupBy) && (
                            <p className="text-xs text-slate-400 mt-1">
                                Filters:
                                {selectedBuildingId !== 'all' && ` Building: ${state.buildings.find(b => b.id === selectedBuildingId)?.name} `}
                                {selectedOwnerId !== 'all' && ` Owner: ${state.contacts.find(c => c.id === selectedOwnerId)?.name}`}
                                {groupBy && ` | Grouped by: ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`}
                            </p>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold text-slate-700">Owner / Unit</th>
                                    <th className="px-4 py-3 text-right font-bold text-slate-700">Collected</th>
                                    <th className="px-4 py-3 text-right font-bold text-slate-700">Expenses</th>
                                    <th className="px-4 py-3 text-right font-bold text-slate-700">Broker Fee</th>
                                    <th className="px-4 py-3 text-right font-bold text-slate-700">Net Payable</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(owner => (
                                    <React.Fragment key={owner.ownerId}>
                                        {/* Owner Header Row */}
                                        <tr className="bg-indigo-50/30">
                                            <td className="px-4 py-3 font-bold text-accent" colSpan={5}>
                                                {owner.ownerName}
                                            </td>
                                        </tr>

                                        {/* Unit Rows */}
                                        {owner.units.map(unit => (
                                            <tr key={unit.unitId} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-8 py-2 text-slate-600 italic">
                                                    {unit.unitName}
                                                </td>
                                                <td className="px-4 py-2 text-right text-success">
                                                    {unit.collected > 0 ? `${CURRENCY} ${formatCurrency(unit.collected)}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-danger">
                                                    {unit.expenses > 0 ? `${CURRENCY} ${formatCurrency(unit.expenses)}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-orange-600">
                                                    {unit.brokerFee > 0 ? `${CURRENCY} ${formatCurrency(unit.brokerFee)}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right font-medium text-slate-700">
                                                    {CURRENCY} {formatCurrency(unit.payable)}
                                                </td>
                                            </tr>
                                        ))}

                                        {/* General Payouts Row (if any) */}
                                        {owner.generalPayouts !== 0 && (
                                            <tr className="bg-red-50/20">
                                                <td className="px-8 py-2 text-slate-500 italic">
                                                    General Payouts / Adjustments
                                                </td>
                                                <td className="px-4 py-2 text-right">-</td>
                                                <td className="px-4 py-2 text-right text-danger">
                                                    {CURRENCY} {formatCurrency(owner.generalPayouts)}
                                                </td>
                                                <td className="px-4 py-2 text-right">-</td>
                                                <td className="px-4 py-2 text-right font-medium text-danger">
                                                    -{CURRENCY} {formatCurrency(owner.generalPayouts)}
                                                </td>
                                            </tr>
                                        )}

                                        {/* Owner Subtotal Row */}
                                        <tr className="bg-slate-100 font-bold">
                                            <td className="px-4 py-2 text-right text-slate-700">
                                                Total for {owner.ownerName}
                                            </td>
                                            <td className="px-4 py-2 text-right text-success">
                                                {CURRENCY} {formatCurrency(owner.units.reduce((s, u) => s + u.collected, 0))}
                                            </td>
                                            <td className="px-4 py-2 text-right text-danger">
                                                {CURRENCY} {formatCurrency(owner.units.reduce((s, u) => s + u.expenses, 0) + owner.generalPayouts)}
                                            </td>
                                            <td className="px-4 py-2 text-right text-orange-600">
                                                {owner.totalBrokerFee > 0 ? `${CURRENCY} ${formatCurrency(owner.totalBrokerFee)}` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-accent text-base">
                                                {CURRENCY} {formatCurrency(owner.totalPayable)}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                ))}

                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                                            No summary data found for the selected owner and period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {reportData.length > 0 && (
                                <tfoot className="bg-slate-200 font-bold border-t-2 border-slate-400">
                                    <tr>
                                        <td className="px-4 py-4 text-right text-lg">GRAND TOTAL</td>
                                        <td className="px-4 py-4 text-right text-success text-lg">
                                            {CURRENCY} {formatCurrency(totals.collected)}
                                        </td>
                                        <td className="px-4 py-4 text-right text-danger text-lg">
                                            {CURRENCY} {formatCurrency(totals.expenses + totals.payouts)}
                                        </td>
                                        <td className="px-4 py-4 text-right text-orange-600 text-lg">
                                            {totals.brokerFees > 0 ? `${CURRENCY} ${formatCurrency(totals.brokerFees)}` : '-'}
                                        </td>
                                        <td className="px-4 py-4 text-right text-accent text-xl">
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
