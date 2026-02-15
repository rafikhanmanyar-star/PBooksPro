import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, SortDirection, LedgerSortKey as SortKey, FilterCriteria } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

interface LedgerFiltersProps {
    filters: FilterCriteria;
    onFiltersChange: (filters: FilterCriteria) => void;
    onClear: () => void;
    onClose: () => void;
}

const LedgerFilters: React.FC<LedgerFiltersProps> = ({
    filters,
    onFiltersChange,
    onClear,
    onClose
}) => {
    const { state } = useAppContext();
    const [tempFilters, setTempFilters] = useState<FilterCriteria>(filters);

    // Filter out Internal Clearing account from combo box - with defensive check
    const selectableAccounts = useMemo(() => {
        if (!state?.accounts) return [];
        return state.accounts.filter(a => a.name !== 'Internal Clearing');
    }, [state?.accounts]);

    const handleApply = () => {
        onFiltersChange(tempFilters);
        onClose();
    };

    const handleClear = () => {
        onClear();
        onClose();
    };

    const availableCategories = useMemo(() => {
        if (!state?.categories) return [];
        return tempFilters.type
            ? state.categories.filter(c =>
                tempFilters.type === 'Income' ? c.type === TransactionType.INCOME :
                    tempFilters.type === 'Expense' ? c.type === TransactionType.EXPENSE :
                        true
            )
            : state.categories;
    }, [state?.categories, tempFilters.type]);

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-md p-5 border-t-4 border-t-indigo-500 overflow-hidden relative">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <div className="w-4 h-4">{ICONS.filter}</div>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">Advanced Filters</h3>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Refine your ledger view</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                >
                    <div className="w-5 h-5">{ICONS.x}</div>
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                {/* Date Range */}
                <div className="lg:col-span-1 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Date Range</label>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="date"
                            value={tempFilters.startDate}
                            onChange={(e) => setTempFilters(prev => ({ ...prev, startDate: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        />
                        <input
                            type="date"
                            value={tempFilters.endDate}
                            onChange={(e) => setTempFilters(prev => ({ ...prev, endDate: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        />
                    </div>
                </div>

                {/* Transaction Type */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Type & Grouping</label>
                    <div className="grid grid-cols-2 gap-2">
                        <select
                            value={tempFilters.type}
                            onChange={(e) => setTempFilters(prev => ({ ...prev, type: e.target.value, categoryId: '' }))}
                            className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        >
                            <option value="">All Types</option>
                            <option value="Income">Income</option>
                            <option value="Expense">Expense</option>
                            <option value="Transfer">Transfer</option>
                            <option value="Loan">Loan</option>
                        </select>
                        <select
                            value={tempFilters.groupBy}
                            onChange={(e) => setTempFilters(prev => ({ ...prev, groupBy: e.target.value as FilterCriteria['groupBy'] }))}
                            className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        >
                            <option value="none">No Grouping</option>
                            <option value="date">By Date</option>
                            <option value="type">By Type</option>
                            <option value="account">By Account</option>
                            <option value="category">By Category</option>
                            <option value="contact">By Contact</option>
                        </select>
                    </div>
                </div>

                {/* Account & Category */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Account & Category</label>
                    <div className="grid grid-cols-2 gap-2">
                        <ComboBox
                            items={selectableAccounts}
                            selectedId={tempFilters.accountId}
                            onSelect={(item) => setTempFilters(prev => ({ ...prev, accountId: item?.id || '' }))}
                            placeholder="All Accounts"
                            allowAddNew={false}
                            compact={true}
                        />
                        <ComboBox
                            items={availableCategories}
                            selectedId={tempFilters.categoryId}
                            onSelect={(item) => setTempFilters(prev => ({ ...prev, categoryId: item?.id || '' }))}
                            placeholder="All Categories"
                            allowAddNew={false}
                            compact={true}
                        />
                    </div>
                </div>

                {/* Amount Range */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Amount Range</label>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="number"
                            value={tempFilters.minAmount}
                            onChange={(e) => setTempFilters(prev => ({ ...prev, minAmount: e.target.value }))}
                            placeholder="Min"
                            className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        />
                        <input
                            type="number"
                            value={tempFilters.maxAmount}
                            onChange={(e) => setTempFilters(prev => ({ ...prev, maxAmount: e.target.value }))}
                            placeholder="Max"
                            className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        />
                    </div>
                </div>

                {/* Additional Scopes */}
                <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Contact</label>
                        <ComboBox
                            items={state?.contacts || []}
                            selectedId={tempFilters.contactId}
                            onSelect={(item) => setTempFilters(prev => ({ ...prev, contactId: item?.id || '' }))}
                            placeholder="Select Contact"
                            allowAddNew={false}
                            compact={true}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Project Scope</label>
                        <ComboBox
                            items={state?.projects || []}
                            selectedId={tempFilters.projectId}
                            onSelect={(item) => setTempFilters(prev => ({ ...prev, projectId: item?.id || '' }))}
                            placeholder="Select Project"
                            allowAddNew={false}
                            compact={true}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Building/Unit</label>
                        <ComboBox
                            items={state?.buildings || []}
                            selectedId={tempFilters.buildingId}
                            onSelect={(item) => setTempFilters(prev => ({ ...prev, buildingId: item?.id || '' }))}
                            placeholder="Select Building"
                            allowAddNew={false}
                            compact={true}
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="lg:col-span-1 flex items-end justify-end gap-2 pt-2">
                    <button
                        onClick={handleClear}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-rose-500 transition-all uppercase tracking-wider"
                    >
                        Reset
                    </button>
                    <Button
                        onClick={handleApply}
                        className="!px-6 !py-2 !rounded-xl !text-sm !bg-indigo-600 hover:!bg-indigo-700 !text-white transition-all shadow-md shadow-indigo-500/20"
                    >
                        Apply View
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default LedgerFilters;

