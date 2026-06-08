import type { TransactionLogEntry } from '../types';
import { isAccountingBackedByRemoteApi } from '../config/apiUrl';

/** Fire-and-forget append of a transaction audit log entry to PostgreSQL (LAN/API mode). */
export function queueTransactionLogAppend(entry: TransactionLogEntry | undefined): void {
  if (!entry?.id || !isAccountingBackedByRemoteApi()) return;
  void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
    void getAppStateApiService().appendTransactionLog(entry).catch((err) => {
      console.warn('Failed to sync transaction log to API:', err);
    });
  });
}

const TXN_LOG_ACTIONS = new Set([
  'ADD_TRANSACTION',
  'UPDATE_TRANSACTION',
  'DELETE_TRANSACTION',
  'BATCH_ADD_TRANSACTIONS',
  'BATCH_DELETE_TRANSACTIONS',
  'RESTORE_TRANSACTION',
  'RESET_TRANSACTIONS',
]);

export function maybeQueueTransactionLogSync(
  actionType: string | undefined,
  isRemote: boolean,
  prevLog: TransactionLogEntry[] | undefined,
  nextLog: TransactionLogEntry[] | undefined
): void {
  if (isRemote || !actionType || !TXN_LOG_ACTIONS.has(actionType)) return;
  const prevLen = prevLog?.length ?? 0;
  const nextLen = nextLog?.length ?? 0;
  if (nextLen <= prevLen) return;
  queueTransactionLogAppend(nextLog![0]);
}
