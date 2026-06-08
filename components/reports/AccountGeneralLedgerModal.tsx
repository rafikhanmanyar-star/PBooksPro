import React, { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { getGeneralLedger, type GeneralLedgerRow } from '../../services/financialEngine/ledgerReports';

interface AccountGeneralLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  tenantId: string;
  fromDate: string;
  toDate: string;
}

function money(n: number): string {
  return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const AccountGeneralLedgerModal: React.FC<AccountGeneralLedgerModalProps> = ({
  isOpen,
  onClose,
  accountId,
  accountName,
  tenantId,
  fromDate,
  toDate,
}) => {
  const [rows, setRows] = useState<GeneralLedgerRow[]>([]);
  const [accountType, setAccountType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !accountId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getGeneralLedger(accountId, tenantId, {
          fromDate,
          toDate,
        });
        if (!cancelled) {
          setRows(data.rows);
          setAccountType(data.accountType);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accountId, tenantId, fromDate, toDate]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`General Ledger — ${accountName}`} size="xl">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {accountType} · {formatDate(fromDate)} – {formatDate(toDate)}
        </p>

        {loading && <p className="text-sm text-slate-500">Loading journal entries…</p>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-6">No journal activity for this account in the selected range.</p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[60vh] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                <tr className="text-left">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.is_brought_forward ? 'bf' : `${r.journal_entry_id}-${r.line_number}-${idx}`}
                    className={`border-t border-slate-100 dark:border-slate-800 ${
                      r.is_brought_forward ? 'bg-amber-50/60 dark:bg-amber-950/20 italic' : ''
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.is_brought_forward ? '—' : formatDate(r.entry_date)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.reference || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {r.description ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {r.debit_amount > 0 ? money(r.debit_amount) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {r.credit_amount > 0 ? money(r.credit_amount) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                      {money(r.running_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AccountGeneralLedgerModal;
