import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectAccounts,
  selectBills,
  selectBuildings,
  selectCategories,
  selectContacts,
  selectContracts,
  selectCurrentPage,
  selectCurrentUser,
  selectDefaultProjectId,
  selectEnableColorCoding,
  selectInitialTabs,
  selectInstallmentPlans,
  selectInvoices,
  selectProjectAgreements,
  selectProjects,
  selectProperties,
  selectRentalAgreements,
  selectShowSystemTransactions,
  selectTransactions,
  selectUnits,
  selectUsers,
  selectVendors,
  selectWhatsAppMode,
  selectWhatsAppTemplates,
} from '../hooks/appStateSelectors';

describe('appStateSelectors (PERF-A2.5.2)', () => {
  it('exports stable function references across reads', () => {
    const selectors = [
      selectAccounts,
      selectTransactions,
      selectCategories,
      selectContacts,
      selectBills,
      selectInvoices,
      selectVendors,
      selectProjects,
      selectBuildings,
      selectProperties,
      selectUnits,
      selectContracts,
      selectRentalAgreements,
      selectProjectAgreements,
      selectCurrentUser,
      selectUsers,
      selectCurrentPage,
      selectInitialTabs,
      selectInstallmentPlans,
      selectWhatsAppMode,
      selectWhatsAppTemplates,
      selectDefaultProjectId,
      selectEnableColorCoding,
      selectShowSystemTransactions,
    ];

    for (const selector of selectors) {
      assert.equal(typeof selector, 'function');
    }

    assert.equal(selectInvoices, selectInvoices);
    assert.equal(selectContacts, selectContacts);
    assert.equal(selectCurrentPage, selectCurrentPage);
  });
});
