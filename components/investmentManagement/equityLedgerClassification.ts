/**
 * Classifies equity / investment ledger flows without relying on fragile description text.
 * Prefer transactions.subtype (EquityLedgerSubtype); fall back to legacy heuristics.
 */
import { Account, AccountType, EquityLedgerSubtype, Transaction, TransactionType } from '../../types';

export type EquityFlowKind =
    | 'investment'
    | 'profit_share'
    | 'withdrawal'
    | 'pm_fee_deposit'
    | 'equity_transfer_out'
    | 'equity_transfer_in'
    | 'equity_between_investors'
    | 'income_equity'
    | 'other';

export interface EquityFlowLeg {
    investorId: string;
    /** Signed change to this investor's project-scoped equity (matches legacy computeEquityBalances). */
    signedAmount: number;
    kind: EquityFlowKind;
}

function descLower(tx: Transaction): string {
    return (tx.description || '').toLowerCase();
}

function subtypeStr(tx: Transaction): string | undefined {
    const s = tx.subtype as string | undefined;
    return s && String(s).trim() !== '' ? String(s) : undefined;
}

/** Legacy balance rule: clearing→equity non-profit was treated as withdrawal (−amount) unless PM/profit path. */
function legacyNonEquityToEquityIsProfitLike(tx: Transaction): boolean {
    const d = descLower(tx);
    if (d.includes('pm fee')) return true;
    if (d.includes('equity move out')) return false;
    if (d.includes('capital payout')) return false;
    return d.includes('profit');
}

function legacyLooksLikePmFee(tx: Transaction): boolean {
    const d = descLower(tx);
    return d.includes('pm fee') || d.includes('pm fee equity');
}

function legacyLooksLikeEquityMoveOut(tx: Transaction): boolean {
    return descLower(tx).includes('equity move out');
}

function legacyLooksLikeEquityMoveIn(tx: Transaction): boolean {
    return descLower(tx).includes('equity move in');
}

function legacyLooksLikeCapitalPayout(tx: Transaction): boolean {
    return descLower(tx).includes('capital payout');
}

/**
 * Map a single transaction to one or more equity legs (for per-investor balance / ledger rows).
 */
export function getEquityFlowLegs(tx: Transaction, equityAccounts: Account[]): EquityFlowLeg[] {
    const eqIds = new Set(equityAccounts.filter((a) => a.type === AccountType.EQUITY).map((a) => a.id));
    const st = subtypeStr(tx);

    if (tx.type === TransactionType.INCOME && tx.accountId && eqIds.has(tx.accountId)) {
        return [{ investorId: tx.accountId, signedAmount: tx.amount, kind: 'income_equity' }];
    }

    if (tx.type !== TransactionType.TRANSFER) return [];

    const fromEq = tx.fromAccountId && eqIds.has(tx.fromAccountId) ? tx.fromAccountId : null;
    const toEq = tx.toAccountId && eqIds.has(tx.toAccountId) ? tx.toAccountId : null;

    if (fromEq && !toEq) {
        const kind: EquityFlowKind =
            st === EquityLedgerSubtype.MOVE_IN || legacyLooksLikeEquityMoveIn(tx)
                ? 'equity_transfer_in'
                : 'investment';
        return [{ investorId: fromEq, signedAmount: tx.amount, kind }];
    }

    if (!fromEq && toEq) {
        if (st === EquityLedgerSubtype.PROFIT_SHARE || st === EquityLedgerSubtype.PM_FEE_EQUITY) {
            const kind = st === EquityLedgerSubtype.PM_FEE_EQUITY ? 'pm_fee_deposit' : 'profit_share';
            return [{ investorId: toEq, signedAmount: tx.amount, kind }];
        }
        if (st === EquityLedgerSubtype.MOVE_OUT || legacyLooksLikeEquityMoveOut(tx)) {
            return [{ investorId: toEq, signedAmount: -tx.amount, kind: 'equity_transfer_out' }];
        }
        if (st === EquityLedgerSubtype.CAPITAL_PAYOUT || legacyLooksLikeCapitalPayout(tx)) {
            return [{ investorId: toEq, signedAmount: -tx.amount, kind: 'withdrawal' }];
        }
        if (st === EquityLedgerSubtype.WITHDRAWAL) {
            return [{ investorId: toEq, signedAmount: -tx.amount, kind: 'withdrawal' }];
        }
        if (legacyLooksLikePmFee(tx)) {
            return [{ investorId: toEq, signedAmount: tx.amount, kind: 'pm_fee_deposit' }];
        }
        if (legacyNonEquityToEquityIsProfitLike(tx)) {
            return [{ investorId: toEq, signedAmount: tx.amount, kind: 'profit_share' }];
        }
        return [{ investorId: toEq, signedAmount: -tx.amount, kind: 'withdrawal' }];
    }

    if (fromEq && toEq) {
        if (fromEq === toEq) {
            return [{ investorId: fromEq, signedAmount: 0, kind: 'other' }];
        }
        if (st === EquityLedgerSubtype.EQUITY_TRANSFER_BETWEEN) {
            return [
                { investorId: fromEq, signedAmount: -tx.amount, kind: 'equity_between_investors' },
                { investorId: toEq, signedAmount: tx.amount, kind: 'equity_between_investors' },
            ];
        }
        return [
            { investorId: fromEq, signedAmount: -tx.amount, kind: 'equity_transfer_out' },
            { investorId: toEq, signedAmount: tx.amount, kind: 'equity_transfer_in' },
        ];
    }

    return [];
}

