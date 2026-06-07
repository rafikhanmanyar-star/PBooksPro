import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import React, { useEffect, useMemo, useState } from 'react';
import { Vendor, Account, AccountType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { contractorApi } from '../../services/api/contractorApi';
import { apiClient, formatApiErrorMessage } from '../../services/api/client';
import { normalizeAccountFromApi } from '../../services/api/appStateApi';
import { toLocalDateString } from '../../utils/dateUtils';

/** Raw chart row (Settings / GET /accounts); keep DB `type` for filtering — normalizeAccountFromApi maps unknown types → Asset. */
type AccountJsonRow = Record<string, unknown>;

function accountRowDbType(row: AccountJsonRow): string {
    const t = row.type ?? row.Type;
    return String(t ?? '').trim();
}

/**
 * True when the chart row is bank/cash style (correct posting side for typical advances).
 * Used to sort pay-from (liquidity first) and to keep bank lines out of the prepaid-asset picker.
 */
function isPayFromLiquidityRow(row: AccountJsonRow, normalized: Account): boolean {
    if (normalized.name === 'Internal Clearing') return false;
    if (normalized.isActive === false) return false;
    const rawType = accountRowDbType(row);
    const ru = rawType.toUpperCase();
    if (ru === 'BANK' || ru === 'CASH') return true;
    const rl = rawType.toLowerCase();
    if (rl === 'bank' || rl === 'cash') return true;
    if (normalized.type === AccountType.BANK || normalized.type === AccountType.CASH) return true;
    const gk = String(normalized.bsGroupKey ?? row.bsGroupKey ?? row.bs_group_key ?? '')
        .toLowerCase()
        .trim();
    if (gk === 'bank_accounts' || gk === 'cash_equivalents') return true;
    return false;
}

/** Pay-from lists the full Chart of Accounts except internal system clearing (user-supplied banks may be mis-typed as Asset). */
function isSelectablePayFromAccount(normalized: Account): boolean {
    if (normalized.name === 'Internal Clearing') return false;
    return !accountIsInactiveForPosting(normalized);
}

function accountIsInactiveForPosting(acc: Account): boolean {
    return acc.isActive === false;
}

interface RecordSupplierAdvanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    vendor: Vendor;
    /** When set (e.g. project bills sidebar), pre-selects this project on the form. */
    defaultProjectId?: string | null;
}

/**
 * PostgreSQL API: POST /contractor/advance — Dr prepaid asset, Cr the account you select (usually bank/cash).
 * Same contractor_contact_id must be used later when settling vendor bills against advances.
 */
