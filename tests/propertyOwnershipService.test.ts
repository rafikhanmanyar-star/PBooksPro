/**
 * Property co-ownership resolution and transfer logic.
 */
import assert from 'node:assert';
import type { AppState, Property } from '../types';
import { TransactionType } from '../types';
import {
  applyOwnershipTransferToState,
  getOwnershipSharesForPropertyOnDate,
  hasMultipleOwnersOnDate,
  validateOwnershipSharesTotal,
} from '../services/propertyOwnershipService';

function minimalProperty(id: string, ownerId: string): Property {
  return { id, name: 'U1', ownerId, buildingId: 'b1' };
}

function baseState(): AppState {
  return {
    users: [],
    currentUser: null,
    accounts: [],
    contacts: [],
    vendors: [],
    categories: [],
    projects: [],
    buildings: [],
    properties: [minimalProperty('p1', 'o1')],
    propertyOwnershipHistory: [],
    propertyOwnership: [
      {
        id: 'po1',
        tenantId: 'local',
        propertyId: 'p1',
        ownerId: 'o1',
        ownershipPercentage: 100,
        startDate: '2000-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    units: [],
    transactions: [],
    invoices: [],
    bills: [],
    quotations: [],
    documents: [],
    budgets: [],
    rentalAgreements: [],
    projectAgreements: [],
    salesReturns: [],
    projectReceivedAssets: [],
    contracts: [],
    personalCategories: [],
    personalTransactions: [],
    recurringInvoiceTemplates: [],
    pmCycleAllocations: [],
    agreementSettings: { prefix: 'A', nextNumber: 1, padding: 1 },
    projectAgreementSettings: { prefix: 'A', nextNumber: 1, padding: 1 },
    rentalInvoiceSettings: { prefix: 'I', nextNumber: 1, padding: 1 },
    projectInvoiceSettings: { prefix: 'I', nextNumber: 1, padding: 1 },
    printSettings: {} as AppState['printSettings'],
    whatsAppTemplates: {} as AppState['whatsAppTemplates'],
    dashboardConfig: { visibleKpis: [] },
    accountConsistency: { actualByAccountId: {} },
    installmentPlans: [],
    planAmenities: [],
    showSystemTransactions: false,
    enableColorCoding: false,
    enableBeepOnSave: false,
    enableDatePreservation: false,
    whatsAppMode: 'manual',
    pmCostPercentage: 0,
    transactionLog: [],
    errorLog: [],
    currentPage: 'dashboard',
    editingEntity: null,
    initialTransactionType: null,
    initialTransactionFilter: null,
    initialTabs: [],
  } as AppState;
}

{
  const st = baseState();
  const shares = getOwnershipSharesForPropertyOnDate(st, 'p1', '2024-06-15');
  assert.equal(shares.length, 1);
  assert.equal(shares[0].ownerId, 'o1');
  assert.equal(shares[0].percentage, 100);
}

{
  const st = baseState();
  st.propertyOwnership = [
    ...st.propertyOwnership,
    {
      id: 'po2',
      tenantId: 'local',
      propertyId: 'p1',
      ownerId: 'o2',
      ownershipPercentage: 40,
      startDate: '2024-01-01',
      endDate: null,
      isActive: true,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
  ];
  st.propertyOwnership![0].ownershipPercentage = 60;
  assert.ok(hasMultipleOwnersOnDate(st, 'p1', '2024-06-15'));
  const s = getOwnershipSharesForPropertyOnDate(st, 'p1', '2024-06-15');
  assert.equal(s.length, 2);
}

{
  const err = validateOwnershipSharesTotal([
    { ownerId: 'a', percentage: 50 },
    { ownerId: 'b', percentage: 40 },
  ]);
  assert.ok(err);
}

{
  let st = baseState();
  st = applyOwnershipTransferToState(st, {
    propertyId: 'p1',
    transferDate: '2025-03-15',
    newOwners: [
      { ownerId: 'o1', percentage: 60 },
      { ownerId: 'o2', percentage: 40 },
    ],
    tenantId: 'local',
  });
  assert.equal(st.properties.find((p) => p.id === 'p1')?.ownerId, 'o1');
  const active = st.propertyOwnership!.filter((r) => r.propertyId === 'p1' && r.isActive);
  assert.equal(active.length, 2);
  assert.ok(!hasMultipleOwnersOnDate(st, 'p1', '2025-03-01'));
  assert.ok(hasMultipleOwnersOnDate(st, 'p1', '2025-03-15'));
}

{
  const st = baseState();
  const next = applyOwnershipTransferToState(st, {
    propertyId: 'p1',
    transferDate: '2025-03-15',
    newOwners: [
      { ownerId: 'o1', percentage: 60 },
      { ownerId: 'o2', percentage: 40 },
    ],
    tenantId: 'local',
  });
  const grossRent = {
    id: 'tx1',
    type: TransactionType.INCOME,
    amount: 1000,
    date: '2025-03-10T12:00:00.000Z',
    accountId: 'bank',
    categoryId: 'cat-rent',
    propertyId: 'p1',
  } as any;
  const st2 = { ...next, transactions: [grossRent] };
  assert.ok(!hasMultipleOwnersOnDate(st2, 'p1', '2025-03-10'));
}
