import React, { useMemo, useState, useCallback, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAppContext } from '../../context/AppContext';
import { AccountType } from '../../types';
import { CURRENCY } from '../../constants';
import { getPersonalIncomeCategories, getPersonalExpenseCategories } from './personalCategoriesService';
import { bulkImportPersonalTransactions, listPersonalTransactions } from './personalTransactionsService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import {
  parseExcelPaste,
  type ParsedPasteLine,
} from './importPaste/personalTransactionImportPaste';
import {
  validateImportRows,
  rowImportable,
  type ImportPreviewRow,
  type ValidateImportContext,
} from './importPaste/personalTransactionImportValidate';

const PREVIEW_LIMIT = 500;
const PLACEHOLDER = `Date | Account | Category | Note | PKR | Type

Example (tab-separated from Excel):
2024-01-15\tMain Bank\tFood\tLunch\t500\tExpense`;

export interface ImportSummary {
  totalRows: number;
  imported: number;
  skippedErrors: number;
  warningsInImported: number;
}

interface ImportPersonalTransactionsPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (summary: ImportSummary) => void;
  dataRevision: number;
}

const ImportPersonalTransactionsPasteModal: React.FC<ImportPersonalTransactionsPasteModalProps> = ({
  isOpen,
  onClose,
  onImported,
  dataRevision,
}) => {
  const { state } = useAppContext();
  const [pasteText, setPasteText] = useState('');
  const [parsedLines, setParsedLines] = useState<ParsedPasteLine[]>([]);
  const [hasHeader, setHasHeader] = useState(false);
  const [overrides, setOverrides] = useState<Map<number, Partial<Pick<ImportPreviewRow, 'accountId' | 'personalCategoryId'>>>>(
    () => new Map()
  );
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [lastSummary, setLastSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPasteText('');
    setParsedLines([]);
    setHasHeader(false);
    setOverrides(new Map());
    setParseError('');
    setImportError('');
    setLastSummary(null);
  }, [isOpen]);

  const bankCashAccounts = useMemo(
    () =>
      state.accounts
        .filter(
          (a) =>
            (a.type === AccountType.BANK || a.type === AccountType.CASH) &&
            a.name !== 'Internal Clearing'
        )
        .map((a) => ({ id: a.id, name: a.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.accounts]
  );

  const existingTransactions = useMemo(() => {
    const rows = listPersonalTransactions({ limit: 25000 }, isLocalOnlyMode() ? undefined : state.personalTransactions);
    return rows.map((t) => ({
      transactionDate: t.transactionDate,
      amount: t.amount,
      description: t.description ?? undefined,
    }));
  }, [state.personalTransactions, dataRevision]);

  const validateCtx: ValidateImportContext = useMemo(
    () => ({
      bankCashAccounts,
      incomeCategories: getPersonalIncomeCategories().map((c) => ({ id: c.id, name: c.name })),
      expenseCategories: getPersonalExpenseCategories().map((c) => ({ id: c.id, name: c.name })),
      existingTransactions,
    }),
    [bankCashAccounts, existingTransactions, dataRevision, state.personalCategories]
  );

  const previewRows = useMemo(
    () => validateImportRows(parsedLines, validateCtx, overrides),
    [parsedLines, validateCtx, overrides]
  );

  const errorLines = useMemo(
    () =>
      previewRows
        .filter((r) => r.status === 'error')
        .map((r) => ({
          line: r.lineIndex + 1,
          msgs: r.messages.filter((m) => m.level === 'error').map((m) => m.text),
        })),
    [previewRows]
  );

  const displayRows = useMemo(() => previewRows.slice(0, PREVIEW_LIMIT), [previewRows]);
  const truncated = previewRows.length > PREVIEW_LIMIT;

  const handleParse = useCallback(() => {
    setParseError('');
    setImportError('');
    setLastSummary(null);
    setOverrides(new Map());
    try {
      const { lines, hasHeader: hh } = parseExcelPaste(pasteText);
      if (lines.length === 0) {
        setParsedLines([]);
        setHasHeader(false);
        setParseError('No rows found. Paste spreadsheet data with columns: Date, Account, Category, Note, Amount, Type.');
        return;
      }
      setParsedLines(lines);
      setHasHeader(hh);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse.');
      setParsedLines([]);
    }
  }, [pasteText]);

  const setAccountOverride = useCallback((lineIndex: number, accountId: string) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const cur = next.get(lineIndex) ?? {};
      next.set(lineIndex, { ...cur, accountId });
      return next;
    });
  }, []);

  const setCategoryOverride = useCallback((lineIndex: number, personalCategoryId: string) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const cur = next.get(lineIndex) ?? {};
      next.set(lineIndex, { ...cur, personalCategoryId });
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    setImportError('');
    const toSave = previewRows.filter(rowImportable);
    if (toSave.length === 0) {
      setImportError('No valid rows to import. Fix errors or adjust account/category.');
      return;
    }
    setImporting(true);
    try {
      const payload = toSave.map((r) => ({
        accountId: r.accountId,
        personalCategoryId: r.personalCategoryId,
        type: r.typeNormalized!,
        amount: r.amountParsed!,
        transactionDate: r.normalizedDate!,
        description: r.note || undefined,
      }));
      const { imported } = await bulkImportPersonalTransactions(payload);
      const skippedErrors = previewRows.filter((r) => r.status === 'error').length;
      const warningsInImported = toSave.filter((r) => r.status === 'warning' || r.duplicateOfExisting).length;
      const summary: ImportSummary = {
        totalRows: previewRows.length,
        imported,
        skippedErrors,
        warningsInImported,
      };
      setLastSummary(summary);
      onImported(summary);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }, [previewRows, onImported]);

  const statusStyle = (s: ImportPreviewRow['status']) => {
    if (s === 'error') return 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200';
    if (s === 'warning') return 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
    return 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from Excel (paste)" size="xl">
      <div className="space-y-4 max-h-[85vh] overflow-hidden flex flex-col">
        <p className="text-sm text-gray-600 dark:text-slate-400">
          Paste rows copied from Excel (tab-separated). Use <strong>Parse Data</strong> to preview and fix mappings before
          importing.
        </p>

        <div className="flex flex-col gap-2 min-h-0">
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Paste data</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={6}
            className="w-full font-mono text-sm border border-gray-300 dark:border-slate-600 rounded-lg p-3 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
            spellCheck={false}
          />
          <p className="text-xs text-gray-500 dark:text-slate-500">
            After changing the pasted text, click <strong>Parse Data</strong> again. Large imports preview up to{' '}
            {PREVIEW_LIMIT} rows; all valid rows are still imported.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleParse} disabled={!pasteText.trim()}>
              Parse Data
            </Button>
            {parsedLines.length > 0 && (
              <span className="text-sm text-gray-500 self-center">
                {parsedLines.length} row{parsedLines.length === 1 ? '' : 's'}
                {hasHeader ? ' (header detected)' : ''}
              </span>
            )}
          </div>
        </div>

        {parseError && (
          <div className="text-sm text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-200 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {parseError}
          </div>
        )}

        {previewRows.length > 0 && (
          <>
            {errorLines.length > 0 && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 p-3 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-red-800 dark:text-red-200 mb-1">Errors</p>
                <ul className="text-xs text-red-800 dark:text-red-200 space-y-1 list-disc list-inside">
                  {errorLines.slice(0, 40).map((el) => (
                    <li key={el.line}>
                      Row {el.line}: {el.msgs.join('; ')}
                    </li>
                  ))}
                  {errorLines.length > 40 && <li>…and {errorLines.length - 40} more</li>}
                </ul>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto border border-gray-200 dark:border-slate-600 rounded-lg">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-100 dark:bg-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-2 px-2 font-semibold">#</th>
                    <th className="text-left py-2 px-2 font-semibold">Date</th>
                    <th className="text-left py-2 px-2 font-semibold">Account</th>
                    <th className="text-left py-2 px-2 font-semibold">Category</th>
                    <th className="text-left py-2 px-2 font-semibold">Note</th>
                    <th className="text-right py-2 px-2 font-semibold">{CURRENCY}</th>
                    <th className="text-left py-2 px-2 font-semibold">Type</th>
                    <th className="text-left py-2 px-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((r) => {
                    const categoryOpts =
                      r.typeNormalized === 'Income'
                        ? validateCtx.incomeCategories
                        : r.typeNormalized === 'Expense'
                          ? validateCtx.expenseCategories
                          : [...validateCtx.incomeCategories, ...validateCtx.expenseCategories];
                    return (
                    <tr
                      key={r.lineIndex}
                      className={`border-b border-gray-100 dark:border-slate-700/80 ${statusStyle(r.status)}`}
                    >
                      <td className="py-1.5 px-2 align-top">{r.lineIndex + 1}</td>
                      <td className="py-1.5 px-2 align-top whitespace-nowrap">{r.normalizedDate ?? (r.dateRaw || '—')}</td>
                      <td className="py-1.5 px-2 align-top min-w-[140px]">
                        <select
                          value={r.accountId}
                          onChange={(e) => setAccountOverride(r.lineIndex, e.target.value)}
                          className="w-full max-w-[200px] text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900"
                          aria-label={`Account row ${r.lineIndex + 1}`}
                        >
                          <option value="">—</option>
                          {bankCashAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        {r.accountSuggestions.length > 0 && !r.accountId && (
                          <p className="text-[10px] mt-0.5 opacity-90">
                            Suggested: {r.accountSuggestions.slice(0, 2).map((s) => s.name).join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 px-2 align-top min-w-[120px]">
                        <select
                          value={r.personalCategoryId}
                          onChange={(e) => setCategoryOverride(r.lineIndex, e.target.value)}
                          className="w-full max-w-[200px] text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900"
                          aria-label={`Category row ${r.lineIndex + 1}`}
                        >
                          <option value="">—</option>
                          {categoryOpts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {r.categorySuggestions.length > 0 && !r.personalCategoryId && (
                          <p className="text-[10px] mt-0.5 opacity-90">
                            Suggested: {r.categorySuggestions.slice(0, 2).map((s) => s.name).join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 px-2 align-top max-w-[140px] truncate" title={r.note}>
                        {r.note || '—'}
                      </td>
                      <td className="py-1.5 px-2 align-top text-right whitespace-nowrap">
                        {r.amountParsed != null ? r.amountParsed.toLocaleString('en-US') : r.amountRaw || '—'}
                      </td>
                      <td className="py-1.5 px-2 align-top">{r.typeNormalized ?? '—'}</td>
                      <td className="py-1.5 px-2 align-top capitalize">{r.status}</td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            {truncated && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Preview limited to first {PREVIEW_LIMIT} of {previewRows.length} rows. All rows are validated; import includes
                every valid row.
              </p>
            )}

            {lastSummary && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-sm text-green-900 dark:text-green-100">
                <p className="font-semibold">Import summary</p>
                <ul className="mt-1 space-y-0.5 list-disc list-inside">
                  <li>Total rows: {lastSummary.totalRows}</li>
                  <li>Imported: {lastSummary.imported}</li>
                  <li>Skipped (errors): {lastSummary.skippedErrors}</li>
                  <li>Warnings (in imported set): {lastSummary.warningsInImported}</li>
                </ul>
              </div>
            )}

            {importError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{importError}</div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-slate-700">
              <Button type="button" variant="secondary" onClick={onClose} disabled={importing}>
                Close
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={importing || previewRows.filter(rowImportable).length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {importing ? 'Importing…' : 'Import valid records'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ImportPersonalTransactionsPasteModal;
