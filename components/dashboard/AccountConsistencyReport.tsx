import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { AccountType, type AccountConsistencySettings } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { formatRoundedNumber } from '../../utils/numberUtils';
import { computeBankAccountProjectBalances } from './bankAccountReportBalances';
import { isLocalOnlyMode } from '../../config/apiUrl';

const LEGACY_STORAGE_VERSION = 1;

function legacyStorageKey(tenantId: string): string {
    return `pbooks_account_consistency_v${LEGACY_STORAGE_VERSION}_${tenantId}`;
}

function parseAmountInput(raw: string): number | null {
    const t = raw.trim();
    if (t === '') return null;
    const normalized = t.replace(/,/g, '');
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : null;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
    if (!text) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch {
            return false;
        }
    }
}

const AccountConsistencyReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const tenantId =
        state.currentUser?.tenantId?.trim() ||
        (typeof window !== 'undefined' ? localStorage.getItem('tenant_id')?.trim() : null) ||
        'default';

    const persisted = state.accountConsistency ?? { actualByAccountId: {} };

    const balanceMap = useMemo(
        () =>
            computeBankAccountProjectBalances({
                accounts: state.accounts,
                transactions: state.transactions,
                bills: state.bills,
                invoices: state.invoices,
            }),
        [state.accounts, state.transactions, state.bills, state.invoices]
    );

    const rows = useMemo(() => {
        return state.accounts
            .filter(a => a.type === AccountType.BANK || a.type === AccountType.CASH)
            .map(a => {
                const row = balanceMap[a.id];
                const currentBalance = row?.totalBalance ?? 0;
                return {
                    accountId: a.id,
                    accountName: a.name,
                    currentBalance,
                };
            })
            .sort((a, b) => a.accountName.localeCompare(b.accountName));
    }, [state.accounts, balanceMap]);

    const bankCashAccountIdsKey = useMemo(
        () =>
            state.accounts
                .filter(a => a.type === AccountType.BANK || a.type === AccountType.CASH)
                .map(a => a.id)
                .sort()
                .join(','),
        [state.accounts]
    );

    const [actualInputs, setActualInputs] = useState<Record<string, string>>({});
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [copyMessage, setCopyMessage] = useState<string | null>(null);
    const copyMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const legacyMigratedRef = useRef(false);

    const showCopyFeedback = useCallback(() => {
        if (copyMsgTimerRef.current) clearTimeout(copyMsgTimerRef.current);
        setCopyMessage('Copied to clipboard');
        copyMsgTimerRef.current = setTimeout(() => {
            copyMsgTimerRef.current = null;
            setCopyMessage(null);
        }, 1600);
    }, []);

    const copyFigure = useCallback(
        async (displayText: string) => {
            const ok = await copyTextToClipboard(displayText);
            if (ok) showCopyFeedback();
        },
        [showCopyFeedback]
    );

    /** One-time: move browser-only localStorage into app state (then persisted to DB on save). */
    useEffect(() => {
        if (legacyMigratedRef.current) return;
        const hasDb =
            persisted.actualByAccountId &&
            Object.keys(persisted.actualByAccountId).some(
                k => persisted.actualByAccountId[k] !== undefined && persisted.actualByAccountId[k] !== null
            );
        if (hasDb) {
            legacyMigratedRef.current = true;
            return;
        }
        try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(legacyStorageKey(tenantId)) : null;
            if (!raw) {
                legacyMigratedRef.current = true;
                return;
            }
            const parsed = JSON.parse(raw) as { actualByAccountId?: Record<string, number | null>; savedAt?: string };
            if (parsed?.actualByAccountId && typeof parsed.actualByAccountId === 'object') {
                const payload: AccountConsistencySettings = {
                    actualByAccountId: parsed.actualByAccountId,
                    savedAt: parsed.savedAt,
                };
                dispatch({ type: 'UPDATE_ACCOUNT_CONSISTENCY', payload });
                try {
                    localStorage.removeItem(legacyStorageKey(tenantId));
                } catch {
                    /* ignore */
                }
            }
        } catch {
            /* ignore */
        }
        legacyMigratedRef.current = true;
    }, [tenantId, persisted.actualByAccountId, dispatch]);

    useEffect(() => {
        return () => {
            if (copyMsgTimerRef.current) clearTimeout(copyMsgTimerRef.current);
        };
    }, []);

    useEffect(() => {
        setSaveMessage(null);
        const ids = bankCashAccountIdsKey.split(',').filter(Boolean);
        const next: Record<string, string> = {};
        ids.forEach(id => {
            const saved = persisted.actualByAccountId?.[id];
            if (saved !== undefined && saved !== null && Number.isFinite(saved)) {
                next[id] = String(saved);
            } else {
                next[id] = '';
            }
        });
        setActualInputs(next);
    }, [bankCashAccountIdsKey, persisted.actualByAccountId, persisted.savedAt]);

    const setActualFor = useCallback((accountId: string, value: string) => {
        setActualInputs(prev => ({ ...prev, [accountId]: value }));
    }, []);

    const handleSave = useCallback(() => {
        const actualByAccountId: Record<string, number | null> = {};
        rows.forEach(r => {
            const parsed = parseAmountInput(actualInputs[r.accountId] ?? '');
            actualByAccountId[r.accountId] = parsed === null ? null : parsed;
        });
        const iso = new Date().toISOString();
        const payload: AccountConsistencySettings = {
            actualByAccountId,
            savedAt: iso,
        };
        dispatch({ type: 'UPDATE_ACCOUNT_CONSISTENCY', payload });
        setSaveMessage('Saved.');
        window.setTimeout(() => setSaveMessage(null), 2500);
    }, [rows, actualInputs, dispatch]);

    const savedAt = persisted.savedAt ?? null;

    const netSystem = useMemo(() => rows.reduce((s, r) => s + r.currentBalance, 0), [rows]);
    const netActualParsed = useMemo(() => {
        let sum = 0;
        let any = false;
        rows.forEach(r => {
            const p = parseAmountInput(actualInputs[r.accountId] ?? '');
            if (p !== null) {
                sum += p;
                any = true;
            }
        });
        return any ? sum : null;
    }, [rows, actualInputs]);

    const storageHint = isLocalOnlyMode()
        ? 'Amounts are saved in your local database with this company file.'
        : 'Amounts are saved to the server database for this tenant.';

    const numSelectable = 'select-text cursor-text';

    const inputActualClass =
        'w-full max-w-[160px] ml-auto block rounded-lg border border-app-border bg-app-surface-2 px-2 py-1.5 text-right text-app-text tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent/40 select-text';

    return (
        <Card className="overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                <div>
                    <h3 className="text-lg font-bold text-app-text">Account consistency</h3>
                    <p className="text-xs text-app-muted mt-1 max-w-2xl">
                        Compare the system balance (from your recorded transactions) with the actual balance from bank statements or cash counts.
                        Difference is system balance minus actual. Use this to spot missing or incorrect bills, invoices, or payments.
                        Select any figure to copy, or double-click a system/difference/summary amount to copy it. Actual amount fields support standard copy and paste (Ctrl+C / Ctrl+V).
                    </p>
                    <p className="text-[10px] text-app-muted mt-1">{storageHint}</p>
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-1 shrink-0">
                    <Button variant="primary" type="button" onClick={handleSave} className="text-sm">
                        Save amounts
                    </Button>
                    {savedAt && (
                        <span className={`text-[10px] text-app-muted ${numSelectable}`}>
                            Last saved: {new Date(savedAt).toLocaleString()}
                        </span>
                    )}
                    {saveMessage && <span className="text-xs text-ds-success">{saveMessage}</span>}
                    {copyMessage && <span className="text-xs text-app-muted">{copyMessage}</span>}
                </div>
            </div>

            <div className={`rounded-lg p-4 border mb-4 ${netSystem >= 0 ? 'bg-app-toolbar border-app-border' : 'bg-[color:var(--badge-unpaid-bg)] border-ds-danger/30'}`}>
                <div className="text-xs font-medium text-app-muted mb-1">Net balance (system, all accounts)</div>
                <div
                    className={`text-lg font-bold tabular-nums ${numSelectable} ${netSystem >= 0 ? 'text-app-text' : 'text-ds-danger'}`}
                    title="Select to copy, or double-click to copy this figure"
                    onDoubleClick={e => {
                        e.preventDefault();
                        void copyFigure(formatRoundedNumber(netSystem));
                    }}
                >
                    {formatRoundedNumber(netSystem)}
                </div>
                {netActualParsed !== null && (
                    <div className="text-xs text-app-muted mt-2">
                        Sum of entered actual amounts:{' '}
                        <span
                            className={`font-semibold text-app-text tabular-nums ${numSelectable}`}
                            title="Select to copy, or double-click to copy"
                            onDoubleClick={e => {
                                e.preventDefault();
                                void copyFigure(formatRoundedNumber(netActualParsed));
                            }}
                        >
                            {formatRoundedNumber(netActualParsed)}
                        </span>
                    </div>
                )}
            </div>

            {rows.length === 0 ? (
                <div className="py-8 text-center text-app-muted bg-app-toolbar rounded-lg border border-app-border">
                    No bank or cash accounts. Add accounts in Settings.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-app-border">
                    <table className="w-full min-w-[640px] divide-y divide-app-border text-sm">
                        <thead className="bg-app-table-header">
                            <tr>
                                <th className="px-3 py-3 text-left font-semibold text-app-muted">Account</th>
                                <th className="px-3 py-3 text-right font-semibold text-app-muted">Current balance (system)</th>
                                <th className="px-3 py-3 text-right font-semibold text-app-muted">Actual amount</th>
                                <th
                                    className="px-3 py-3 text-right font-semibold text-app-muted"
                                    title="System balance minus actual amount"
                                >
                                    Difference
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border bg-app-card">
                            {rows.map(r => {
                                const actual = parseAmountInput(actualInputs[r.accountId] ?? '');
                                const diff = actual === null ? null : r.currentBalance - actual;
                                return (
                                    <tr key={r.accountId} className="hover:bg-app-toolbar/80 transition-colors duration-ds">
                                        <td className={`px-3 py-3 font-medium text-app-text ${numSelectable}`}>{r.accountName}</td>
                                        <td
                                            className={`px-3 py-3 text-right tabular-nums ${numSelectable} ${
                                                r.currentBalance >= 0 ? 'text-app-text' : 'text-ds-danger'
                                            }`}
                                            title="Select to copy, or double-click to copy this figure"
                                            onDoubleClick={e => {
                                                e.preventDefault();
                                                void copyFigure(formatRoundedNumber(r.currentBalance));
                                            }}
                                        >
                                            {formatRoundedNumber(r.currentBalance)}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                spellCheck={false}
                                                placeholder="—"
                                                aria-label={`Actual amount for ${r.accountName}; copy and paste supported`}
                                                value={actualInputs[r.accountId] ?? ''}
                                                onChange={e => setActualFor(r.accountId, e.target.value)}
                                                className={inputActualClass}
                                            />
                                        </td>
                                        <td
                                            className={`px-3 py-3 text-right font-medium tabular-nums ${numSelectable} ${
                                                diff === null || Math.abs(diff) < 0.005
                                                    ? 'text-app-muted'
                                                    : 'text-ds-danger font-semibold'
                                            }`}
                                            title={
                                                diff === null
                                                    ? undefined
                                                    : 'Select to copy, or double-click to copy this figure'
                                            }
                                            onDoubleClick={e => {
                                                if (diff === null || Math.abs(diff) < 0.005) return;
                                                e.preventDefault();
                                                void copyFigure(formatRoundedNumber(diff));
                                            }}
                                        >
                                            {diff === null ? <span className={numSelectable}>—</span> : formatRoundedNumber(diff)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};

export default AccountConsistencyReport;
