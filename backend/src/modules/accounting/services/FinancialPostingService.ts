import type pg from 'pg';
import { validateBalanced } from '../../../financial/validation.js';
import { assertAccountingPeriodOpen } from './accountingPeriodService.js';
import { queueFinancialPosted } from '../../../core/financialPostedEmissions.js';
import type { CreateJournalBody } from './journalService.js';
import { JournalRepository } from '../repositories/JournalRepository.js';
import {
  buildJournalBodyFromBill,
  buildJournalLinesFromBill,
  BILL_JOURNAL_SOURCE_MODULE,
  shouldSkipBillJournalMirror,
} from './billJournalPostingService.js';
import type { BillRow } from '../../vendors/services/billsService.js';
import {
  buildJournalBodyFromInvoice,
  buildJournalLinesFromInvoice,
  INVOICE_JOURNAL_SOURCE_MODULE,
  shouldSkipInvoiceJournalMirror,
} from './invoiceJournalPostingService.js';
import type { InvoiceRow } from '../../customers/services/invoicesService.js';
import {
  buildJournalBodyFromTransaction,
  buildJournalLinesFromTransaction,
  TRANSACTION_JOURNAL_SOURCE_MODULE,
  shouldSkipTransactionJournalMirror,
} from './transactionJournalPostingService.js';
import type { TransactionRow } from './transactionsService.js';
import {
  buildJournalBodyFromPeV,
  buildJournalLinesFromPeV,
  PEV_JOURNAL_SOURCE_MODULE,
  shouldSkipPeVJournalMirror,
} from './pevJournalPostingService.js';
import type { ProjectExpenseVoucherRow } from '../../project-expense/services/projectExpenseVoucherService.js';

export type PostingOptions = {
  allowClosedPeriod?: boolean;
  overrideLockedPeriod?: boolean;
  actorUserId?: string | null;
  emitRealtime?: boolean;
};

/**
 * Architecture v2 — single gateway for all GL postings.
 * Enforces balanced entries and accounting period rules before persistence.
 */
export class FinancialPostingService {
  private readonly repo: JournalRepository;

  constructor(tenantId: string, client?: pg.PoolClient) {
    this.repo = new JournalRepository(tenantId, client);
  }

  private journalRepo(): JournalRepository {
    return this.repo;
  }

  get tenantId(): string {
    return this.repo.getTenantId();
  }

  async postManualJournal(
    client: pg.PoolClient,
    input: CreateJournalBody,
    options?: PostingOptions & { journalEntryIdOverride?: string }
  ): Promise<{ journalEntryId: string }> {
    return this.postJournal(client, input, options);
  }

  async postJournal(
    client: pg.PoolClient,
    input: CreateJournalBody,
    options?: PostingOptions & { journalEntryIdOverride?: string }
  ): Promise<{ journalEntryId: string }> {
    const err = validateBalanced(input.lines);
    if (err) throw new Error(err);

    await assertAccountingPeriodOpen(client, this.tenantId, input.entryDate, {
      allowClosedPeriod: options?.allowClosedPeriod,
      overrideLockedPeriod: options?.overrideLockedPeriod,
      actorRole: options?.overrideLockedPeriod ? 'super_admin' : undefined,
    });

    const { journalEntryId } = await this.journalRepo().insertEntry(
      client,
      input,
      options?.journalEntryIdOverride,
      { allowClosedPeriod: options?.allowClosedPeriod }
    );

    if (options?.emitRealtime !== false) {
      queueFinancialPosted(this.tenantId, {
        journalEntryId,
        sourceModule: input.sourceModule ?? 'manual',
        sourceId: input.sourceId ?? null,
        sourceUserId: options?.actorUserId ?? input.createdBy ?? undefined,
      });
    }

    return { journalEntryId };
  }

  async     reverseJournal(
      client: pg.PoolClient,
      originalJournalEntryId: string,
      reason: string,
      createdBy: string | null,
      options?: Pick<PostingOptions, 'emitRealtime'>
    ): Promise<{ reversalJournalEntryId: string }> {
    const result = await this.journalRepo().reverseEntry(
      client,
      originalJournalEntryId,
      reason,
      createdBy
    );
    if (options?.emitRealtime !== false) {
      queueFinancialPosted(this.tenantId, {
        journalEntryId: result.reversalJournalEntryId,
        sourceModule: 'reversal',
        sourceId: originalJournalEntryId,
        sourceUserId: createdBy ?? undefined,
      });
    }
    return result;
  }

