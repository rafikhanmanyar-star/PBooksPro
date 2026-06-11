import { _getAppState } from '../context/appStateStore';
import { waitForInvoiceApiSaveIdle } from '../context/appStateStore';

export type InvoiceBulkPersistResult = {
  total: number;
  persisted: number;
  failed: number;
};

/** After bulk ADD_INVOICE dispatches, wait for the API queue and count rows with a server version. */
export async function verifyInvoicesPersistedToServer(
  createdIds: string[]
): Promise<InvoiceBulkPersistResult> {
  if (createdIds.length === 0) {
    return { total: 0, persisted: 0, failed: 0 };
  }
  await waitForInvoiceApiSaveIdle();
  const invoices = _getAppState().invoices;
  const persisted = createdIds.filter((id) => {
    const inv = invoices.find((i) => i.id === id);
    return inv && typeof inv.version === 'number' && inv.version >= 1;
  }).length;
  return {
    total: createdIds.length,
    persisted,
    failed: createdIds.length - persisted,
  };
}

export function formatBulkInvoicePersistMessage(result: InvoiceBulkPersistResult): string | null {
  if (result.failed <= 0) return null;
  return `${result.failed} of ${result.total} invoice${result.total === 1 ? '' : 's'} could not be saved to the server. Other users will not see them until the issue is fixed. Try again or contact support if this persists.`;
}
