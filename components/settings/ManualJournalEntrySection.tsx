import React, { useMemo, useState, useCallback } from 'react';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Button from '../ui/Button';
import { useAppContext } from '../../context/AppContext';
import type { Account } from '../../types';
import { AccountType } from '../../types';
import { JournalEntryPreview } from '../financial/JournalEntryPreview';
import type { JournalLineInput } from '../../services/financialEngine/types';
import { createJournalEntry } from '../../services/financialEngine/journalEngine';
import { validateBalanced } from '../../services/financialEngine/validation';
import { useNotification } from '../../context/NotificationContext';
import { todayLocalYyyyMmDd, toLocalDateString } from '../../utils/dateUtils';

function flattenAccounts(accounts: Account[]): Account[] {
  const out: Account[] = [];
  const walk = (list: Account[]) => {
    for (const a of list) {
      out.push(a);
      if (a.children?.length) walk(a.children);
    }
  };
  walk(accounts);
  return out;
}

type LineDraft = {
  key: string;
  accountId: string;
  side: 'debit' | 'credit';
  amountStr: string;
};

function toJournalLines(drafts: LineDraft[]): JournalLineInput[] {
  return drafts
    .filter((d) => d.accountId && parseFloat(d.amountStr) > 0)
    .map((d) => {
      const amt = Math.round(parseFloat(d.amountStr) * 100) / 100;
      return d.side === 'debit'
        ? { accountId: d.accountId, debitAmount: amt, creditAmount: 0 }
        : { accountId: d.accountId, debitAmount: 0, creditAmount: amt };
    });
}

/**
 * Local-only: posts immutable double-entry journals via the financial engine.
 */
const ManualJournalEntrySection: React.FC = () => {
  const { state } = useAppContext();
  const { showToast, showAlert } = useNotification();

  const flatAccounts = useMemo(() => flattenAccounts(state.accounts), [state.accounts]);
  const accountNameById = useMemo(() => {
    const m: Record<string, string> = {};
    flatAccounts.forEach((a) => {
      m[a.id] = a.name;
    });
    return m;
  }, [flatAccounts]);

  const [entryDate, setEntryDate] = useState(() => todayLocalYyyyMmDd());
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [
    { key: '1', accountId: '', side: 'debit', amountStr: '' },
    { key: '2', accountId: '', side: 'credit', amountStr: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const journalLines = useMemo(() => toJournalLines(lines), [lines]);

  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, accountId: '', side: 'debit', amountStr: '' },
    ]);
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)));
  }, []);

  const updateLine = useCallback((key: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);

  const handlePost = async () => {
    const err = validateBalanced(journalLines);
    if (err) {
      await showAlert(err, { title: 'Cannot post' });
      return;
    }
    setSubmitting(true);
    try {
      const { journalEntryId } = await createJournalEntry({
        tenantId:
          typeof window !== 'undefined' ? localStorage.getItem('tenant_id')?.trim() || 'local' : 'local',
        entryDate,
        reference: reference.trim() || 'Manual',
        description: description.trim() || undefined,
        sourceModule: 'settings_manual',
        sourceId: undefined,
        createdBy: state.currentUser?.id ?? null,
        lines: journalLines,
      });
      showToast(`Journal posted: ${journalEntryId}`, 'success');
      setReference('');
      setDescription('');
      setLines([
        { key: '1', accountId: '', side: 'debit', amountStr: '' },
        { key: '2', accountId: '', side: 'credit', amountStr: '' },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await showAlert(msg, { title: 'Post failed' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 space-y-6">
      <div>
        <p className="text-slate-600 text-sm">
          Post a balanced double-entry journal to the general ledger. Entries are immutable; mistakes are corrected with a reversal, not an edit.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DatePicker label="Entry date" value={entryDate} onChange={(d) => setEntryDate(toLocalDateString(d))} />
        <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. INV-1001" />
      </div>
      <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional memo" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Lines</h3>
          <Button type="button" variant="secondary" className="text-sm" onClick={addLine}>
            Add line
          </Button>
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Account</th>
                <th className="text-left px-3 py-2">Side</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <select
                      className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-slate-800 bg-white"
                      aria-label={`Account for line ${line.key}`}
                      value={line.accountId}
                      onChange={(e) => updateLine(line.key, { accountId: e.target.value })}
                    >
                      <option value="">Select account…</option>
                      {flatAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type === AccountType.BANK ? 'Bank' : a.type})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="border border-slate-200 rounded-md px-2 py-1.5"
                      aria-label={`Debit or credit for line ${line.key}`}
                      value={line.side}
                      onChange={(e) => updateLine(line.key, { side: e.target.value as 'debit' | 'credit' })}
                    >
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      className="w-full max-w-[140px] ml-auto border border-slate-200 rounded-md px-2 py-1.5 tabular-nums text-right"
                      min={0}
                      step="0.01"
                      value={line.amountStr}
                      onChange={(e) => updateLine(line.key, { amountStr: e.target.value })}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-1 py-2">
                    {lines.length > 2 && (
                      <button
                        type="button"
                        className="text-rose-600 text-xs hover:underline"
                        onClick={() => removeLine(line.key)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <JournalEntryPreview
        lines={journalLines}
        accountNames={accountNameById}
        reference={reference}
        description={description}
        entryDate={entryDate}
        onConfirm={handlePost}
        confirmLabel={submitting ? 'Posting…' : 'Post journal'}
        disabled={submitting}
      />
    </div>
  );
};

export default ManualJournalEntrySection;
