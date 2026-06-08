import { useRentalReportAppState } from '../../hooks/useSelectiveState';
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ProjectAgreementStatus, TransactionType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';

export type BrokerFeeGroupBy = 'project' | 'broker' | 'unit';

type SortDirection = 'asc' | 'desc';

interface ColumnDef {
    id: string;
    label: string;
    /** 'num' = numeric sort and right-align */
    kind: 'text' | 'num';
}

interface AgreementFeeLine {
    agreementId: string;
    agreementNumber: string;
    projectId: string;
    projectName: string;
    brokerId: string;
    brokerName: string;
    clientName: string;
    unitIds: string[];
    feeEarned: number;
    feePaid: number;
    feeBalance: number;
}

function paidForProjectAgreement(
    agreementId: string,
    transactions: { type: string; agreementId?: string; categoryId?: string; amount: number }[],
    categoryIds: Set<string>
): number {
    let sum = 0;
    for (const tx of transactions) {
        if (tx.type !== TransactionType.EXPENSE) continue;
        if (tx.agreementId !== agreementId) continue;
        if (!tx.categoryId || !categoryIds.has(tx.categoryId)) continue;
        const a = typeof tx.amount === 'string' ? parseFloat(String(tx.amount)) : Number(tx.amount);
        if (!isNaN(a)) sum += a;
    }
    return sum;
}

function compareCell(a: string | number, b: string | number, kind: 'text' | 'num', dir: SortDirection): number {
    const mul = dir === 'asc' ? 1 : -1;
    if (kind === 'num') {
        const na = typeof a === 'number' ? a : parseFloat(String(a)) || 0;
        const nb = typeof b === 'number' ? b : parseFloat(String(b)) || 0;
        if (na < nb) return -1 * mul;
        if (na > nb) return 1 * mul;
        return 0;
    }
    const sa = String(a ?? '').toLowerCase();
    const sb = String(b ?? '').toLowerCase();
    return sa.localeCompare(sb, undefined, { sensitivity: 'base' }) * mul;
}

