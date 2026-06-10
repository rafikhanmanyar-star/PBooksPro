import type {
  Page,
  Transaction,
  Bill,
  Contract,
  RentalAgreement,
  ProjectAgreement,
  Contact,
  Account,
  Category,
  Project,
  Building,
  Property,
  Unit,
} from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { reportDefinitions } from '../reports/reportDefinitions';
import { NAVIGATION_ITEMS, SETTINGS_SECTIONS, matchesSearchQuery } from './globalSearchIndex';

export interface BuiltSearchRow {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  /** sessionStorage key/value set before navigation */
  session?: { key: string; value: string };
  /** Target page for SET_PAGE */
  page: Page;
  /** Optional: editing entity (e.g. contact in settings) */
  editing?: { type: string; id: string };
  /** Optional: module sub-tabs (reports, rental views, etc.) */
  initialTabs?: string[];
  /** Optional: settings sidebar category id */
  settingsCategory?: string;
}

interface SearchBuildContext {
  transactions: Transaction[];
  bills: Bill[];
  contracts: Contract[];
  contractById: Map<string, Contract>;
  projectAgreements: ProjectAgreement[];
  rentalAgreements: RentalAgreement[];
  contacts: Contact[];
  accounts: Account[];
  categories: Category[];
  projects: Project[];
  buildings: Building[];
  properties: Property[];
  units: Unit[];
  accountById: Map<string, { name?: string }>;
  categoryById: Map<string, { name?: string }>;
  contactById: Map<string, Contact>;
  vendorById: Map<string, { name?: string }>;
}

const MAX_RESULTS = 40;

function pushRow(results: BuiltSearchRow[], row: BuiltSearchRow): boolean {
  if (results.length >= MAX_RESULTS) return false;
  results.push(row);
  return true;
}

function searchNavigation(q: string, results: BuiltSearchRow[]): void {
  for (const item of NAVIGATION_ITEMS) {
    if (results.length >= MAX_RESULTS) break;
    if (
      matchesSearchQuery(q, item.label, item.subtitle, ...(item.keywords ?? []))
    ) {
      pushRow(results, {
        id: item.id,
        type: 'Page',
        title: item.label,
        subtitle: item.subtitle,
        page: item.page,
        initialTabs: item.initialTabs,
      });
    }
  }
}

function searchSettings(q: string, results: BuiltSearchRow[]): void {
  for (const item of SETTINGS_SECTIONS) {
    if (results.length >= MAX_RESULTS) break;
    if (matchesSearchQuery(q, item.label, item.subtitle, ...(item.keywords ?? []))) {
      pushRow(results, {
        id: item.id,
        type: 'Settings',
        title: item.label,
        subtitle: item.subtitle,
        page: 'settings',
        settingsCategory: item.categoryId,
      });
    }
  }
}

function searchReports(q: string, results: BuiltSearchRow[]): void {
  for (const report of reportDefinitions) {
    if (results.length >= MAX_RESULTS) break;
    if (matchesSearchQuery(q, report.title, report.group, report.id.replace(/-/g, ' '))) {
      pushRow(results, {
        id: `report-${report.id}`,
        type: 'Report',
        title: report.title,
        subtitle: `${report.group} report`,
        page: report.path,
        initialTabs: report.subPath ? report.subPath.split(':') : undefined,
      });
    }
  }
}

function searchContacts(q: string, c: SearchBuildContext, results: BuiltSearchRow[]): void {
  let count = 0;
  for (const contact of c.contacts) {
    if (count >= 8 || results.length >= MAX_RESULTS) break;
    const name = contact.name?.toLowerCase() || '';
    const description = contact.description?.toLowerCase() || '';
    const type = contact.type?.toLowerCase() || '';
    if (name.includes(q) || description.includes(q) || type.includes(q)) {
      count += 1;
      pushRow(results, {
        id: `contact-${contact.id}`,
        type: contact.type || 'Contact',
        title: contact.name || 'No name',
        subtitle: contact.description || contact.type || '',
        page: 'settings',
        settingsCategory: 'contacts',
        editing: { type: `CONTACT_${contact.type}`, id: contact.id },
      });
    }
  }
}

function searchAccountsAndCategories(q: string, c: SearchBuildContext, results: BuiltSearchRow[]): void {
  let accountCount = 0;
  for (const account of c.accounts) {
    if (accountCount >= 6 || results.length >= MAX_RESULTS) break;
    const name = account.name?.toLowerCase() || '';
    const type = account.type?.toLowerCase() || '';
    if (name.includes(q) || type.includes(q)) {
      accountCount += 1;
      pushRow(results, {
        id: `account-${account.id}`,
        type: 'Account',
        title: account.name || 'Unnamed account',
        subtitle: account.type || 'Chart of accounts',
        page: 'settings',
        settingsCategory: 'accounts',
        editing: { type: 'account', id: account.id },
      });
    }
  }

  let categoryCount = 0;
  for (const category of c.categories) {
    if (categoryCount >= 4 || results.length >= MAX_RESULTS) break;
    const name = category.name?.toLowerCase() || '';
    const type = category.type?.toLowerCase() || '';
    if (name.includes(q) || type.includes(q)) {
      categoryCount += 1;
      pushRow(results, {
        id: `category-${category.id}`,
        type: 'Category',
        title: category.name || 'Unnamed category',
        subtitle: category.type || 'Chart of accounts',
        page: 'settings',
        settingsCategory: 'accounts',
        editing: { type: 'category', id: category.id },
      });
    }
  }
}