/**
 * Impact for project totals (replaces inline logic in computeEquityBalances).
 */
export function getEquityImpactsForBalances(
    tx: Transaction,
    equityAccounts: Account[]
): { investorId: string; amount: number; projectId: string }[] {
    const pId = tx.projectId || 'unassigned';
    const legs = getEquityFlowLegs(tx, equityAccounts);
    return legs.map((L) => ({ investorId: L.investorId, amount: L.signedAmount, projectId: pId }));
}

/** UI labels for ledger table (matches prior ProjectEquityManagement styling). */
export function presentationForEquityLeg(kind: EquityFlowKind): { paymentType: string; paymentTypeColor: string } {
    switch (kind) {
        case 'profit_share':
        case 'income_equity':
            return { paymentType: 'Profit Share', paymentTypeColor: 'text-emerald-600' };
        case 'investment':
            return { paymentType: 'Investment', paymentTypeColor: 'text-blue-600' };
        case 'withdrawal':
            return { paymentType: 'Withdrawal', paymentTypeColor: 'text-rose-600' };
        case 'pm_fee_deposit':
            return { paymentType: 'PM Fee Deposit', paymentTypeColor: 'text-emerald-600' };
        case 'equity_transfer_out':
        case 'equity_transfer_in':
        case 'equity_between_investors':
            return { paymentType: 'Equity Transfer', paymentTypeColor: 'text-slate-500' };
        default:
            return { paymentType: 'Transfer', paymentTypeColor: 'text-slate-600' };
    }
}

/** Totals for Inv. Management ledger summary cards (aligned with getEquityFlowLegs kinds). */
export interface EquityLedgerSummaryTotals {
    totalPrincipal: number;
    totalProfit: number;
    totalEquityMovedIn: number;
    totalEquityMovedOut: number;
}

/**
 * Aggregates principal, profit, and gross equity move-in/out for the given transactions.
 * When `staffInvestorId` is set, only legs for that investor are counted (same as ledger staff filter).
 */
export function computeEquityLedgerSummaryTotals(
    txs: Transaction[],
    equityAccounts: Account[],
    staffInvestorId: string | null,
): EquityLedgerSummaryTotals {
    let totalPrincipal = 0;
    let totalProfit = 0;
    let totalEquityMovedIn = 0;
    let totalEquityMovedOut = 0;

    for (const tx of txs) {
        let legs = getEquityFlowLegs(tx, equityAccounts);
        if (staffInvestorId) {
            legs = legs.filter((l) => l.investorId === staffInvestorId);
        }
        const mag = Math.round(tx.amount / 100) * 100;
        for (const leg of legs) {
            const signedDelta = leg.signedAmount >= 0 ? mag : -mag;
            switch (leg.kind) {
                case 'investment':
                    totalPrincipal += mag;
                    break;
                case 'profit_share':
                case 'pm_fee_deposit':
                case 'income_equity':
                    totalProfit += mag;
                    break;
                case 'equity_transfer_in':
                    totalEquityMovedIn += mag;
                    break;
                case 'equity_transfer_out':
                    totalEquityMovedOut += mag;
                    break;
                case 'equity_between_investors':
                    if (signedDelta > 0) totalEquityMovedIn += mag;
                    else totalEquityMovedOut += mag;
                    break;
                default:
                    break;
            }
        }
    }

    return {
        totalPrincipal,
        totalProfit,
        totalEquityMovedIn,
        totalEquityMovedOut,
    };
}
