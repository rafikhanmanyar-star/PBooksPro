import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransactionType } from '../types';
import type { AppState, Transaction } from '../types';
import { buildServiceChargeIndexes } from '../services/monthlyServiceChargesLedger';

test('buildServiceChargeIndexes aggregates by property and month', () => {
    const svcId = 'svc-cat';
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

    const state = {
        properties: [
            { id: 'p1', ownerId: 'o2' },
            { id: 'p2', ownerId: 'o1' },
        ],
        propertyOwnership: [
            {
                id: 'po-1',
                propertyId: 'p1',
                ownerId: 'o1',
                ownershipPercentage: 100,
                startDate: '2026-01-01',
                endDate: '2026-03-31',
                isActive: false,
            },
            {
                id: 'po-2',
                propertyId: 'p1',
                ownerId: 'o2',
                ownershipPercentage: 100,
                startDate: '2026-04-01',
                endDate: null,
                isActive: true,
            },
            {
                id: 'po-3',
                propertyId: 'p2',
                ownerId: 'o1',
                ownershipPercentage: 100,
                startDate: '2026-01-01',
                endDate: null,
                isActive: true,
            },
        ],
        propertyOwnershipHistory: [],
        invoices: [],
        rentalAgreements: [],
    } as unknown as Pick<AppState, 'properties' | 'propertyOwnership' | 'propertyOwnershipHistory' | 'invoices' | 'rentalAgreements'>;

    const idx = buildServiceChargeIndexes(transactions, svcId, state);

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
    assert.equal(idx.ownerMonthScTotal.get('o2|2026-04') || 0, 0);
});
