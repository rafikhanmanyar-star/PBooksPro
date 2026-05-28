import type { AppState } from '../../../types';
import type { ReservePolicy, WithdrawalValidationResult } from '../types/fundAvailability.types';
import { getDistributableFundsBreakdown } from '../services/investorFundAvailability.service';

const EPS = 0.005;

interface ProjectWithdrawalOutflowInput {
    state: AppState;
    projectId: string;
    amount: number;
    asOfYmd: string;
    reservePolicy: ReservePolicy;
    options?: { ignorePendingPayables?: boolean };
}

interface EditedWithdrawalOutflowInput {
    existingAmount: number;
    existingProjectId?: string;
    existingDate?: string;
    newAmount: number;
    newProjectId: string;
    asOfYmd: string;
}

function isOnOrBeforeAsOf(date: string | undefined, asOfYmd: string): boolean {
    if (!date) return false;
    const existing = new Date(date);
    const asOf = new Date(asOfYmd);
    asOf.setHours(23, 59, 59, 999);
    return existing <= asOf;
}

/**
 * Validates an investor cash withdrawal against **distributable funds** for a project
 * (available cash − reserves − payables). Use from ledger saves and payout flows.
 */
export function validateWithdrawal(
    state: AppState,
    projectId: string,
    amount: number,
    asOfYmd: string,
    reservePolicy: ReservePolicy,
    options?: { ignorePendingPayables?: boolean }
): WithdrawalValidationResult {
    const requestedAmount = Math.round(amount * 100) / 100;
    const b = getDistributableFundsBreakdown(state, projectId, asOfYmd, reservePolicy);
    const distributableFunds = options?.ignorePendingPayables
        ? Math.max(0, b.availableCash - b.reservedFunds)
        : b.distributableFunds;

    const messages: string[] = [];
    if (b.pendingPayables > EPS && !options?.ignorePendingPayables) {
        messages.push('Pending liabilities reduce distributable funds — ensure payables are funded before distributions.');
    }
    if (b.reservedFunds > EPS) {
        messages.push(
            b.reservePolicy.mode === 'percent'
                ? `Operating reserve policy: ${b.reservePolicy.percent}% of available cash is held back.`
                : `Operating reserve policy: ${b.reservePolicy.amount.toFixed(2)} fixed holdback.`
        );
    }
    if (requestedAmount > distributableFunds + EPS) {
        messages.push('Withdrawal exceeds available distributable funds.');
    }
    if (requestedAmount > b.availableCash + EPS) {
        messages.push('Withdrawal exceeds physical available cash for this project.');
    }

    const shortfall = Math.max(0, requestedAmount - distributableFunds);
    const ok = shortfall <= EPS;
    if (!ok && messages.length === (b.pendingPayables > EPS ? 1 : 0) + (b.reservedFunds > EPS ? 1 : 0)) {
        messages.push(
            `Shortfall: distributable ${distributableFunds.toFixed(2)} vs requested ${requestedAmount.toFixed(2)}.`
        );
    }

    return {
        ok,
        distributableFunds,
        requestedAmount,
        shortfall,
        messages,
        reservePolicy,
    };
}

export function validateProjectWithdrawalOutflow({
    state,
    projectId,
    amount,
    asOfYmd,
    reservePolicy,
    options,
}: ProjectWithdrawalOutflowInput): WithdrawalValidationResult {
    return validateWithdrawal(state, projectId, amount, asOfYmd, reservePolicy, options);
}

export function getAdditionalWithdrawalAmountToValidate({
    existingAmount,
    existingProjectId,
    existingDate,
    newAmount,
    newProjectId,
    asOfYmd,
}: EditedWithdrawalOutflowInput): number {
    const existingAlreadyInScope =
        existingProjectId === newProjectId && isOnOrBeforeAsOf(existingDate, asOfYmd);
    const coveredByExistingOutflow = existingAlreadyInScope ? existingAmount : 0;
    return Math.max(0, Math.round((newAmount - coveredByExistingOutflow) * 100) / 100);
}
