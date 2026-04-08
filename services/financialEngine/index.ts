/**
 * Financial transaction engine — double-entry journal (immutable), reversal, audit, reporting.
 *
 * **Writes:** Use {@link createJournalEntry} / {@link reverseJournalEntry} only for GL postings.
 * Legacy `transactions` table remains for existing invoice/payment flows until migrated.
 */

export type {
  JournalLineInput,
  CreateJournalEntryInput,
  JournalEntryRow,
  JournalLineRow,
  AccountingAuditRow,
} from './types';

export {
  roundMoney,
  MONEY_EPSILON,
  sumDebits,
  sumCredits,
  isBalanced,
  validateLineShapes,
  validateBalanced,
  swapLinesForReversal,
} from './validation';

export {
  newJournalId,
  createJournalEntry,
  createTransaction,
  getJournalEntryWithLines,
  isJournalReversed,
  reverseJournalEntry,
  reverseTransaction,
} from './journalEngine';

export type {
  TrialBalanceRow,
  GeneralLedgerRow,
  AccountStatementRow,
  TrialBalanceReportResult,
  FetchTrialBalanceOptions,
} from './ledgerReports';
export { fetchTrialBalanceReport, getTrialBalance, getGeneralLedger, getAccountStatement } from './ledgerReports';

export type {
  TrialBalanceBasis,
  TrialBalanceReportPayload,
  TrialBalanceAccountLine,
  TrialBalanceRawRow,
} from './trialBalanceCore';
export {
  buildTrialBalanceReport,
  netColumnsFromGross,
  compareTrialBalanceType,
  isTrialBalanceBalanced,
} from './trialBalanceCore';
