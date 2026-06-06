import { useFullAppState } from '../../hooks/useSelectiveState';
import React, { useMemo } from 'react';
import Modal from '../ui/Modal';
import { TransactionType, type Transaction } from '../../types';
import TransactionItem from '../transactions/TransactionItem';
import { ICONS, CURRENCY } from '../../constants';
import Button from '../ui/Button';
import { formatRoundedNumber } from '../../utils/numberUtils';
import {
  computePlBillDrilldownEntries,
  computePlProcessedBills,
  transactionIsPlUncategorized,
  resolvePlCategoryIdForTransaction,
  transactionIncludedInPlLoop,
  isResolvedPlCategoryInDrilldownRow,
  type PlBillDrilldownEntry,
} from '../reports/projectProfitLossComputation';
import { transactionMatchesProjectCategoryDrilldown } from '../reports/projectCategoryReportDrilldown';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';

export type ProjectTransactionModalListMode = 'profitLoss' | 'categoryReport';

interface ProjectTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** categoryReport matches Income/Expense by Category report (bill payment lines); profitLoss matches Project P&L drill-down. */
  listMode?: ProjectTransactionModalListMode;
  data: {
    projectId: string;
    projectName: string;
    categoryId?: string;
    categoryName?: string;
    type: 'Income' | 'Expense';
    startDate: string;
    endDate: string;
  } | null;
}

type PlTransactionDrillRow =
  | { sortKey: number; kind: 'tx'; tx: Transaction }
  | { sortKey: number; kind: 'bill'; entry: PlBillDrilldownEntry };

const PlBillDrilldownRow: React.FC<{ entry: PlBillDrilldownEntry; drillType: 'Income' | 'Expense' }> = ({
  entry,
  drillType,
}) => (
  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-l-4 border-amber-400/80 bg-amber-50/50">
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/90">Vendor bill (accrual)</p>
      <p className="text-sm text-slate-800 font-medium">{entry.vendorDisplayName}</p>
      <p className="text-sm text-slate-600 break-words">{entry.description}</p>
      <p className="text-xs text-slate-500 mt-1">
        {new Date(entry.issueDate).toLocaleDateString()} · {entry.billNumber}
      </p>
    </div>
    <div
      className={`text-right font-semibold tabular-nums shrink-0 ${
        drillType === 'Income' ? 'text-success' : 'text-danger'
      }`}
    >
      {CURRENCY} {formatRoundedNumber(entry.amount)}
    </div>
  </div>
);