const BrokerProjectFeeDimensionReport: React.FC = () => {
    const state = useRentalReportAppState();
    const { contacts, categories, projects, units, transactions, projectAgreements } = state;
    const [groupBy, setGroupBy] = useState<BrokerFeeGroupBy>('project');
    const [sortKey, setSortKey] = useState<string>('group');
    const [sortDir, setSortDir] = useState<SortDirection>('asc');

    const categoryIdSet = useMemo(() => {
        const fee = categories.find((c) => c.name === 'Broker Fee')?.id;
        const rebate = categories.find((c) => c.name === 'Rebate Amount')?.id;
        return new Set([fee, rebate].filter(Boolean) as string[]);
    }, [categories]);

    const agreementLines = useMemo<AgreementFeeLine[]>(() => {
        const lines: AgreementFeeLine[] = [];
        for (const pa of projectAgreements) {
            if (pa.status === ProjectAgreementStatus.CANCELLED) continue;
            if (!pa.rebateBrokerId || !(pa.rebateAmount || 0)) continue;
            const earned = typeof pa.rebateAmount === 'number' ? pa.rebateAmount : parseFloat(String(pa.rebateAmount)) || 0;
            if (earned <= 0.0005) continue;

            const paid = paidForProjectAgreement(pa.id, transactions, categoryIdSet);
            const broker = contacts.find((c) => c.id === pa.rebateBrokerId);
            const project = projects.find((p) => p.id === pa.projectId);
            const client = contacts.find((c) => c.id === pa.clientId);
            lines.push({
                agreementId: pa.id,
                agreementNumber: pa.agreementNumber || pa.id,
                projectId: pa.projectId,
                projectName: project?.name || '—',
                brokerId: pa.rebateBrokerId,
                brokerName: broker?.name || 'Unknown',
                clientName: client?.name || '—',
                unitIds: Array.isArray(pa.unitIds) ? pa.unitIds : [],
                feeEarned: earned,
                feePaid: paid,
                feeBalance: Math.max(0, earned - paid),
            });
        }
        return lines;
    }, [projectAgreements, transactions, contacts, projects, categoryIdSet]);

    const columns = useMemo((): ColumnDef[] => {
        switch (groupBy) {
            case 'project':
                return [
                    { id: 'group', label: 'Project', kind: 'text' },
                    { id: 'agreements', label: 'Agreements', kind: 'num' },
                    { id: 'feeEarned', label: 'Earned', kind: 'num' },
                    { id: 'feePaid', label: 'Paid', kind: 'num' },
                    { id: 'feeBalance', label: 'Balance', kind: 'num' },
                ];
            case 'broker':
                return [
                    { id: 'group', label: 'Broker', kind: 'text' },
                    { id: 'agreements', label: 'Agreements', kind: 'num' },
                    { id: 'feeEarned', label: 'Earned', kind: 'num' },
                    { id: 'feePaid', label: 'Paid', kind: 'num' },
                    { id: 'feeBalance', label: 'Balance', kind: 'num' },
                ];
            case 'unit':
                return [
                    { id: 'unit', label: 'Unit', kind: 'text' },
                    { id: 'project', label: 'Project', kind: 'text' },
                    { id: 'broker', label: 'Broker', kind: 'text' },
                    { id: 'agreement', label: 'Agreement', kind: 'text' },
                    { id: 'client', label: 'Client', kind: 'text' },
                    { id: 'feeEarned', label: 'Earned', kind: 'num' },
                    { id: 'feePaid', label: 'Paid', kind: 'num' },
                    { id: 'feeBalance', label: 'Balance', kind: 'num' },
                ];
            default:
                return [];
        }
    }, [groupBy]);

    const rawRows = useMemo(() => {
        type RowVals = Record<string, string | number>;
        const out: { id: string; sort: RowVals; display: RowVals }[] = [];

        if (groupBy === 'project') {
            const map = new Map<
                string,
                { name: string; agreements: Set<string>; earned: number; paid: number; balance: number }
            >();
            for (const line of agreementLines) {
                let b = map.get(line.projectId);
                if (!b) {
                    b = { name: line.projectName, agreements: new Set(), earned: 0, paid: 0, balance: 0 };
                    map.set(line.projectId, b);
                }
                b.agreements.add(line.agreementId);
                b.earned += line.feeEarned;
                b.paid += line.feePaid;
                b.balance += line.feeBalance;
            }
            for (const [pid, b] of map) {
                const n = b.agreements.size;
                out.push({
                    id: `p-${pid}`,
                    sort: {
                        group: b.name,
                        agreements: n,
                        feeEarned: b.earned,
                        feePaid: b.paid,
                        feeBalance: b.balance,
                    },
                    display: {
                        group: b.name,
                        agreements: n,
                        feeEarned: b.earned,
                        feePaid: b.paid,
                        feeBalance: b.balance,
                    },
                });
            }
        } else if (groupBy === 'broker') {
            const map = new Map<
                string,
                { name: string; agreements: Set<string>; earned: number; paid: number; balance: number }
            >();
            for (const line of agreementLines) {
                let b = map.get(line.brokerId);
                if (!b) {
                    b = { name: line.brokerName, agreements: new Set(), earned: 0, paid: 0, balance: 0 };
                    map.set(line.brokerId, b);
                }
                b.agreements.add(line.agreementId);
                b.earned += line.feeEarned;
                b.paid += line.feePaid;
                b.balance += line.feeBalance;
            }
            for (const [bid, b] of map) {
                const n = b.agreements.size;
                out.push({
                    id: `b-${bid}`,
                    sort: {
                        group: b.name,
                        agreements: n,
                        feeEarned: b.earned,
                        feePaid: b.paid,
                        feeBalance: b.balance,
                    },
                    display: {
                        group: b.name,
                        agreements: n,
                        feeEarned: b.earned,
                        feePaid: b.paid,
                        feeBalance: b.balance,
                    },
                });
            }
        } else {
            for (const line of agreementLines) {
                const uids = line.unitIds.length > 0 ? line.unitIds : [''];
                const denom = Math.max(1, line.unitIds.length);
                for (const uid of uids) {
                    const unit = uid ? units.find((u) => u.id === uid) : undefined;
                    const unitLabel = uid ? unit?.name || uid : '—';
                    const e = line.feeEarned / denom;
                    const p = line.feePaid / denom;
                    const bal = line.feeBalance / denom;
                    out.push({
                        id: `${line.agreementId}:${uid || 'none'}`,
                        sort: {
                            unit: unitLabel,
                            project: line.projectName,
                            broker: line.brokerName,
                            agreement: line.agreementNumber,
                            client: line.clientName,
                            feeEarned: e,
                            feePaid: p,
                            feeBalance: bal,
                        },
                        display: {
                            unit: unitLabel,
                            project: line.projectName,
                            broker: line.brokerName,
                            agreement: line.agreementNumber,
                            client: line.clientName,
                            feeEarned: e,
                            feePaid: p,
                            feeBalance: bal,
                        },
                    });
                }
            }
        }

        return out;
    }, [agreementLines, groupBy, units]);

    const sortedRows = useMemo(() => {
        const col = columns.find((c) => c.id === sortKey) ?? columns[0];
        const key = col?.id ?? 'group';
        const kind = col?.kind ?? 'text';
        return [...rawRows].sort((a, b) => compareCell(a.sort[key] ?? '', b.sort[key] ?? '', kind, sortDir));
    }, [rawRows, columns, sortKey, sortDir]);

    const summary = useMemo(() => {
        let earned = 0;
        let paid = 0;
        let balance = 0;
        const seenAgreements = new Set<string>();
        for (const line of agreementLines) {
            seenAgreements.add(line.agreementId);
            earned += line.feeEarned;
            paid += line.feePaid;
            balance += line.feeBalance;
        }
        return {
            uniqueAgreements: seenAgreements.size,
            unitRowCount: sortedRows.length,
            feeEarned: earned,
            feePaid: paid,
            feeBalance: balance,
        };
    }, [agreementLines, sortedRows.length]);

    const handleSort = useCallback((key: string) => {
        if (key === sortKey) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }, [sortKey]);

    useEffect(() => {
        const first = columns[0]?.id ?? 'group';
        setSortKey(first);
        setSortDir('asc');
    }, [groupBy, columns]);

    const fmtMoney = (n: number) => `${CURRENCY} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    const renderCell = (colId: string, v: string | number, kind: 'text' | 'num') => {
        if (kind === 'num') {
            const n = typeof v === 'number' ? v : parseFloat(String(v)) || 0;
            return (
                <td key={colId} className="px-3 py-2 text-right tabular-nums text-app-text">
                    {colId === 'agreements' ? String(Math.round(n)) : fmtMoney(n)}
                </td>
            );
        }
        return (
            <td key={colId} className="px-3 py-2 text-left text-app-text max-w-[220px] truncate" title={String(v)}>
                {String(v)}
            </td>
        );
    };

    return (
        <Card className="p-4 md:p-5 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-app-text">Broker fee by dimension</h3>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-app-muted">Group by</span>
                    <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value as BrokerFeeGroupBy)}
                        className="text-sm border border-app-border rounded-lg px-3 py-1.5 bg-app-input text-app-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                        aria-label="Group broker fees by"
                    >
                        <option value="project">Project</option>
                        <option value="broker">Broker</option>
                        <option value="unit">Unit</option>
                    </select>
                </div>
            </div>
            <p className="text-xs text-app-muted mb-3">
                Project selling rebates (per agreement). Cancelled agreements are excluded. Paid uses commission expenses linked to the agreement.
                {groupBy === 'unit' && ' Amounts are split equally across units on each agreement.'}
            </p>

            {sortedRows.length === 0 ? (
                <p className="text-sm text-app-muted py-6 text-center">No project broker fees to show.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-app-border">
                    <table className="min-w-full text-sm">
                        <thead className="bg-app-table-header border-b border-app-border">
                            <tr>
                                {columns.map((col) => (
                                    <th
                                        key={col.id}
                                        scope="col"
                                        className={`px-3 py-2.5 font-semibold text-app-muted select-none cursor-pointer hover:bg-app-toolbar/80 whitespace-nowrap ${
                                            col.kind === 'num' ? 'text-right' : 'text-left'
                                        }`}
                                        onClick={() => handleSort(col.id)}
                                    >
                                        {col.label}
                                        {sortKey === col.id && (
                                            <span className="ml-1 text-primary">{sortDir === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border">
                            {sortedRows.map((row) => (
                                <tr key={row.id} className="hover:bg-app-table-hover">
                                    {columns.map((col) => renderCell(col.id, row.display[col.id] ?? '', col.kind))}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-app-toolbar/60 border-t-2 border-app-border font-semibold">
                            <tr>
                                {columns.map((col, idx) => {
                                    if (idx === 0) {
                                        return (
                                            <td key={col.id} className="px-3 py-2.5 text-left text-app-text">
                                                Total (
                                                {groupBy === 'unit'
                                                    ? `${summary.unitRowCount} rows`
                                                    : `${summary.uniqueAgreements} agreements`}
                                                )
                                            </td>
                                        );
                                    }
                                    if (col.id === 'agreements' && (groupBy === 'project' || groupBy === 'broker')) {
                                        return (
                                            <td key={col.id} className="px-3 py-2.5 text-right tabular-nums">
                                                {rawRows.reduce((s, r) => s + (Number(r.display.agreements) || 0), 0)}
                                            </td>
                                        );
                                    }
                                    if (col.id === 'agreements' || col.id === 'unit' || col.id === 'project' || col.id === 'broker' || col.id === 'agreement' || col.id === 'client') {
                                        return (
                                            <td key={col.id} className="px-3 py-2.5 text-app-muted">
                                                —
                                            </td>
                                        );
                                    }
                                    if (col.kind === 'num') {
                                        const v =
                                            col.id === 'feeEarned'
                                                ? summary.feeEarned
                                                : col.id === 'feePaid'
                                                  ? summary.feePaid
                                                  : summary.feeBalance;
                                        return (
                                            <td key={col.id} className="px-3 py-2.5 text-right tabular-nums text-app-text">
                                                {fmtMoney(v)}
                                            </td>
                                        );
                                    }
                                    return <td key={col.id} className="px-3 py-2.5" />;
                                })}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </Card>
    );
};

export default BrokerProjectFeeDimensionReport;