  async postFromBill(
    client: pg.PoolClient,
    row: BillRow,
    actorUserId: string | null,
    options?: { replaceExisting?: boolean }
  ): Promise<{ journalEntryId: string | null }> {
    if (shouldSkipBillJournalMirror(row)) {
      await this.reverseBillMirror(client, row.id, actorUserId);
      return { journalEntryId: null };
    }

    if (options?.replaceExisting !== false) {
      await this.reverseBillMirror(client, row.id, actorUserId);
    }

    const lines = buildJournalLinesFromBill(row);
    if (!lines) return { journalEntryId: null };

    const body = buildJournalBodyFromBill(row, lines);
    const { journalEntryId } = await this.postJournal(client, body, { actorUserId });
    return { journalEntryId };
  }

  async reverseBillMirror(
    client: pg.PoolClient,
    billId: string,
    actorUserId: string | null
  ): Promise<void> {
    const existingId = await this.journalRepo().findActiveBySource(
      client,
      BILL_JOURNAL_SOURCE_MODULE,
      billId
    );
    if (!existingId) return;
    await this.reverseJournal(client, existingId, 'Bill updated or removed', actorUserId);
  }

  async postFromInvoice(
    client: pg.PoolClient,
    row: InvoiceRow,
    actorUserId: string | null,
    options?: { replaceExisting?: boolean }
  ): Promise<{ journalEntryId: string | null }> {
    if (shouldSkipInvoiceJournalMirror(row)) {
      await this.reverseInvoiceMirror(client, row.id, actorUserId);
      return { journalEntryId: null };
    }

    if (options?.replaceExisting !== false) {
      await this.reverseInvoiceMirror(client, row.id, actorUserId);
    }

    const lines = buildJournalLinesFromInvoice(row);
    if (!lines) return { journalEntryId: null };

    const body = buildJournalBodyFromInvoice(row, lines);
    const { journalEntryId } = await this.postJournal(client, body, { actorUserId });
    return { journalEntryId };
  }

  async reverseInvoiceMirror(
    client: pg.PoolClient,
    invoiceId: string,
    actorUserId: string | null
  ): Promise<void> {
    const existingId = await this.journalRepo().findActiveBySource(
      client,
      INVOICE_JOURNAL_SOURCE_MODULE,
      invoiceId
    );
    if (!existingId) return;
    await this.reverseJournal(client, existingId, 'Invoice updated or removed', actorUserId);
  }

  async postFromTransaction(
    client: pg.PoolClient,
    row: TransactionRow,
    actorUserId: string | null,
    options?: { replaceExisting?: boolean }
  ): Promise<{ journalEntryId: string | null }> {
    if (shouldSkipTransactionJournalMirror(row)) {
      await this.reverseTransactionMirror(client, row.id, actorUserId);
      return { journalEntryId: null };
    }

    if (options?.replaceExisting !== false) {
      await this.reverseTransactionMirror(client, row.id, actorUserId);
    }

    const lines = buildJournalLinesFromTransaction(row);
    if (!lines) return { journalEntryId: null };

    const body = buildJournalBodyFromTransaction(row, lines);
    const { journalEntryId } = await this.postJournal(client, body, { actorUserId });
    return { journalEntryId };
  }

  async reverseTransactionMirror(
    client: pg.PoolClient,
    transactionId: string,
    actorUserId: string | null
  ): Promise<void> {
    const existingId = await this.journalRepo().findActiveBySource(
      client,
      TRANSACTION_JOURNAL_SOURCE_MODULE,
      transactionId
    );
    if (!existingId) return;
    await this.reverseJournal(client, existingId, 'Transaction updated or removed', actorUserId);
  }

  async postFromPeV(
    client: pg.PoolClient,
    row: ProjectExpenseVoucherRow,
    expenseGlAccountId: string,
    actorUserId: string | null,
    options?: { replaceExisting?: boolean }
  ): Promise<{ journalEntryId: string | null }> {
    if (shouldSkipPeVJournalMirror(row)) {
      await this.reversePeVMirror(client, row.id, actorUserId);
      return { journalEntryId: null };
    }

    if (options?.replaceExisting !== false) {
      await this.reversePeVMirror(client, row.id, actorUserId);
    }

    const lines = buildJournalLinesFromPeV(row, expenseGlAccountId);
    if (!lines) return { journalEntryId: null };

    const body = buildJournalBodyFromPeV(row, lines);
    const { journalEntryId } = await this.postJournal(client, body, { actorUserId });
    return { journalEntryId };
  }

  async reversePeVMirror(
    client: pg.PoolClient,
    voucherId: string,
    actorUserId: string | null
  ): Promise<void> {
    const existingId = await this.journalRepo().findActiveBySource(
      client,
      PEV_JOURNAL_SOURCE_MODULE,
      voucherId
    );
    if (!existingId) return;
    await this.reverseJournal(client, existingId, 'Project expense voucher reversed', actorUserId);
  }
}

/** Factory for strangler delegates in legacy services. */
export function createFinancialPostingService(
  tenantId: string,
  client?: pg.PoolClient
): FinancialPostingService {
  return new FinancialPostingService(tenantId, client);
}