function searchAssets(q: string, c: SearchBuildContext, results: BuiltSearchRow[]): void {
  let projectCount = 0;
  for (const project of c.projects) {
    if (projectCount >= 4 || results.length >= MAX_RESULTS) break;
    const name = project.name?.toLowerCase() || '';
    const location = project.location?.toLowerCase() || '';
    if (name.includes(q) || location.includes(q)) {
      projectCount += 1;
      pushRow(results, {
        id: `project-${project.id}`,
        type: 'Project',
        title: project.name || 'Unnamed project',
        subtitle: project.location || 'Asset',
        page: 'settings',
        settingsCategory: 'assets',
        editing: { type: 'project', id: project.id },
      });
    }
  }

  let buildingCount = 0;
  for (const building of c.buildings) {
    if (buildingCount >= 3 || results.length >= MAX_RESULTS) break;
    if (building.name?.toLowerCase().includes(q)) {
      buildingCount += 1;
      pushRow(results, {
        id: `building-${building.id}`,
        type: 'Building',
        title: building.name || 'Unnamed building',
        subtitle: 'Asset',
        page: 'settings',
        settingsCategory: 'assets',
        editing: { type: 'building', id: building.id },
      });
    }
  }

  let propertyCount = 0;
  for (const property of c.properties) {
    if (propertyCount >= 3 || results.length >= MAX_RESULTS) break;
    const name = property.name?.toLowerCase() || '';
    if (name.includes(q)) {
      propertyCount += 1;
      pushRow(results, {
        id: `property-${property.id}`,
        type: 'Property',
        title: property.name || 'Unnamed property',
        subtitle: 'Asset',
        page: 'settings',
        settingsCategory: 'assets',
        editing: { type: 'property', id: property.id },
      });
    }
  }

  let unitCount = 0;
  for (const unit of c.units) {
    if (unitCount >= 3 || results.length >= MAX_RESULTS) break;
    const name = unit.name?.toLowerCase() || '';
    const unitType = unit.type?.toLowerCase() || '';
    if (name.includes(q) || unitType.includes(q)) {
      unitCount += 1;
      pushRow(results, {
        id: `unit-${unit.id}`,
        type: 'Unit',
        title: unit.name || 'Unnamed unit',
        subtitle: unit.type || 'Asset',
        page: 'settings',
        settingsCategory: 'assets',
        editing: { type: 'unit', id: unit.id },
      });
    }
  }
}

function searchTransactions(q: string, c: SearchBuildContext, results: BuiltSearchRow[]): void {
  let count = 0;
  for (const tx of c.transactions) {
    if (count >= 8 || results.length >= MAX_RESULTS) break;
    const description = tx.description?.toLowerCase() || '';
    const account = c.accountById.get(tx.accountId || '')?.name?.toLowerCase() || '';
    const cat = c.categoryById.get(tx.categoryId || '')?.name?.toLowerCase() || '';
    const contact = c.contactById.get(tx.contactId || '')?.name?.toLowerCase() || '';
    const amount = tx.amount.toString();
    if (description.includes(q) || account.includes(q) || cat.includes(q) || contact.includes(q) || amount.includes(q)) {
      count += 1;
      const accName = c.accountById.get(tx.accountId || '')?.name || 'Unknown';
      pushRow(results, {
        id: `tx-${tx.id}`,
        type: 'Transaction',
        title: tx.description || 'No description',
        subtitle: `${accName} · ${CURRENCY}${tx.amount.toFixed(2)} · ${formatDate(tx.date)}`,
        session: { key: 'openTransactionId', value: tx.id },
        page: 'transactions',
      });
    }
  }
}

function searchBills(q: string, c: SearchBuildContext, results: BuiltSearchRow[]): void {
  let count = 0;
  for (const bill of c.bills) {
    if (count >= 6 || results.length >= MAX_RESULTS) break;
    const billNumber = bill.billNumber?.toLowerCase() || '';
    const description = bill.description?.toLowerCase() || '';
    const vendorFromContact = bill.contactId ? c.contactById.get(bill.contactId)?.name?.toLowerCase() : '';
    const vendorFromVendor = bill.vendorId ? c.vendorById.get(bill.vendorId)?.name?.toLowerCase() : '';
    const vendor = vendorFromContact || vendorFromVendor || '';
    const contract = (bill.contractId ? c.contractById.get(bill.contractId)?.name : undefined)?.toLowerCase() || '';
    const amount = bill.amount.toString();
    if (billNumber.includes(q) || description.includes(q) || vendor.includes(q) || contract.includes(q) || amount.includes(q)) {
      count += 1;
      const vendorName =
        (bill.vendorId ? c.vendorById.get(bill.vendorId)?.name : undefined) ||
        (bill.contactId ? c.contactById.get(bill.contactId)?.name : undefined) ||
        'Unknown';
      pushRow(results, {
        id: `bill-${bill.id}`,
        type: 'Bill',
        title: bill.billNumber || 'No number',
        subtitle: `${vendorName} · ${CURRENCY}${bill.amount.toFixed(2)} · ${formatDate(bill.issueDate)}`,
        session: { key: 'openBillId', value: bill.id },
        page: 'bills',
      });
    }
  }
}

