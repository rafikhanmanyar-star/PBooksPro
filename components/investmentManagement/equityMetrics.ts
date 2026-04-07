import { AppState, AccountType, TransactionType } from '../../types';
import { getEquityImpactsForBalances } from './equityLedgerClassification';

export const EQUITY_BALANCE_EPS = 1e-2;
export const roundEquityBalance = (x: number): number => (Math.abs(x) < EQUITY_BALANCE_EPS ? 0 : x);

/** Same equity impact logic as ProjectEquityManagement (tree balances). */
export function computeEquityBalances(state: AppState) {
    const equityAccounts = state.accounts.filter((a) => a.type === AccountType.EQUITY);
    const projBal: Record<string, number> = {};
    const invTotalBal: Record<string, number> = {};
    const invProjBal: Record<string, Record<string, number>> = {};

    state.projects.forEach((p) => {
        projBal[p.id] = 0;
    });
    equityAccounts.forEach((a) => {
        invTotalBal[a.id] = 0;
    });

    const txs = state.transactions.filter(
        (tx) =>
            tx.type === TransactionType.TRANSFER ||
            (tx.type === TransactionType.INCOME && equityAccounts.some((e) => e.id === tx.accountId))
    );

    txs.forEach((tx) => {
        const impacts = getEquityImpactsForBalances(tx, equityAccounts);

        impacts.forEach(({ investorId, amount, projectId }) => {
            invTotalBal[investorId] = (invTotalBal[investorId] || 0) + amount;

            if (projectId !== 'unassigned') {
                projBal[projectId] = (projBal[projectId] || 0) + amount;
                if (!invProjBal[projectId]) invProjBal[projectId] = {};
                invProjBal[projectId][investorId] = (invProjBal[projectId][investorId] || 0) + amount;
            }
        });
    });

    return { projBal, invTotalBal, invProjBal, equityAccounts };
}

export function getInvestorEquityAccounts(state: AppState) {
    return state.accounts.filter((a) => a.type === AccountType.EQUITY && a.name !== 'Owner Equity');
}
