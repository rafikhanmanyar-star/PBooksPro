import { AccountType, AppState, TransactionType } from '../../types';

type InvestorMapEntry = { name: string; invested: number; withdrawn: number; profit: number };

/**
 * Per-investor principal, withdrawals, and profit through `asOf`, optionally scoped to one `projectId`.
 * Same rules as Investor Distribution (legacy clearing / description heuristics).
 */
export function accumulateInvestorMapForProject(
    state: AppState,
    asOf: Date,
    projectId: string | 'all'
): Record<string, InvestorMapEntry> {
    const equityAccounts = state.accounts.filter((a) => a.type === AccountType.EQUITY);
    const equityAccountIds = new Set(equityAccounts.map((a) => a.id));
    const investorMap: Record<string, InvestorMapEntry> = {};

    equityAccounts.forEach((a) => {
        investorMap[a.id] = { name: a.name, invested: 0, withdrawn: 0, profit: 0 };
    });

    state.transactions.forEach((tx) => {
        const txDate = new Date(tx.date);
        if (txDate > asOf) return;

        if (projectId !== 'all' && tx.projectId !== projectId) return;

        const fromEquity = tx.fromAccountId && equityAccountIds.has(tx.fromAccountId);
        const toEquity = tx.toAccountId && equityAccountIds.has(tx.toAccountId);

        const fromAccount = state.accounts.find((a) => a.id === tx.fromAccountId);
        const isFromClearing = fromAccount?.name === 'Internal Clearing';
        const isDivestment = tx.description && tx.description.includes('Equity Move out');
        const isPMFeeTransfer =
            tx.description?.toLowerCase().includes('pm fee') || tx.description?.toLowerCase().includes('pm fee equity');

        if (tx.type === TransactionType.TRANSFER) {
            if (fromEquity && !toEquity && investorMap[tx.fromAccountId!]) {
                investorMap[tx.fromAccountId!].invested += tx.amount;
            }

            if (toEquity && !fromEquity && investorMap[tx.toAccountId!]) {
                if (isFromClearing && isPMFeeTransfer) {
                    investorMap[tx.toAccountId!].invested += tx.amount;
                } else if (isFromClearing && !isDivestment) {
                    investorMap[tx.toAccountId!].profit += tx.amount;
                } else {
                    investorMap[tx.toAccountId!].withdrawn += tx.amount;
                }
            }
        }

        if (tx.type === TransactionType.INCOME && tx.accountId && equityAccountIds.has(tx.accountId)) {
            if (investorMap[tx.accountId]) {
                investorMap[tx.accountId].profit += tx.amount;
            }
        }
    });

    return investorMap;
}