function searchContractsAndAgreements(q: string, c: SearchBuildContext, results: BuiltSearchRow[]): void {
  let contractCount = 0;
  for (const contract of c.contracts) {
    if (contractCount >= 4 || results.length >= MAX_RESULTS) break;
    const contractNumber = contract.contractNumber?.toLowerCase() || '';
    const name = contract.name?.toLowerCase() || '';
    const vendor = c.vendorById.get(contract.vendorId || '')?.name?.toLowerCase() || '';
    if (contractNumber.includes(q) || name.includes(q) || vendor.includes(q)) {
      contractCount += 1;
      const vendorName = c.vendorById.get(contract.vendorId || '')?.name || 'Unknown';
      pushRow(results, {
        id: `contract-${contract.id}`,
        type: 'Contract',
        title: contract.name || contract.contractNumber || 'No name',
        subtitle: `${vendorName} · ${CURRENCY}${contract.totalAmount.toFixed(2)}`,
        session: { key: 'openContractId', value: contract.id },
        page: 'projectManagement',
      });
    }
  }

  let agreementCount = 0;
  for (const agreement of c.projectAgreements) {
    if (agreementCount >= 4 || results.length >= MAX_RESULTS) break;
    const agreementNumber = agreement.agreementNumber?.toLowerCase() || '';
    const client = c.contactById.get(agreement.clientId || '')?.name?.toLowerCase() || '';
    if (agreementNumber.includes(q) || client.includes(q)) {
      agreementCount += 1;
      const clientName = c.contactById.get(agreement.clientId || '')?.name || 'Unknown';
      pushRow(results, {
        id: `project-agreement-${agreement.id}`,
        type: 'Project Agreement',
        title: agreement.agreementNumber || 'No number',
        subtitle: `${clientName} · ${CURRENCY}${agreement.sellingPrice.toFixed(2)}`,
        session: { key: 'openProjectAgreementId', value: agreement.id },
        page: 'projectManagement',
      });
    }
  }

  let rentalCount = 0;
  for (const agreement of c.rentalAgreements) {
    if (rentalCount >= 4 || results.length >= MAX_RESULTS) break;
    const agreementNumber = agreement.agreementNumber?.toLowerCase() || '';
    const tenant = c.contactById.get(agreement.contactId || '')?.name?.toLowerCase() || '';
    if (agreementNumber.includes(q) || tenant.includes(q)) {
      rentalCount += 1;
      const tenantName = c.contactById.get(agreement.contactId || '')?.name || 'Unknown';
      pushRow(results, {
        id: `rental-agreement-${agreement.id}`,
        type: 'Rental Agreement',
        title: agreement.agreementNumber || 'No number',
        subtitle: `${tenantName} · ${CURRENCY}${agreement.monthlyRent.toFixed(2)}/month`,
        session: { key: 'openRentalAgreementId', value: agreement.id },
        page: 'rentalAgreements',
      });
    }
  }
}

function searchVendors(q: string, c: SearchBuildContext, results: BuiltSearchRow[]): void {
  let count = 0;
  for (const contact of c.contacts) {
    if (count >= 4 || results.length >= MAX_RESULTS) break;
    const isVendor = contact.type?.toLowerCase().includes('vendor');
    if (!isVendor) continue;
    const name = contact.name?.toLowerCase() || '';
    if (name.includes(q)) {
      count += 1;
      pushRow(results, {
        id: `vendor-${contact.id}`,
        type: 'Vendor',
        title: contact.name || 'No name',
        subtitle: 'Vendor directory',
        session: { key: 'openVendorId', value: contact.id },
        page: 'vendorDirectory',
      });
    }
  }
}

/**
 * Global app search — pages, settings, reports, and entity records.
 */
export function buildSearchRows(rawQuery: string, c: SearchBuildContext): BuiltSearchRow[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const results: BuiltSearchRow[] = [];

  searchNavigation(q, results);
  searchSettings(q, results);
  searchReports(q, results);
  searchContacts(q, c, results);
  searchAccountsAndCategories(q, c, results);
  searchAssets(q, c, results);
  searchTransactions(q, c, results);
  searchBills(q, c, results);
  searchContractsAndAgreements(q, c, results);
  searchVendors(q, c, results);

  return results;
}
