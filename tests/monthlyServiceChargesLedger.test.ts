import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransactionType } from '../types';
import type { Transaction } from '../types';
import { buildServiceChargeIndexes } from '../services/monthlyServiceChargesLedger';

test('buildServiceChargeIndexes aggregates by property and month', () => {
    const svcId = 'svc-cat';
    const propertiesById = new Map([
        ['p1', { ownerId: 'o1' }],
        ['p2', { ownerId: 'o1' }],
    ]);
    const transactions: Transaction[] = [
        {
            id: 't1',
            type: TransactionType.INCOME,
            categoryId: svcId,
            propertyId: 'p1',
            date: '2026-03-15',
            amount: 100,
        } as Transaction,
        {
            id: 't2',
            type: TransactionType.INCOME,
            categoryId: svcId,
            propertyId: 'p1',
            date: '2026-03-20',
            amount: 50,
        } as Transaction,
        {
            id: 't3',
            type: TransactionType.INCOME,
            categoryId: svcId,
            propertyId: 'p2',
            date: '2026-04-01',
            amount: 200,
        } as Transaction,
    ];

    const idx = buildServiceChargeIndexes(transactions, svcId, propertiesById);

    assert.equal(idx.portfolioScAllTime, 350);
    assert.equal(idx.scTotalByProperty.get('p1'), 150);
    assert.equal(idx.scTotalByProperty.get('p2'), 200);
    assert.equal(idx.scTotalByPropertyMonth.get('p1|2026-03'), 150);
    assert.equal(idx.portfolioScByMonth.get('2026-03'), 150);
    assert.equal(idx.portfolioScByMonth.get('2026-04'), 200);
    assert(idx.propertyHasScIncome.has('p1'));
    assert(idx.propertyMonthsWithSc.get('p1')?.has('2026-03'));
    assert.equal(idx.ownerMonthScTotal.get('o1|2026-03'), 150);
    assert.equal(idx.ownerMonthScTotal.get('o1|2026-04'), 200);
});
