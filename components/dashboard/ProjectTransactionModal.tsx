import React, { useMemo } from 'react';
import Modal from '../ui/Modal';
import { TransactionType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import TransactionItem from '../transactions/TransactionItem';
import { ICONS, CURRENCY } from '../../constants';
import Button from '../ui/Button';
import { formatRoundedNumber } from '../../utils/numberUtils';
import {
  computePlProcessedBills,
  transactionIsPlUncategorized,
  resolvePlCategoryIdForTransaction,
  transactionIncludedInPlLoop,
  isResolvedPlCategoryInDrilldownRow,
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

const ProjectTransactionModal: React.FC<ProjectTransactionModalProps> = ({
  isOpen,
  onClose,
  data,
  listMode = 'profitLoss',
}) => {
  const { state } = useAppContext();

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

  const totalAmount = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

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

        {filteredTransactions.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto -mx-4">
            <div className="divide-y divide-slate-100">
              {filteredTransactions.map((tx) => (
                <TransactionItem key={tx.id} transaction={tx} onEdit={() => {}} />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="mx-auto h-12 w-12 text-slate-400">{ICONS.fileText}</div>
            <h3 className="mt-2 text-md font-semibold text-slate-800">No Transactions Found</h3>
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
