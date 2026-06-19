import type {
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
  Vendor,
} from '../types';
import { buildSearchRows, type BuiltSearchRow } from '../components/layout/searchModalResults';

export type { BuiltSearchRow };

export interface SearchEntitySnapshot {
  transactions: Transaction[];
  bills: Bill[];
  contracts: Contract[];
  projectAgreements: ProjectAgreement[];
  rentalAgreements: RentalAgreement[];
  contacts: Contact[];
  accounts: Account[];
  categories: Category[];
  projects: Project[];
  buildings: Building[];
  properties: Property[];
  units: Unit[];
  vendors: Vendor[] | undefined;
}

export interface SearchLookupMaps {
  accountById: Map<string, { name?: string }>;
  categoryById: Map<string, { name?: string }>;
  contactById: Map<string, Contact>;
  vendorById: Map<string, { name?: string }>;
  contractById: Map<string, Contract>;
}

function maxTimestamp(items: { updatedAt?: string; createdAt?: string }[]): string {
  let max = '';
  for (const item of items) {
    const ts = item.updatedAt || item.createdAt || '';
    if (ts > max) max = ts;
  }
  return max;
}

/** Stable fingerprint — rebuild lookup maps only when entity data shape changes. */
export function computeSearchEntityFingerprint(data: SearchEntitySnapshot): string {
  return [
    data.transactions.length,
    maxTimestamp(data.transactions),
    data.bills.length,
    maxTimestamp(data.bills),
    data.contracts.length,
    maxTimestamp(data.contracts),
    data.projectAgreements.length,
    maxTimestamp(data.projectAgreements),
    data.rentalAgreements.length,
    maxTimestamp(data.rentalAgreements),
    data.contacts.length,
    maxTimestamp(data.contacts),
    data.accounts.length,
    maxTimestamp(data.accounts),
    data.categories.length,
    maxTimestamp(data.categories),
    data.projects.length,
    maxTimestamp(data.projects),
    data.buildings.length,
    maxTimestamp(data.buildings),
    data.properties.length,
    maxTimestamp(data.properties),
    data.units.length,
    maxTimestamp(data.units),
    data.vendors?.length ?? 0,
  ].join('|');
}

function buildLookupMaps(data: SearchEntitySnapshot): SearchLookupMaps {
  const accountById = new Map<string, { name?: string }>();
  for (const a of data.accounts) accountById.set(a.id, a);

  const categoryById = new Map<string, { name?: string }>();
  for (const c of data.categories) categoryById.set(c.id, c);

  const contactById = new Map<string, Contact>();
  for (const c of data.contacts) contactById.set(c.id, c);

  const vendorById = new Map<string, { name?: string }>();
  for (const v of data.vendors ?? []) {
    if (v?.id) vendorById.set(v.id, v);
  }

  const contractById = new Map<string, Contract>();
  for (const x of data.contracts) contractById.set(x.id, x);

  return { accountById, categoryById, contactById, vendorById, contractById };
}

let cachedFingerprint = '';
let cachedLookupMaps: SearchLookupMaps | null = null;

export function getCachedSearchLookupMaps(
  data: SearchEntitySnapshot,
  fingerprint: string
): SearchLookupMaps {
  if (fingerprint === cachedFingerprint && cachedLookupMaps) {
    return cachedLookupMaps;
  }
  cachedFingerprint = fingerprint;
  cachedLookupMaps = buildLookupMaps(data);
  return cachedLookupMaps;
}

export function buildSearchRowsWithIndex(
  query: string,
  data: SearchEntitySnapshot
): BuiltSearchRow[] {
  const fingerprint = computeSearchEntityFingerprint(data);
  const maps = getCachedSearchLookupMaps(data, fingerprint);
  return buildSearchRows(query, {
    transactions: data.transactions,
    bills: data.bills,
    contracts: data.contracts,
    contractById: maps.contractById,
    projectAgreements: data.projectAgreements,
    rentalAgreements: data.rentalAgreements,
    contacts: data.contacts,
    accounts: data.accounts,
    categories: data.categories,
    projects: data.projects,
    buildings: data.buildings,
    properties: data.properties,
    units: data.units,
    accountById: maps.accountById,
    categoryById: maps.categoryById,
    contactById: maps.contactById,
    vendorById: maps.vendorById,
  });
}
