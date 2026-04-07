import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, LoanSubtype, Transaction } from '../../types';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { ICONS } from '../../constants';
import LoanAnalysisReport from '../reports/LoanAnalysisReport';
import { formatDate } from '../../utils/dateUtils';
import { exportJsonToExcel } from '../../services/exportService';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { LoanManagerLayout } from './loanManager/LoanManagerLayout';
import { LoanSidebar, type LoanSummaryItem } from './loanManager/LoanSidebar';
import {
  LoanDetailPanel,
  LoanDetailEmpty,
  type ProcessedTx,
} from './loanManager/LoanDetailPanel';
import {
  getLoanStatusUI,
  getTreeGroup,
  defaultAdvancedFilter,
  type QuickFilterKey,
  type AdvancedFilterState,
} from './loanManager/loanManagerUtils';

interface LoanSummary {
  contactId: string;
  contactName: string;
  contactNo?: string;
  received: number;
  repaid: number;
  given: number;
  collected: number;
  netBalance: number;
}

const LoanManagementPage: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showAlert } = useNotification();
  const { print: triggerPrint } = usePrintContext();
  const { openChat } = useWhatsApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>('all');
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilterState>(defaultAdvancedFilter);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<{ isOpen: boolean; transaction: Transaction | null }>({
    isOpen: false,
    transaction: null,
  });

  const contactsMap = useMemo(
    () => new Map(state.contacts.map(c => [c.id, c])),
    [state.contacts]
  );
  const accountsMap = useMemo(
    () => new Map(state.accounts.map(a => [a.id, a])),
    [state.accounts]
  );

  const loanSummaries = useMemo(() => {
    const summary: Record<string, LoanSummary> = {};
    state.transactions
      .filter(tx => tx.type === TransactionType.LOAN)
      .forEach(tx => {
        const contactId = tx.contactId || 'unknown';
        if (!summary[contactId]) {
          const contact = contactsMap.get(contactId);
          summary[contactId] = {
            contactId,
            contactName: contact?.name || 'Unknown',
            contactNo: contact?.contactNo,
            received: 0,
            repaid: 0,
            given: 0,
            collected: 0,
            netBalance: 0,
          };
        }
        const sub = tx.subtype as string | undefined;
        const isInflow = sub === LoanSubtype.RECEIVE || sub === LoanSubtype.COLLECT;
        const amt = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
        if (sub === LoanSubtype.RECEIVE) summary[contactId].received += amt;
        else if (sub === LoanSubtype.COLLECT) summary[contactId].collected += amt;
        else if (sub === LoanSubtype.REPAY) summary[contactId].repaid += amt;
        else summary[contactId].given += amt;
        summary[contactId].netBalance += isInflow ? amt : -amt;
      });
    return Object.values(summary).filter(
      s => Math.abs(s.netBalance) > 0.01 || s.received > 0 || s.given > 0
    );
  }, [state.transactions, contactsMap]);

  const sidebarItems: LoanSummaryItem[] = useMemo(() => {
    const loanTxs = state.transactions.filter(tx => tx.type === TransactionType.LOAN);
    return loanSummaries.map(s => {
      const contactTxs = loanTxs.filter(tx => tx.contactId === s.contactId);
      const lastDate =
        contactTxs.length > 0
          ? new Date(
              Math.max(...contactTxs.map(t => new Date(t.date).getTime()))
            )
          : new Date();
      const hasRepayOrCollect = s.repaid > 0 || s.collected > 0;
      const statusUI = getLoanStatusUI(s.netBalance, hasRepayOrCollect, lastDate);
      const treeGroup = getTreeGroup(s.netBalance);
      return {
        ...s,
        lastActivityDate: lastDate,
        statusUI,
        treeGroup,
      };
    });
  }, [loanSummaries, state.transactions]);

  const selectedSummary = useMemo(
    () => loanSummaries.find(s => s.contactId === selectedContactId),
    [loanSummaries, selectedContactId]
  );

  const processedTransactions = useMemo((): ProcessedTx[] => {
    if (!selectedContactId) return [];
    const rawTxs = state.transactions.filter(
      tx => tx.type === TransactionType.LOAN && tx.contactId === selectedContactId
    );
    rawTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let runningBalance = 0;
    return rawTxs.map(tx => {
      const isInflow = tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT;
      const amt = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
      const give = isInflow ? 0 : amt;
      const receive = isInflow ? amt : 0;
      runningBalance += receive - give;
      return {
        id: tx.id,
        date: tx.date,
        give,
        receive,
        balance: runningBalance,
        accountName: accountsMap.get(tx.accountId)?.name || 'Unknown',
        description: tx.description,
      };
    });
  }, [state.transactions, accountsMap, selectedContactId]);

  const transactionTotals = useMemo(() => {
    const totalGive = processedTransactions.reduce((acc, curr) => acc + curr.give, 0);
    const totalReceive = processedTransactions.reduce((acc, curr) => acc + curr.receive, 0);
    return { totalGive, totalReceive, net: totalReceive - totalGive };
  }, [processedTransactions]);

  const appliedFilterCount = useMemo(
    () =>
      [
        advancedFilter.status,
        advancedFilter.amountRange,
        advancedFilter.dueDate,
        advancedFilter.loanType,
      ].filter(Boolean).length,
    [advancedFilter]
  );

  const handleTransactionClick = (transactionId: string) => {
    setSelectedTransactionId(transactionId);
    setIsEditModalOpen(true);
  };

  const handleEditModalClose = () => {
    setIsEditModalOpen(false);
    setSelectedTransactionId(null);
  };

  const handleShowDeleteWarning = (tx: Transaction) => {
    setDeleteWarning({ isOpen: true, transaction: tx });
  };

  const handleConfirmDelete = () => {
    if (deleteWarning.transaction) {
      dispatch({ type: 'DELETE_TRANSACTION', payload: deleteWarning.transaction.id });
      handleEditModalClose();
    }
    setDeleteWarning({ isOpen: false, transaction: null });
  };

  const handleWhatsApp = async () => {
    if (!selectedSummary) return;
    if (!selectedSummary.contactNo) {
      await showAlert('This contact does not have a phone number saved.');
      return;
    }
    try {
      const balance = selectedSummary.netBalance;
      const status = balance > 0 ? 'To Return' : balance < 0 ? 'To Receive' : 'Settled';
      const message = `*Loan Balance Statement*\nContact: ${selectedSummary.contactName}\nStatus: ${status}\nNet Balance: *₨ ${Math.abs(balance).toLocaleString()}*\n\nThis is an automated message from PBooksPro.`;
      const contact = state.contacts.find(
        c => c.name === selectedSummary.contactName && c.contactNo === selectedSummary.contactNo
      );
      const contactLike = contact || {
        id: '',
        name: selectedSummary.contactName,
        type: (state.contacts.find(c => c.name === selectedSummary.contactName)?.type || 'Friend & Family') as any,
        contactNo: selectedSummary.contactNo,
      };
      sendOrOpenWhatsApp(
        { contact: contactLike, message, phoneNumber: contactLike.contactNo },
        () => state.whatsAppMode,
        openChat
      );
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
    }
  };

  const handleExport = () => {
    if (!selectedSummary) return;
    const data = processedTransactions.map(tx => ({
      Date: formatDate(tx.date),
      Account: tx.accountName,
      Description: tx.description,
      'Give Loan': tx.give,
      'Receive Loan': tx.receive,
      Balance: tx.balance,
    }));
    exportJsonToExcel(data, `loan-statement-${selectedSummary.contactName}.xlsx`, 'Loan History');
  };

  const handlePrint = () => {
    triggerPrint('REPORT', { elementId: 'printable-area' });
  };

  const selectedItem = selectedContactId
    ? sidebarItems.find(s => s.contactId === selectedContactId)
    : null;
  const statusUI = selectedItem?.statusUI ?? 'Pending';
  const dueLabel = '—';

  return (
    <div className="h-full min-h-0 flex flex-col">
      <style>{STANDARD_PRINT_STYLES}</style>

      {/* Top bar: Analysis Report + New Loan */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-end gap-2 p-3 bg-white border-b border-slate-200 no-print">
        <Button variant="secondary" onClick={() => setIsReportOpen(true)}>
          <span className="w-4 h-4 mr-2">{ICONS.barChart}</span>
          Analysis Report
        </Button>
        <Button onClick={() => setIsModalOpen(true)}>
          <span className="w-4 h-4 mr-2">{ICONS.plus}</span>
          New Loan
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <LoanManagerLayout
          sidebarOpen={sidebarOpen}
          onSidebarClose={() => setSidebarOpen(false)}
          onSidebarToggle={() => setSidebarOpen(prev => !prev)}
          sidebar={
            <LoanSidebar
              items={sidebarItems}
              selectedContactId={selectedContactId}
              onSelect={id => {
                setSelectedContactId(id);
                setSidebarOpen(false);
              }}
              quickFilter={quickFilter}
              onQuickFilterChange={setQuickFilter}
              advancedFilter={advancedFilter}
              onAdvancedFilterChange={setAdvancedFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              appliedCount={appliedFilterCount}
            />
          }
          detail={
            selectedContactId && selectedSummary ? (
              <div id="printable-area" className="h-full p-3 md:p-4 printable-area">
                <LoanDetailPanel
                  contactName={selectedSummary.contactName}
                  contactNo={selectedSummary.contactNo}
                  netBalance={selectedSummary.netBalance}
                  statusUI={statusUI}
                  dueLabel={dueLabel}
                  totalGiven={transactionTotals.totalGive}
                  totalCollectedOrRepaid={transactionTotals.totalReceive}
                  transactions={processedTransactions}
                  onRecordPayment={() => setIsModalOpen(true)}
                  onEditLoan={handleTransactionClick}
                  onSendReminder={handleWhatsApp}
                  onExport={handleExport}
                  onPrint={handlePrint}
                />
              </div>
            ) : (
              <div className="h-full p-3 md:p-4">
                <LoanDetailEmpty />
              </div>
            )
          }
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Loan" size="md">
        <TransactionForm
          onClose={() => setIsModalOpen(false)}
          transactionTypeForNew={TransactionType.LOAN}
          onShowDeleteWarning={() => {}}
        />
      </Modal>

      <Modal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} title="Loan Analysis" size="xl">
        <div className="h-[80vh]">
          <LoanAnalysisReport />
          <div className="flex justify-end p-4 border-t">
            <Button variant="secondary" onClick={() => setIsReportOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={handleEditModalClose} title="Edit Loan Transaction">
        <TransactionForm
          onClose={handleEditModalClose}
          transactionTypeForNew={TransactionType.LOAN}
          transactionToEdit={
            selectedTransactionId ? state.transactions.find(t => t.id === selectedTransactionId) : undefined
          }
          onShowDeleteWarning={handleShowDeleteWarning}
        />
      </Modal>

      <LinkedTransactionWarningModal
        isOpen={deleteWarning.isOpen}
        onClose={() => setDeleteWarning({ isOpen: false, transaction: null })}
        onConfirm={handleConfirmDelete}
        action="delete"
        linkedItemName="a Loan Transaction"
      />
    </div>
  );
};

export default LoanManagementPage;
