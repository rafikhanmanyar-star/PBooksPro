import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import ComboBox from '../../../components/ui/ComboBox';
import { useProfitabilityFiltersStore } from '../store/profitabilityFiltersStore';
import type { ProjectProfitabilityRow } from '../types/profitability.types';
import { uniqueCities, uniqueProjectTypes } from '../services/projectProfitability.service';
import type { AppState } from '../../../types';
import { AccountType } from '../../../types';

export interface ProfitabilityFilterBarProps {
    state: AppState;
    endDate: string;
    onEndDateChange: (d: string) => void;
    allRows: ProjectProfitabilityRow[];
    canManageFilters: boolean;
    onProjectSelect?: (projectId: string) => void;
}

export const ProfitabilityFilterBar: React.FC<ProfitabilityFilterBarProps> = ({
    state,
    endDate,
    onEndDateChange,
    allRows,
    canManageFilters,
    onProjectSelect,
}) => {
    const { filters, setFilter, resetFilters, savePreset, loadPreset, deletePreset, savedPresets } = useProfitabilityFiltersStore();
    const [presetName, setPresetName] = useState('');

    const equityAccounts = useMemo(() => state.accounts.filter((a) => a.type === AccountType.EQUITY), [state.accounts]);
    const projectTypes = useMemo(() => ['all', ...uniqueProjectTypes(allRows)], [allRows]);
    const cities = useMemo(() => ['all', ...uniqueCities(allRows)], [allRows]);

    const brokerItems = useMemo(() => {
        const m = new Map<string, string>();
        for (const ag of state.projectAgreements ?? []) {
            if (!ag.rebateBrokerId) continue;
            const c = state.contacts.find((x) => x.id === ag.rebateBrokerId);
            m.set(ag.rebateBrokerId, c?.name || ag.rebateBrokerId);
        }
        return [{ id: 'all', name: 'All brokers' }, ...[...m.entries()].map(([id, name]) => ({ id, name }))];
    }, [state.projectAgreements, state.contacts]);

    const statusItems = ['all', 'Active', 'Completed', 'On Hold', 'Closed'].map((s) => ({ id: s, name: s === 'all' ? 'All statuses' : s }));

    const investorItems = useMemo(
        () => [{ id: 'all', name: 'All investors' }, ...equityAccounts.map((a) => ({ id: a.id, name: a.name }))],
        [equityAccounts]
    );

    const projectItems = useMemo(() => {
        const sorted = [...state.projects].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
        return [{ id: 'all', name: 'All projects' }, ...sorted.map((p) => ({ id: p.id, name: p.name }))];
    }, [state.projects]);

    const handleProjectChange = (projectId: string) => {
        setFilter('projectId', projectId);
        if (projectId !== 'all') {
            setFilter('search', '');
            onProjectSelect?.(projectId);
        }
    };

    return (
        <div className="sticky top-0 z-30 -mx-1 px-1 py-3 mb-2 bg-slate-50/95 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
            <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-gradient-to-r from-indigo-50/90 to-white/90 dark:from-indigo-950/40 dark:to-slate-900/60 px-3 py-3 shadow-sm"
            >
                <div className="w-full sm:min-w-[280px] sm:flex-1 max-w-xl">
                    <ComboBox
                        label="Project"
                        items={projectItems}
                        selectedId={filters.projectId || 'all'}
                        onSelect={(i) => handleProjectChange(i?.id || 'all')}
                        allowAddNew={false}
                        entityType="project"
                        placeholder="Select a project…"
                    />
                </div>
                <div className="w-full sm:w-44">
                    <Input label="As of date" type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
                </div>
                {filters.projectId !== 'all' && (
                    <Button variant="secondary" type="button" onClick={() => handleProjectChange('all')} className="shrink-0">
                        Show all projects
                    </Button>
                )}
            </motion.div>
            <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[160px] flex-1">
                    <Input label="Search" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Project name…" disabled={!canManageFilters} />
                </div>
                <div className="w-44">
                    <ComboBox label="Status" items={statusItems} selectedId={filters.projectStatus} onSelect={(i) => setFilter('projectStatus', (i?.id as string) || 'all')} allowAddNew={false} />
                </div>
                <div className="w-48">
                    <ComboBox label="Investor" items={investorItems} selectedId={filters.investorId} onSelect={(i) => setFilter('investorId', i?.id || 'all')} allowAddNew={false} />
                </div>
                <div className="w-44">
                    <ComboBox
                        label="Project type"
                        items={projectTypes.map((t) => ({ id: t, name: t === 'all' ? 'All types' : t }))}
                        selectedId={filters.projectType}
                        onSelect={(i) => setFilter('projectType', i?.id || 'all')}
                        allowAddNew={false}
                    />
                </div>
                <div className="w-44">
                    <ComboBox
                        label="City / site"
                        items={cities.map((t) => ({ id: t, name: t === 'all' ? 'All locations' : t }))}
                        selectedId={filters.city}
                        onSelect={(i) => setFilter('city', i?.id || 'all')}
                        allowAddNew={false}
                    />
                </div>
                <div className="w-36">
                    <Input label="Completion % min" value={filters.completionMin} onChange={(e) => setFilter('completionMin', e.target.value)} placeholder="0" disabled={!canManageFilters} />
                </div>
                <div className="w-36">
                    <Input label="Completion % max" value={filters.completionMax} onChange={(e) => setFilter('completionMax', e.target.value)} placeholder="100" disabled={!canManageFilters} />
                </div>
                <div className="w-44">
                    <ComboBox
                        label="Profitability"
                        items={[
                            { id: 'all', name: 'All' },
                            { id: 'profitable', name: 'Profitable' },
                            { id: 'loss', name: 'Loss' },
                            { id: 'breakeven', name: 'Breakeven' },
                        ]}
                        selectedId={filters.profitability}
                        onSelect={(i) => setFilter('profitability', (i?.id as 'all' | 'profitable' | 'loss' | 'breakeven') || 'all')}
                        allowAddNew={false}
                    />
                </div>
                <div className="w-48">
                    <ComboBox label="Broker" items={brokerItems} selectedId={filters.brokerId} onSelect={(i) => setFilter('brokerId', i?.id || 'all')} allowAddNew={false} />
                </div>
                <div className="min-w-[120px] flex-1">
                    <Input label="Tags / notes" value={filters.tag} onChange={(e) => setFilter('tag', e.target.value)} placeholder="Filter description…" disabled={!canManageFilters} />
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
                <Button variant="secondary" type="button" onClick={() => resetFilters()} disabled={!canManageFilters}>
                    Reset filters
                </Button>
                <div className="flex items-end gap-2">
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
                <div className="ml-auto flex gap-2 text-xs">
                    <Button variant="secondary" type="button" onClick={() => { setFilter('profitability', 'profitable'); setFilter('projectStatus', 'Active'); }}>
                        Quick: Active, profitable
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => { setFilter('profitability', 'loss'); }}>
                        Quick: Underwater
                    </Button>
                </div>
            </div>
        </div>
    );
};
