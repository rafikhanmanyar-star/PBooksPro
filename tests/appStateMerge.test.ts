import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../context/appInitialState';
import {
  mergeBillsWithServerBaseline,
  mergeInvoicesWithServerBaseline,
  mergePartialStateIntoBaseline,
  mergeProjectAgreementsWithServerBaseline,
  mergeTransactionsWithServerBaseline,
} from '../context/reducers/appStateMerge';
import {
  InvoiceStatus,
  InvoiceType,
  ProjectAgreementStatus,
  TransactionType,
  type AppState,
  type Bill,
  type Invoice,
  type ProjectAgreement,
  type Transaction,
} from '../types';

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: TransactionType.INCOME,
    amount: 100,
    date: '2026-06-18',
    accountId: 'acc-1',
    ...overrides,
  };
}

function agreement(id: string, overrides: Partial<ProjectAgreement> = {}): ProjectAgreement {
  return {
    id,
    agreementNumber: `PA-${id}`,
    clientId: 'client-1',
    projectId: 'project-1',
    unitIds: ['unit-1'],
    listPrice: 1000000,
    customerDiscount: 0,
    floorDiscount: 0,
    lumpSumDiscount: 0,
    miscDiscount: 0,
    sellingPrice: 1000000,
    issueDate: '2026-06-18',
    status: ProjectAgreementStatus.ACTIVE,
    ...overrides,
  };
}

function appStateWithTransactions(transactions: Transaction[]): AppState {
  return { ...initialState, transactions };
}

function appStateWithProjectAgreements(projectAgreements: ProjectAgreement[]): AppState {
  return { ...initialState, projectAgreements };
}

describe('mergeTransactionsWithServerBaseline', () => {
  it('keeps optimistic tx missing from server', () => {
    const optimistic = tx('opt-1');
    const merged = mergeTransactionsWithServerBaseline([optimistic], [tx('srv-1')]);
    assert.deepEqual(
      merged.map((t) => t.id).sort(),
      ['opt-1', 'srv-1']
    );
  });

  it('keeps versioned tx missing from stale server partial', () => {
    const payment = tx('pay-stale', { version: 1, amount: 5000 });
    const merged = mergeTransactionsWithServerBaseline([payment], [tx('other')]);
    assert.equal(merged.filter((t) => t.id === 'pay-stale').length, 1);
  });

  it('server row wins on same id', () => {
    const baseline = tx('same', { amount: 100, description: 'client' });
    const server = tx('same', { amount: 200, description: 'server', version: 2 });
    const merged = mergeTransactionsWithServerBaseline([baseline], [server]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].amount, 200);
    assert.equal(merged[0].description, 'server');
  });
});

describe('mergeProjectAgreementsWithServerBaseline', () => {
  it('keeps agreement missing from stale server partial', () => {
    const saved = agreement('agr-new', { version: 1 });
    const merged = mergeProjectAgreementsWithServerBaseline([saved], [agreement('agr-old', { version: 1 })]);
    assert.ok(merged.some((a) => a.id === 'agr-new'));
    assert.ok(merged.some((a) => a.id === 'agr-old'));
  });

  it('server row wins on same id', () => {
    const baseline = agreement('same', { sellingPrice: 100 });
    const server = agreement('same', { sellingPrice: 200, version: 2 });
    const merged = mergeProjectAgreementsWithServerBaseline([baseline], [server]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].sellingPrice, 200);
  });
});

describe('mergePartialStateIntoBaseline', () => {
  it('retains optimistic tx when partial overwrites transactions array', () => {
    const optimistic = tx('opt-partial', { version: undefined });
    const base = appStateWithTransactions([optimistic, tx('keep-me', { version: 1 })]);
    const merged = mergePartialStateIntoBaseline(base, {
      transactions: [tx('from-server', { version: 1 })],
    });
    assert.ok(merged.transactions.some((t) => t.id === 'opt-partial'));
    assert.ok(merged.transactions.some((t) => t.id === 'from-server'));
    assert.ok(merged.transactions.some((t) => t.id === 'keep-me'));
  });

  it('retains saved project agreement when stale partial omits it', () => {
    const saved = agreement('agr-new', { version: 1 });
    const base = appStateWithProjectAgreements([saved, agreement('agr-existing', { version: 1 })]);
    const merged = mergePartialStateIntoBaseline(base, {
      projectAgreements: [agreement('agr-existing', { version: 1 })],
    });
    assert.equal(merged.projectAgreements.filter((a) => a.id === 'agr-new').length, 1);
  });

  it('preserves projectAgreements when partial omits the key', () => {
    const saved = agreement('agr-keep', { version: 1 });
    const base = appStateWithProjectAgreements([saved]);
    const merged = mergePartialStateIntoBaseline(base, { transactions: [] });
    assert.equal(merged.projectAgreements.length, 1);
    assert.equal(merged.projectAgreements[0].id, 'agr-keep');
  });

  it('invoice merge unchanged — drops versioned invoice missing from server', () => {
    const inv: Invoice = {
      id: 'inv-del',
      invoiceNumber: 'INV-1',
      amount: 1000,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      issueDate: '2026-06-01',
      dueDate: '2026-06-30',
      invoiceType: InvoiceType.RENTAL,
      version: 2,
    };
    const merged = mergeInvoicesWithServerBaseline([inv], []);
    assert.equal(merged.length, 0);
  });

  it('bill merge unchanged — drops versioned bill missing from server', () => {
    const bill: Bill = {
      id: 'bill-del',
      billNumber: 'BILL-1',
      amount: 500,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      issueDate: '2026-06-01',
      dueDate: '2026-06-30',
      version: 2,
    };
    const merged = mergeBillsWithServerBaseline([bill], []);
    assert.equal(merged.length, 0);
  });

  it('payment survives stale full refresh then server catch-up without duplicates', () => {
    const paymentId = 'pay-case-11';
    const otherId = 'tx-other';
    const socketPayment = tx(paymentId, { version: 1, amount: 5000, description: 'socket' });
    const clientState = appStateWithTransactions([socketPayment]);

    const afterStaleRefresh = mergePartialStateIntoBaseline(clientState, {
      transactions: [tx(otherId, { version: 1 })],
    });
    assert.equal(afterStaleRefresh.transactions.filter((t) => t.id === paymentId).length, 1);

    const serverPayment = tx(paymentId, { version: 1, amount: 5000, description: 'from server' });
    const afterCatchUp = mergePartialStateIntoBaseline(afterStaleRefresh, {
      transactions: [serverPayment, tx(otherId, { version: 1 })],
    });

    const payments = afterCatchUp.transactions.filter((t) => t.id === paymentId);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].description, 'from server');
  });
});
