import type pg from 'pg';
import { listCategories } from '../../modules/accounting/services/categoriesService.js';
import { listTransactions, rowToTransactionApi } from '../../modules/accounting/services/transactionsService.js';
import { listContacts, rowToContactApi } from '../../modules/crm/services/contactsService.js';
import { listRentalAgreements, rowToRentalAgreementApi } from '../../modules/leases/services/rentalAgreementsService.js';
import {
  listProjectAgreements,
  rowToProjectAgreementApi,
} from '../../modules/project-selling/services/projectAgreementsService.js';
import type {
  BrokerBalanceAggregationRow,
  BrokerBalancesAggregationResponse,
} from './types.js';

type BrokerContext = 'all' | 'Rental' | 'Project';

function asRecord<T extends Record<string, unknown>>(x: Record<string, unknown>): T {
  return x as T;
}

function getEffectiveCommissionBrokerContactId(
  tx: Record<string, unknown>,
  opts: {
    brokerFeeCategoryId?: string;
    rebateCategoryId?: string;
    projectAgreements: Record<string, unknown>[];
    rentalAgreements: Record<string, unknown>[];
  }
): string | undefined {
  if (tx.type !== 'Expense') return (tx.contactId as string) || undefined;
  const cid = tx.categoryId as string | undefined;
  const catMatch =
    (opts.brokerFeeCategoryId && cid === opts.brokerFeeCategoryId) ||
    (opts.rebateCategoryId && cid === opts.rebateCategoryId);
  if (!catMatch) return (tx.contactId as string) || undefined;

  const aid = typeof tx.agreementId === 'string' ? tx.agreementId.trim() : '';
  if (!aid) return (tx.contactId as string) || undefined;

  const pa = opts.projectAgreements.find((p) => p.id === aid);
  if (pa) {
    const rebate = pa.rebateBrokerId;
    return (typeof rebate === 'string' && rebate.trim() ? rebate.trim() : undefined) ||
      (tx.contactId as string) ||
      undefined;
  }

  const ra = opts.rentalAgreements.find((r) => r.id === aid);
  if (ra) {
    const broker = ra.brokerId;
    return (typeof broker === 'string' && broker.trim() ? broker.trim() : undefined) ||
      (tx.contactId as string) ||
      undefined;
  }

  return (tx.contactId as string) || undefined;
}

export async function getBrokerBalancesAggregation(
  client: pg.PoolClient,
  tenantId: string,
  context: BrokerContext = 'all'
): Promise<BrokerBalancesAggregationResponse> {
  const [catRows, contactRows, txRows, rentalRows, projectRows] = await Promise.all([
    listCategories(client, tenantId),
    listContacts(client, tenantId),
    listTransactions(client, tenantId, { limit: 500_000, offset: 0 }),
    listRentalAgreements(client, tenantId),
    listProjectAgreements(client, tenantId),
  ]);

  const categories = catRows.map((r) => ({ id: r.id, name: r.name }));
  const contacts = contactRows.map((r) => asRecord(rowToContactApi(r)));
  const transactions = txRows.map((r) => asRecord(rowToTransactionApi(r)));
  const rentalAgreements = rentalRows.map((r) => asRecord(rowToRentalAgreementApi(r)));
  const projectAgreements = projectRows.map((r) => asRecord(rowToProjectAgreementApi(r)));

  const brokerFeeCategory = categories.find((c) => c.name === 'Broker Fee');
  const rebateCategory = categories.find((c) => c.name === 'Rebate Amount');
  const brokerFeeCategoryId = brokerFeeCategory?.id;
  const rebateCategoryId = rebateCategory?.id;
  const relevantCategoryIds = [brokerFeeCategoryId, rebateCategoryId].filter(Boolean) as string[];

  const attributionOpts = {
    brokerFeeCategoryId,
    rebateCategoryId,
    projectAgreements,
    rentalAgreements,
  };

  const brokerData: Record<string, { earned: number; paid: number }> = {};

  for (const contact of contacts) {
    const type = String(contact.type ?? '');
    if (type === 'Broker' || type === 'Dealer') {
      brokerData[String(contact.id)] = { earned: 0, paid: 0 };
    }
  }

  if (context === 'all' || context === 'Rental') {
    for (const ra of rentalAgreements) {
      if (ra.previousAgreementId) continue;
      const brokerId = ra.brokerId as string | undefined;
      const fee = Number(ra.brokerFee ?? 0);
      if (brokerId && fee > 0) {
        if (!brokerData[brokerId]) brokerData[brokerId] = { earned: 0, paid: 0 };
        brokerData[brokerId].earned += fee;
      }
    }
  }

  if (context === 'all' || context === 'Project') {
    for (const pa of projectAgreements) {
      const brokerId = pa.rebateBrokerId as string | undefined;
      const fee = Number(pa.rebateAmount ?? 0);
      if (brokerId && fee > 0) {
        if (!brokerData[brokerId]) brokerData[brokerId] = { earned: 0, paid: 0 };
        brokerData[brokerId].earned += fee;
      }
    }
  }

  for (const tx of transactions) {
    if (tx.type !== 'Expense' || !tx.categoryId || !relevantCategoryIds.includes(String(tx.categoryId))) {
      continue;
    }
    const category = categories.find((c) => c.id === tx.categoryId);
    const isRebate = category?.name === 'Rebate Amount';
    let shouldInclude = true;

    if (context === 'Project') {
      if (!tx.projectId && !isRebate) shouldInclude = false;
    } else if (context === 'Rental') {
      if (tx.projectId || isRebate) shouldInclude = false;
    }

    if (!shouldInclude) continue;

    const effectiveBrokerId = getEffectiveCommissionBrokerContactId(tx, attributionOpts);
    if (!effectiveBrokerId) continue;
    if (!brokerData[effectiveBrokerId]) brokerData[effectiveBrokerId] = { earned: 0, paid: 0 };
    brokerData[effectiveBrokerId].paid += Number(tx.amount ?? 0);
  }

  const rows: BrokerBalanceAggregationRow[] = Object.entries(brokerData)
    .map(([brokerId, data]) => ({
      brokerId,
      commissionsEarned: data.earned,
      commissionsPaid: data.paid,
      outstandingCommission: data.earned - data.paid,
    }))
    .filter((row) => Math.abs(row.outstandingCommission) > 0.01 || row.commissionsEarned > 0 || row.commissionsPaid > 0)
    .sort((a, b) => b.outstandingCommission - a.outstandingCommission);

  return {
    generatedAt: new Date().toISOString(),
    context,
    rows,
  };
}
