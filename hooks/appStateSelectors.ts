/**
 * Stable module-level selectors for useStateSelector().
 * PERF-A2.5.2 — avoid inline `(s) => s.field` which allocates a new function each render.
 */
import type { AppState } from '../types';

export const selectAccounts = (s: AppState) => s.accounts;
export const selectTransactions = (s: AppState) => s.transactions;
export const selectCategories = (s: AppState) => s.categories;
export const selectContacts = (s: AppState) => s.contacts;
export const selectBills = (s: AppState) => s.bills;
export const selectInvoices = (s: AppState) => s.invoices;
export const selectVendors = (s: AppState) => s.vendors;
export const selectProjects = (s: AppState) => s.projects;
export const selectBuildings = (s: AppState) => s.buildings;
export const selectProperties = (s: AppState) => s.properties;
export const selectUnits = (s: AppState) => s.units;
export const selectContracts = (s: AppState) => s.contracts;
export const selectRentalAgreements = (s: AppState) => s.rentalAgreements;
export const selectProjectAgreements = (s: AppState) => s.projectAgreements;
export const selectCurrentUser = (s: AppState) => s.currentUser;
export const selectUsers = (s: AppState) => s.users;
export const selectCurrentPage = (s: AppState) => s.currentPage;
export const selectInitialTabs = (s: AppState) => s.initialTabs;
export const selectInstallmentPlans = (s: AppState) => s.installmentPlans;
export const selectWhatsAppMode = (s: AppState) => s.whatsAppMode;
export const selectWhatsAppTemplates = (s: AppState) => s.whatsAppTemplates;
export const selectDefaultProjectId = (s: AppState) => s.defaultProjectId;
export const selectEnableColorCoding = (s: AppState) => s.enableColorCoding;
export const selectShowSystemTransactions = (s: AppState) => s.showSystemTransactions;
