import { usePersonalFinanceState } from '../../hooks/useSelectiveState';
import React, { useMemo } from 'react';
import { getPersonalBalancesByAccount } from './personalTransactionsService';
import { CURRENCY } from '../../constants';

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '' : '-';
  const sym = CURRENCY === 'PKR' ? 'Rs ' : '$';
  return `${sign}${sym}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MyWalletsTab: React.FC = () => {
  const { accounts, transactions, personalTransactions } = usePersonalFinanceState();

  const accountIdToName = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [accounts]);

  const balancesByAccount = getPersonalBalancesByAccount(personalTransactions);

  const rows = useMemo(
    () =>
      balancesByAccount.map(({ accountId, balance }) => ({
        accountId,
        accountName: accountIdToName.get(accountId) || accountId,
        balance })),
    [balancesByAccount, accountIdToName]
  );

  const netBalance = useMemo(
    () => rows.reduce((sum, r) => sum + r.balance, 0),
    [rows]
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-app-text">My wallets</h1>
        <p className="text-sm text-app-muted mt-0.5">
          Bank account balances from personal transactions only.
        </p>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-card shadow-ds-card overflow-hidden max-w-2xl">
        <table className="w-full text-sm">
          <thead className="bg-app-table-header border-b border-app-border">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-app-muted">Account</th>
              <th className="text-right py-3 px-4 font-semibold text-app-muted">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-8 text-center text-app-muted">
                  No personal transactions yet. Add transactions in the Transactions tab to see balances here.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.accountId}
                  className="border-b border-app-border hover:bg-app-table-hover"
                >
                  <td className="py-3 px-4 font-medium text-app-text">
                    {row.accountName}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-medium ${
                      row.balance >= 0 ? 'text-ds-success' : 'text-ds-danger'
                    }`}
                  >
                    {formatAmount(row.balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-app-table-header border-t-2 border-app-border">
              <tr>
                <td className="py-3 px-4 font-semibold text-app-text">Net balance</td>
                <td
                  className={`py-3 px-4 text-right font-semibold ${
                    netBalance >= 0 ? 'text-ds-success' : 'text-ds-danger'
                  }`}
                >
                  {formatAmount(netBalance)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default MyWalletsTab;