const RecordSupplierAdvanceModal: React.FC<RecordSupplierAdvanceModalProps> = ({
    isOpen,
    onClose,
    vendor,
    defaultProjectId,
}) => {
    const state = useFinancialReportAppState();
    const { accounts, projects, bills, defaultProjectId: savedDefaultProjectId } = state;
    const { showToast, showAlert } = useNotification();

    const [advanceDate, setAdvanceDate] = useState(toLocalDateString(new Date()));
    const [amountStr, setAmountStr] = useState('');
    const [cashAccountId, setCashAccountId] = useState('');
    const [advanceAssetAccountId, setAdvanceAssetAccountId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    /** Raw rows from GET /accounts (do not pre-normalize — we need DB type string for pay-from detection). */
    const [fetchedAccountRows, setFetchedAccountRows] = useState<AccountJsonRow[]>([]);
    const [accountsLoadError, setAccountsLoadError] = useState<string | null>(null);

    /** Merged chart: AppContext + fresh API list (by id) so nothing is dropped when one source is partial. */
    const chartAccountRows = useMemo((): AccountJsonRow[] => {
        if (isLocalOnlyMode()) {
            return accounts.map((a) => ({ ...(a as unknown as AccountJsonRow) }));
        }
        const byId = new Map<string, AccountJsonRow>();
        for (const a of accounts) {
            const id = String(a.id ?? '').trim();
            if (id) byId.set(id, { ...(a as unknown as AccountJsonRow) });
        }
        for (const r of fetchedAccountRows) {
            const id = String(r.id ?? '').trim();
            if (id) byId.set(id, { ...r });
        }
        return Array.from(byId.values());
    }, [accounts, fetchedAccountRows]);

    /** Every active chart line (Settings → Chart of Accounts), so mis-classified banks (e.g. HBL as Asset) still appear. */
    const payFromAccounts = useMemo(() => {
        const paired = chartAccountRows.map((raw) => ({ raw, n: normalizeAccountFromApi(raw) }));
        const rows = paired
            .filter(({ n }) => isSelectablePayFromAccount(n))
            .sort((a, b) => {
                const la = isPayFromLiquidityRow(a.raw, a.n) ? 0 : 1;
                const lb = isPayFromLiquidityRow(b.raw, b.n) ? 0 : 1;
                if (la !== lb) return la - lb;
                return (a.n.name || '').localeCompare(b.n.name || '', undefined, { sensitivity: 'base' });
            })
            .map(({ n }) => n);
        const seen = new Set<string>();
        return rows.filter((a) => {
            const id = String(a.id ?? '').trim();
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }, [chartAccountRows]);

    const payFromComboItems = useMemo(
        () =>
            payFromAccounts.map((a) => {
                const code = (a.accountCode || '').trim();
                return {
                    id: String(a.id ?? '').trim(),
                    name: code ? `${code} — ${a.name}` : a.name,
                };
            }),
        [payFromAccounts]
    );

    const assetAccounts = useMemo(() => {
        return chartAccountRows
            .map((raw) => ({ raw, n: normalizeAccountFromApi(raw) }))
            .filter(
                ({ raw, n }) =>
                    n.name !== 'Internal Clearing' &&
                    !accountIsInactiveForPosting(n) &&
                    n.type === AccountType.ASSET &&
                    !isPayFromLiquidityRow(raw, n)
            )
            .map(({ n }) => n)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    }, [chartAccountRows]);

    const assetComboItems = useMemo(
        () =>
            assetAccounts.map((a) => {
                const code = (a.accountCode || '').trim();
                return { id: String(a.id ?? '').trim(), name: code ? `${code} — ${a.name}` : a.name };
            }),
        [assetAccounts]
    );

    const projectItems = useMemo(
        () =>
            [{ id: '', name: '(No project)' }].concat(
                projects.map((p) => ({ id: p.id, name: p.name || p.id }))
            ),
        [projects]
    );

    useEffect(() => {
        if (!isOpen) return;
        setAdvanceDate(toLocalDateString(new Date()));
        setAmountStr('');
        setReference('');
        setDescription('');
        setProjectId((defaultProjectId ?? '').trim());
        setSubmitting(false);
        setAccountsLoadError(null);

        if (!isLocalOnlyMode()) {
            let cancelled = false;
            void apiClient
                .get<unknown[]>('/accounts')
                .then((rows) => {
                    if (cancelled) return;
                    if (!Array.isArray(rows)) {
                        setFetchedAccountRows([]);
                        setAccountsLoadError('Could not load chart of accounts.');
                        return;
                    }
                    setFetchedAccountRows(rows as AccountJsonRow[]);
                })
                .catch(() => {
                    if (cancelled) return;
                    setFetchedAccountRows([]);
                    setAccountsLoadError('Failed to load chart of accounts. Check your connection and try again.');
                });
            return () => {
                cancelled = true;
            };
        }
        setFetchedAccountRows([]);
    }, [isOpen, vendor.id, defaultProjectId]);

    useEffect(() => {
        if (!isOpen) return;
        const firstCash = payFromAccounts.find((a) => (a.name || '').toLowerCase() === 'cash') ?? payFromAccounts[0];
        setCashAccountId(String(firstCash?.id ?? '').trim());
        const preferredAsset =
            assetAccounts.find((a) => /prepaid|advance|supplier|contractor|deposit/i.test(a.name || '')) ||
            assetAccounts[0];
        setAdvanceAssetAccountId(String(preferredAsset?.id ?? '').trim());
    }, [isOpen, payFromAccounts, assetAccounts]);

    const handleSubmit = async () => {
        if (isLocalOnlyMode()) {
            await showAlert('Recording supplier advances requires the PostgreSQL API (not offline local DB mode).');
            return;
        }
        const amt = parseFloat(amountStr);
        if (!Number.isFinite(amt) || amt <= 0) {
            await showAlert(`Enter a valid advance amount (${CURRENCY}).`);
            return;
        }
        if (!cashAccountId.trim()) {
            await showAlert('Select the account the payment leaves from (usually bank or cash).');
            return;
        }
        if (!advanceAssetAccountId.trim()) {
            await showAlert('Select a prepaid asset account (e.g. supplier advance).');
            return;
        }
        try {
            setSubmitting(true);
            await contractorApi.createSupplierAdvance({
                contractorContactId: vendor.id.trim(),
                advanceDate: advanceDate.trim(),
                amount: amt,
                cashAccountId: cashAccountId.trim(),
                advanceAssetAccountId: advanceAssetAccountId.trim(),
                projectId: projectId.trim() || null,
                reference: reference.trim() || null,
                description:
                    description.trim() ||
                    `Supplier advance — ${vendor.name || vendor.id}`,
            });
            showToast(`Advance recorded for ${vendor.name}. Use Record Payment to allocate it to bills when due.`, 'success');
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent<{ vendorId: string }>('pbooks:supplier-advance-recorded', {
                        detail: { vendorId: vendor.id.trim() },
                    })
                );
            }
            onClose();
        } catch (e) {
            await showAlert(formatApiErrorMessage(e));
        } finally {
            setSubmitting(false);
        }
    };

    const localBlocked = isLocalOnlyMode();

    return (
        <Modal isOpen={isOpen} onClose={() => !submitting && onClose()} title={`Record supplier advance — ${vendor.name}`} size="lg">
            <div className="space-y-4">
                {localBlocked ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Offline / local-database mode cannot post supplier advances. Use the LAN or hosted client connected to your API server.
                    </div>
                ) : (
                    <p className="text-sm text-slate-600">
                        Money moves out of the account you select (usually <strong className="text-slate-800">bank or cash</strong> from your chart)
                        and increases a <strong className="text-slate-800">prepaid asset</strong>. Later, use{' '}
                        <strong className="text-slate-800">Record Payment</strong> on this vendor so unpaid bills absorb this balance (FIFO)
                        plus any bank remainder.
                    </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        id="supplier-advance-amount"
                        name="supplier-advance-amount"
                        label={`Advance amount (${CURRENCY})`}
                        type="number"
                        value={amountStr}
                        onChange={(e) => setAmountStr(e.target.value)}
                        placeholder="0.00"
                        required
                        disabled={localBlocked || submitting}
                    />
                    <DatePicker
                        id="supplier-advance-date"
                        name="supplier-advance-date"
                        label="Advance date"
                        value={advanceDate}
                        onChange={(d) => setAdvanceDate(toLocalDateString(d))}
                        required
                        disabled={localBlocked || submitting}
                    />
                    <ComboBox
                        id="supplier-advance-pay-from"
                        name="supplier-advance-pay-from"
                        label="Pay from (Chart of Accounts — all accounts)"
                        items={payFromComboItems}
                        selectedId={cashAccountId}
                        onSelect={(item) => setCashAccountId(item?.id || '')}
                        placeholder="Search or select an account (e.g. HBL, Cash)"
                        required
                        disabled={localBlocked || submitting || payFromAccounts.length === 0}
                        entityType="account"
                        allowAddNew={false}
                    />
                    <ComboBox
                        id="supplier-advance-asset"
                        name="supplier-advance-asset"
                        label="Prepaid supplier advance (balance sheet)"
                        items={assetComboItems}
                        selectedId={advanceAssetAccountId}
                        onSelect={(item) => setAdvanceAssetAccountId(item?.id || '')}
                        placeholder="e.g. Prepaid advances / supplier deposit"
                        required
                        disabled={localBlocked || submitting || assetAccounts.length === 0}
                        entityType="account"
                        allowAddNew={false}
                    />
                    <div className="md:col-span-2">
                        <ComboBox
                            id="supplier-advance-project"
                            name="supplier-advance-project"
                            label="Project (optional)"
                            items={projectItems}
                            selectedId={projectId}
                            onSelect={(item) => setProjectId(item?.id || '')}
                            placeholder="Allocate journal lines to a project"
                            disabled={localBlocked || submitting}
                            entityType="project"
                            allowAddNew={false}
                        />
                    </div>
                    <Input
                        id="supplier-advance-reference"
                        name="supplier-advance-reference"
                        label="Reference"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="UTR / cheque no."
                        disabled={localBlocked || submitting}
                    />
                    <div />
                    <div className="md:col-span-2">
                        <Input
                            id="supplier-advance-description"
                            name="supplier-advance-description"
                            label="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={`Optional · defaults to “Supplier advance — ${vendor.name}”`}
                            disabled={localBlocked || submitting}
                        />
                    </div>
                </div>

                {accountsLoadError && !localBlocked && (
                    <p className="text-sm text-rose-700">{accountsLoadError}</p>
                )}
                {(payFromAccounts.length === 0 || assetAccounts.length === 0) && !localBlocked && (
                    <p className="text-sm text-rose-700">
                        {payFromAccounts.length === 0
                            ? 'No active accounts in Chart of Accounts. Add accounts under Settings → Financial → Chart of Accounts, or wait for data to load.'
                            : null}
                        {assetAccounts.length === 0
                            ? ' Add at least one active Asset account for prepaid supplier advances.'
                            : null}
                    </p>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                    <Button variant="secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSubmit()}
                        disabled={
                            submitting ||
                            localBlocked ||
                            !amountStr.trim() ||
                            payFromAccounts.length === 0 ||
                            assetAccounts.length === 0
                        }
                    >
                        {submitting ? 'Saving…' : 'Record advance'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default RecordSupplierAdvanceModal;