const ProjectTransactionModal: React.FC<ProjectTransactionModalProps> = ({
  isOpen,
  onClose,
  data,
  listMode = 'profitLoss',
}) => {
  const state = useFullAppState();

  const processedBillsForPl = useMemo(() => {
    if (!data || listMode === 'categoryReport') return new Set<string>();
    return computePlProcessedBills(state, data.projectId, data.startDate, data.endDate);
  }, [data, listMode, state.bills, state.categories, state.projects]);

  const filteredTransactions = useMemo(() => {
    if (!data) return [];

    const start = new Date(data.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(data.endDate);
    end.setHours(23, 59, 59, 999);

    const uncategorizedRow =
      data.categoryId === 'uncategorized' ||
      data.categoryId === 'uncategorized_income' ||
      data.categoryId === 'uncategorized_expense';
    const plType = data.type === 'Income' ? TransactionType.INCOME : TransactionType.EXPENSE;

    if (listMode === 'categoryReport' && data.categoryId) {
      return state.transactions
        .filter((tx) =>
          transactionMatchesProjectCategoryDrilldown(tx, state, {
            type: plType,
            selectedProjectId: data.projectId,
            start,
            end,
            drilldownCategoryId: data.categoryId!,
          })
        )
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    return state.transactions
      .filter((tx) => {
        const txDate = new Date(tx.date);
        if (txDate < start || txDate > end) return false;

        if (tx.type !== plType) return false;

        if (
          !transactionIncludedInPlLoop(tx, state, processedBillsForPl, data.projectId, data.startDate, data.endDate)
        ) {
          return false;
        }

        if (data.categoryId === 'gain-loss-fixed-asset') {
          const resolved = resolvePlCategoryIdForTransaction(tx, state, processedBillsForPl);
          const salesOf = findProjectAssetCategory(state.categories, 'SALES_OF_FIXED_ASSET')?.id;
          const proceeds = findProjectAssetCategory(state.categories, 'ASSET_SALE_PROCEEDS')?.id;
          const cost = findProjectAssetCategory(state.categories, 'COST_OF_ASSET_SOLD')?.id;
          if (plType === TransactionType.INCOME) {
            return resolved === salesOf || resolved === proceeds;
          }
          return resolved === cost;
        }

        if (data.categoryId) {
          if (uncategorizedRow) {
            return transactionIsPlUncategorized(
              tx,
              state,
              processedBillsForPl,
              data.projectId,
              data.startDate,
              data.endDate,
              plType
            );
          }
          const resolved = resolvePlCategoryIdForTransaction(tx, state, processedBillsForPl);
          return isResolvedPlCategoryInDrilldownRow(resolved, data.categoryId, state.categories);
        }

        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, listMode, state, state.transactions, processedBillsForPl]);

  const billAccrualRows = useMemo(() => {
    if (!data || listMode === 'categoryReport') return [] as PlBillDrilldownEntry[];
    const plType = data.type === 'Income' ? TransactionType.INCOME : TransactionType.EXPENSE;
    return computePlBillDrilldownEntries(
      state,
      data.projectId,
      data.startDate,
      data.endDate,
      processedBillsForPl,
      { drillCategoryId: data.categoryId, drillType: plType }
    );
  }, [data, listMode, state.bills, state.categories, processedBillsForPl, state.contacts, state.vendors]);

  const combinedRows = useMemo((): PlTransactionDrillRow[] => {
    const out: PlTransactionDrillRow[] = [
      ...filteredTransactions.map((tx) => ({
        sortKey: new Date(tx.date).getTime(),
        kind: 'tx' as const,
        tx,
      })),
      ...billAccrualRows.map((entry) => ({
        sortKey: new Date(entry.issueDate).getTime(),
        kind: 'bill' as const,
        entry,
      })),
    ];
    out.sort((a, b) => a.sortKey - b.sortKey);
    return out;
  }, [filteredTransactions, billAccrualRows]);

  const totalAmount = useMemo(() => {
    const txSum = filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const billSum = billAccrualRows.reduce((sum, b) => sum + b.amount, 0);
    return txSum + billSum;
  }, [filteredTransactions, billAccrualRows]);

  if (!data) return null;

  const title = `${data.type} Transactions - ${data.categoryName ? data.categoryName : 'All Categories'}`;
  const subTitle = data.projectId === 'all' ? 'All Projects' : data.projectName;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div>
        <div className="p-3 bg-slate-100 rounded-lg mb-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="font-semibold text-slate-700 block">{subTitle}</span>
              <span className="text-xs text-slate-500">
                {new Date(data.startDate).toLocaleDateString()} - {new Date(data.endDate).toLocaleDateString()}
              </span>
            </div>
            <span className={`font-bold text-lg ${data.type === 'Income' ? 'text-success' : 'text-danger'}`}>
              {CURRENCY} {formatRoundedNumber(totalAmount)}
            </span>
          </div>
        </div>

        {combinedRows.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto -mx-4">
            <div className="divide-y divide-slate-100">
              {combinedRows.map((row) =>
                row.kind === 'tx' ? (
                  <TransactionItem key={row.tx.id} transaction={row.tx} onEdit={() => {}} />
                ) : (
                  <PlBillDrilldownRow key={row.entry.lineKey} entry={row.entry} drillType={data.type} />
                )
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="mx-auto h-12 w-12 text-slate-400">{ICONS.fileText}</div>
            <h3 className="mt-2 text-md font-semibold text-slate-800">No records found</h3>
            <p className="text-xs text-slate-500 mt-1">Nothing matched this project, category, and period.</p>
          </div>
        )}
        <div className="flex-grow flex justify-end mt-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default React.memo(ProjectTransactionModal);
