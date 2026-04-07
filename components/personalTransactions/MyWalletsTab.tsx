import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { getPersonalBalancesByAccount } from './personalTransactionsService';
import { CURRENCY } from '../../constants';
import { isLocalOnlyMode } from '../../config/apiUrl';

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '' : '-';
  const sym = CURRENCY === 'PKR' ? 'Rs ' : '$';
  return `${sign}${sym}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MyWalletsTab: React.FC = () => {
  const { state } = useAppContext();

  const accountIdToName = useMemo(() => {
    const map = new Map<string, string>();
    state.accounts.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [state.accounts]);

  const balancesByAccount = getPersonalBalancesByAccount(
    !isLocalOnlyMode() ? state.personalTransactions : undefined
  );

  const rows = useMemo(
    () =>
      balancesByAccount.map(({ accountId, balance }) => ({
        accountId,
        accountName: accountIdToName.get(accountId) || accountId,
        balance,
      })),
    [balancesByAccount, accountIdToName]
  );

  const netBalance = useMemo(
    () => rows.reduce((sum, r) => sum + r.balance, 0),
    [rows]
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My wallets</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Bank account balances from personal transactions only.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden max-w-2xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Account</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-8 text-center text-gray-500">
                  No personal transactions yet. Add transactions in the Transactions tab to see balances here.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.accountId}
                  className="border-b border-gray-100 hover:bg-gray-50/50"
                >
                  <td className="py-3 px-4 font-medium text-gray-900">
                    {row.accountName}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-medium ${
                      row.balance >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {formatAmount(row.balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="py-3 px-4 font-semibold text-gray-900">Net balance</td>
                <td
                  className={`py-3 px-4 text-right font-semibold ${
                    netBalance >= 0 ? 'text-green-600' : 'text-red-600'
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
