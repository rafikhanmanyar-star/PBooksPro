/**
 * Service charge deduction report — shared between UI (local mode) and API server bundle.
 */

export type ServiceChargeDeductionRow = {
  id: string;
  date: string;
  buildingName: string;
  propertyName: string;
  ownerName: string;
  particulars: string;
  amount: number;
  entityType: 'transaction';
  entityId: string;
};

export type ServiceChargeDeductionSortKey =
  | 'date'
  | 'buildingName'
  | 'propertyName'
  | 'ownerName'
  | 'particulars'
  | 'amount';

export type ServiceChargeDeductionFilters = {
  startDate: string;
  endDate: string;
  selectedBuildingId?: string;
  selectedOwnerId?: string;
  searchQuery?: string;
  sortKey?: ServiceChargeDeductionSortKey;
  sortDirection?: 'asc' | 'desc';
};

type TxLike = {
  id: string;
  date: string;
  type: string;
  amount: number;
  categoryId?: string;
  propertyId?: string;
  buildingId?: string;
  contactId?: string;
  description?: string;
};

type CategoryLike = { id: string; name: string; type: string };
type PropertyLike = { id: string; name: string; buildingId?: string; ownerId?: string };
type BuildingLike = { id: string; name: string };
type ContactLike = { id: string; name: string; type: string };

export type ServiceChargeDeductionStateInput = {
  transactions: TxLike[];
  categories: CategoryLike[];
  properties: PropertyLike[];
  buildings: BuildingLike[];
  contacts: ContactLike[];
};

export function computeServiceChargesDeductionReport(
  state: ServiceChargeDeductionStateInput,
  filters: ServiceChargeDeductionFilters
): ServiceChargeDeductionRow[] {
  const { transactions, categories, properties, buildings, contacts } = state;
  const start = new Date(filters.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(filters.endDate);
  end.setHours(23, 59, 59, 999);

  const selectedBuildingId = filters.selectedBuildingId ?? 'all';
  const selectedOwnerId = filters.selectedOwnerId ?? 'all';
  const searchQuery = (filters.searchQuery ?? '').trim().toLowerCase();
  const sortConfig =
    filters.sortKey != null
      ? { key: filters.sortKey, direction: filters.sortDirection ?? 'desc' as const }
      : ({ key: 'date' as const, direction: 'desc' as const });

  const rentalIncomeCatId = categories.find((c) => c.name === 'Rental Income')?.id;

  const deductionCategoryIds = new Set(
    categories
      .filter(
        (c) => c.type === 'Expense' && c.name.toLowerCase().includes('service charge')
      )
      .map((c) => c.id)
  );
  const legacyId = categories.find((c) => c.name === 'Service Charge Deduction')?.id;
  if (legacyId) deductionCategoryIds.add(legacyId);

  const rows: ServiceChargeDeductionRow[] = [];

  for (const tx of transactions) {
    const date = new Date(tx.date);
    if (date < start || date > end) continue;

    let isDeduction = false;
    let amount = 0;

    if (tx.type === 'Income' && tx.categoryId === rentalIncomeCatId && tx.amount < 0) {
      isDeduction = true;
      amount = Math.abs(tx.amount);
    } else if (tx.type === 'Expense' && tx.categoryId && deductionCategoryIds.has(tx.categoryId)) {
      isDeduction = true;
      amount = tx.amount;
    }

    if (!isDeduction) continue;

    const property = properties.find((p) => p.id === tx.propertyId);
    const building = buildings.find((b) => b.id === (tx.buildingId || property?.buildingId));
    const owner = contacts.find((c) => c.id === (tx.contactId || property?.ownerId));

    if (selectedBuildingId !== 'all' && building?.id !== selectedBuildingId) continue;
    if (selectedOwnerId !== 'all' && owner?.id !== selectedOwnerId) continue;

    rows.push({
      id: tx.id,
      date: tx.date,
      buildingName: building?.name || 'Unknown',
      propertyName: property?.name || 'Unknown',
      ownerName: owner?.name || 'Unknown',
      particulars: tx.description || 'Service Charge Deduction',
      amount,
      entityType: 'transaction',
      entityId: tx.id,
    });
  }

  rows.sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];

    if (sortConfig.key === 'date') {
      return sortConfig.direction === 'asc'
        ? new Date(aVal as string).getTime() - new Date(bVal as string).getTime()
        : new Date(bVal as string).getTime() - new Date(aVal as string).getTime();
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  if (!searchQuery) return rows;
  return rows.filter(
    (r) =>
      r.ownerName.toLowerCase().includes(searchQuery) ||
      r.propertyName.toLowerCase().includes(searchQuery)
  );
}
