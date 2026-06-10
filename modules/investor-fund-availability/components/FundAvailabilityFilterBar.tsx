import React, { useMemo, useState } from 'react';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import ComboBox from '../../../components/ui/ComboBox';
import type { AppState } from '../../../types';
import { getInvestorEquityAccounts } from '../../../components/investmentManagement/equityMetrics';
import { useFundAvailabilityFiltersStore } from '../store/fundAvailabilityFiltersStore';
import type { FundAvailabilityRow } from '../types/fundAvailability.types';
import { uniqueCities, uniqueDistributionCycleKeys } from '../services/investorFundAvailability.service';

export interface FundAvailabilityFilterBarProps {
    state: AppState;
    endDate: string;
    onEndDateChange: (d: string) => void;
    allRows: FundAvailabilityRow[];
    canManageFilters: boolean;
}

export const FundAvailabilityFilterBar: React.FC<FundAvailabilityFilterBarProps> = ({
    state,
    endDate,
    onEndDateChange,
    allRows,
    canManageFilters,
}) => {
    const { filters, setFilter, resetFilters, savePreset, loadPreset, deletePreset, savedPresets, reservePolicy, setReservePolicy } =
        useFundAvailabilityFiltersStore();
    const [presetName, setPresetName] = useState('');

    const investorAccounts = useMemo(() => getInvestorEquityAccounts(state), [state]);

    const cities = useMemo(() => ['all', ...uniqueCities(allRows)], [allRows]);

    const statusItems = ['all', 'Active', 'Completed', 'On Hold', 'Closed'].map((s) => ({ id: s, name: s === 'all' ? 'All statuses' : s }));

    const healthItems = (
        [
            ['all', 'All health'],
            ['Healthy', 'Healthy'],
            ['Warning', 'Warning'],
            ['Blocked', 'Blocked'],
            ['Overdrawn', 'Overdrawn'],
        ] as const
    ).map(([id, name]) => ({ id, name }));

    const investorItems = useMemo(
        () => [{ id: 'all', name: 'All investors' }, ...investorAccounts.map((a) => ({ id: a.id, name: a.name }))],
        [investorAccounts]
    );

    const projectItems = useMemo(
        () => [{ id: 'all', name: 'All projects' }, ...state.projects.map((p) => ({ id: p.id, name: p.name }))],
        [state.projects]
    );

    const distKeys = useMemo(() => {
        const keys = uniqueDistributionCycleKeys(state, endDate);
        return [{ id: 'all', name: 'All cycles' }, ...keys.map((k) => ({ id: k, name: k.length > 36 ? `${k.slice(0, 34)}…` : k }))];
    }, [state, endDate]);

    const withdrawalItems = (
        [
            ['all', 'All'],
            ['has_withdrawals', 'Has withdrawals'],
            ['none', 'No withdrawals'],
        ] as const
    ).map(([id, name]) => ({ id, name }));

    return (
        <div className="sticky top-0 z-30 -mx-1 px-1 py-3 mb-2 bg-slate-50/95 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[160px] flex-1">
                    <Input
                        label="Search"
                        value={filters.search}
                        onChange={(e) => setFilter('search', e.target.value)}
                        placeholder="Project name…"
                        disabled={!canManageFilters}
                    />
                </div>
                <div className="w-40">
                    <Input label="As of date" type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
                </div>
                <div className="w-48">
                    <ComboBox
                        label="Project"
                        items={projectItems}
                        selectedId={filters.projectId}
                        onSelect={(i) => setFilter('projectId', i?.id || 'all')}
                        allowAddNew={false}
                    />
                </div>
                <div className="w-44">
                    <ComboBox label="Status" items={statusItems} selectedId={filters.projectStatus} onSelect={(i) => setFilter('projectStatus', (i?.id as string) || 'all')} allowAddNew={false} />
                </div>
                <div className="w-48">
                    <ComboBox label="Investor" items={investorItems} selectedId={filters.investorId} onSelect={(i) => setFilter('investorId', i?.id || 'all')} allowAddNew={false} />
                </div>
                <div className="w-44">
                    <ComboBox
                        label="Liquidity health"
                        items={healthItems}
                        selectedId={filters.liquidityHealth}
                        onSelect={(i) => setFilter('liquidityHealth', (i?.id as typeof filters.liquidityHealth) || 'all')}
                        allowAddNew={false}
                    />
                </div>
                <div className="w-44">
                    <ComboBox label="City / site" items={cities.map((t) => ({ id: t, name: t === 'all' ? 'All locations' : t }))} selectedId={filters.city} onSelect={(i) => setFilter('city', i?.id || 'all')} allowAddNew={false} />
                </div>
                <div className="min-w-[200px] flex-1">
                    <Input label="Tags (description)" value={filters.tag} onChange={(e) => setFilter('tag', e.target.value)} placeholder="e.g. phase-2" disabled={!canManageFilters} />
                </div>
                <div className="w-56 min-w-[12rem]">
                    <ComboBox
                        label="Distribution cycle"
                        items={distKeys}
                        selectedId={filters.distributionCycleKey}
                        onSelect={(i) => setFilter('distributionCycleKey', i?.id || 'all')}
                        allowAddNew={false}
                    />
                </div>
                <div className="w-48">
                    <ComboBox
                        label="Withdrawals"
                        items={withdrawalItems}
                        selectedId={filters.withdrawalStatus}
                        onSelect={(i) => setFilter('withdrawalStatus', (i?.id as typeof filters.withdrawalStatus) || 'all')}
                        allowAddNew={false}
                    />
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200/80 dark:border-slate-800 pt-3">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reserve policy</span>
                    <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                        <input
                            type="radio"
                            checked={reservePolicy.mode === 'percent'}
                            onChange={() => setReservePolicy({ mode: 'percent', percent: 20 })}
                        />
                        %
                    </label>
                    <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                        <input type="radio" checked={reservePolicy.mode === 'fixed'} onChange={() => setReservePolicy({ mode: 'fixed', amount: 0 })} />
                        Fixed
                    </label>
                </div>
                {reservePolicy.mode === 'percent' ? (
                    <div className="w-28">
                        <Input
                            label="Reserve %"
                            type="number"
                            value={String(reservePolicy.percent)}
                            onChange={(e) => setReservePolicy({ mode: 'percent', percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                        />
                    </div>
                ) : (
                    <div className="w-36">
                        <Input
                            label="Reserve amount"
                            type="number"
                            value={String(reservePolicy.amount)}
                            onChange={(e) => setReservePolicy({ mode: 'fixed', amount: Math.max(0, Number(e.target.value) || 0) })}
                        />
                    </div>
                )}
                <Button variant="secondary" type="button" onClick={resetFilters} disabled={!canManageFilters}>
                    Reset filters
                </Button>
                <div className="flex flex-wrap items-end gap-2">
                    <Input label="Preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="My view" className="w-40" disabled={!canManageFilters} />
                    <Button type="button" onClick={() => { savePreset(presetName); setPresetName(''); }} disabled={!canManageFilters || !presetName.trim()}>
                        Save preset
                    </Button>
                </div>
                {savedPresets.length > 0 && (
                    <div className="flex items-end gap-2">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Presets
                            <select
                                className="mt-1 block w-44 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm py-2 px-2"
                                value=""
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '__load__') return;
                                    if (v.startsWith('load:')) loadPreset(v.slice(5));
                                    if (v.startsWith('del:')) deletePreset(v.slice(4));
                                    e.target.value = '';
                                }}
                            >
                                <option value="__load__">Load or delete…</option>
                                {savedPresets.map((p) => (
                                    <option key={`l-${p.name}`} value={`load:${p.name}`}>
                                        Load: {p.name}
                                    </option>
                                ))}
                                {savedPresets.map((p) => (
                                    <option key={`d-${p.name}`} value={`del:${p.name}`}>
                                        Delete: {p.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                )}
                <div className="ml-auto flex flex-wrap gap-2 text-xs">
                    <Button variant="secondary" type="button" onClick={() => { setFilter('liquidityHealth', 'Healthy'); setFilter('projectStatus', 'Active'); }} disabled={!canManageFilters}>
                        Quick: Healthy & active
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => setFilter('liquidityHealth', 'Blocked')} disabled={!canManageFilters}>
                        Quick: Blocked
                    </Button>
                </div>
            </div>
        </div>
    );
};
