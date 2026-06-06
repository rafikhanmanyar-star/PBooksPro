import { TransactionType, ContactType, type AppState } from '../../types';
import { buildLedgerOwnerIdsByPropertyId } from '../../services/propertyOwnershipService';

export interface SecurityDepositRow {
    id: string;
    date: string;
    ownerName: string;
    tenantName: string;
    propertyName: string;
    buildingName: string;
    particulars: string;
    depositIn: number;
    refundOut: number;
    balance: number;
    entityType: 'transaction';
    entityId: string;
}

export type SecurityDepositSortKey =
    | 'date'
    | 'ownerName'
    | 'tenantName'
    | 'propertyName'
    | 'buildingName'
    | 'particulars'
    | 'depositIn'
    | 'refundOut'
    | 'balance';

export type SecurityDepositReportRow = SecurityDepositRow & { balance: number };

export function computeOwnerSecurityDepositReport(
    state: AppState,
    filters: {
        startDate: string;
        endDate: string;
        selectedBuildingId: string;
        selectedOwnerId: string;
        selectedUnitId: string;
        sortConfig: { key: SecurityDepositSortKey; direction: 'asc' | 'desc' };
        searchQuery?: string;
    }
): SecurityDepositReportRow[] {
    const {
        startDate,
        endDate,
        selectedBuildingId,
        selectedOwnerId,
        selectedUnitId,
        sortConfig,
        searchQuery = '',
    } = filters;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const securityDepositCategory = state.categories.find((c) => c.name === 'Security Deposit');
    const refundCategory = state.categories.find((c) => c.name === 'Security Deposit Refund');
    const ownerPayoutCategory = state.categories.find((c) => c.name === 'Owner Security Payout');

    if (!securityDepositCategory) return [];

    const categoryById = new Map(state.categories.map((c) => [c.id, c]));
    const invoiceById = new Map(state.invoices.map((i) => [i.id, i]));
    const propertyById = new Map(state.properties.map((p) => [String(p.id), p]));
    const contactById = new Map(state.contacts.map((c) => [c.id, c]));
    const buildingById = new Map(state.buildings.map((b) => [b.id, b]));

    const ledgerOwnersByPropertyId =
        selectedOwnerId !== 'all' ? buildLedgerOwnerIdsByPropertyId(state) : null;

    const rows: SecurityDepositRow[] = [];

    for (const tx of state.transactions) {
        const txDate = new Date(tx.date);
        if (txDate < start || txDate > end) continue;

        let isRelevant = false;
        let type: 'Deposit' | 'Refund' | 'Deduction' | 'Payout' = 'Deposit';

        if (tx.type === TransactionType.INCOME && tx.categoryId === securityDepositCategory.id) {
            isRelevant = true;
            type = 'Deposit';
        } else if (tx.type === TransactionType.EXPENSE) {
            const category = categoryById.get(tx.categoryId ?? '');

            if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                isRelevant = true;
                type = 'Payout';
            } else if (refundCategory && tx.categoryId === refundCategory.id) {
                isRelevant = true;
                type = 'Refund';
            } else {
                const contact = tx.contactId ? contactById.get(tx.contactId) : undefined;
                if (contact?.type === ContactType.TENANT) {
                    isRelevant = true;
                    type = 'Deduction';
                } else if (category?.name.includes('(Tenant)')) {
                    isRelevant = true;
                    type = 'Deduction';
                }
            }
        }

        if (!isRelevant) continue;

        let propertyId = tx.propertyId;
        let ownerId = '';
        let buildingId = tx.buildingId;
        const tenantId = tx.contactId;

        if (!propertyId && tx.invoiceId) {
            const inv = invoiceById.get(tx.invoiceId);
            if (inv) {
                propertyId = inv.propertyId;
                if (!buildingId) buildingId = inv.buildingId;
            }
        }

        if (tx.contactId && type === 'Payout') ownerId = tx.contactId;

        if (propertyId) {
            const property = propertyById.get(String(propertyId));
            if (property) {
                if (!ownerId) ownerId = property.ownerId;
                if (!buildingId) buildingId = property.buildingId;
            }
        }

        if (selectedUnitId !== 'all') {
            if (!propertyId || String(propertyId) !== String(selectedUnitId)) continue;
        }
        if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;
        if (selectedOwnerId !== 'all') {
            if (propertyId) {
                const owners = ledgerOwnersByPropertyId?.get(String(propertyId));
                if (!owners?.has(selectedOwnerId)) continue;
            } else if (ownerId !== selectedOwnerId) {
                continue;
            }
        }

        const owner = ownerId ? contactById.get(ownerId) : undefined;
        const tenant = type === 'Payout' ? null : tenantId ? contactById.get(tenantId) : undefined;
        const property = propertyId ? propertyById.get(String(propertyId)) : undefined;
        const building = buildingId ? buildingById.get(buildingId) : undefined;

        rows.push({
            id: tx.id,
            date: tx.date,
            ownerName: owner?.name || 'Unknown',
            tenantName: tenant?.name || (type === 'Payout' ? '-' : 'Unknown'),
            propertyName: property?.name || '-',
            buildingName: building?.name || '-',
            particulars: tx.description || type,
            depositIn: type === 'Deposit' ? tx.amount : 0,
            refundOut: type === 'Refund' || type === 'Deduction' || type === 'Payout' ? tx.amount : 0,
            entityType: 'transaction' as const,
            entityId: tx.id,
            balance: 0,
        });
    }

    rows.sort((a, b) => {
        let valA: string | number = a[sortConfig.key] as string | number;
        let valB: string | number = b[sortConfig.key] as string | number;

        if (sortConfig.key === 'date') {
            valA = new Date(a.date).getTime();
            valB = new Date(b.date).getTime();

            if (valA === valB) {
                if (a.depositIn > 0 && b.depositIn === 0) return -1;
                if (a.depositIn === 0 && b.depositIn > 0) return 1;
                return 0;
            }
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB as string).toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    let runningBalance = 0;
    let processedRows: SecurityDepositReportRow[] = rows.map((row) => {
        runningBalance += row.depositIn - row.refundOut;
        return { ...row, balance: runningBalance };
    });

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        processedRows = processedRows.filter(
            (r) =>
                r.ownerName.toLowerCase().includes(q) ||
                r.tenantName.toLowerCase().includes(q) ||
                r.propertyName.toLowerCase().includes(q) ||
                r.particulars.toLowerCase().includes(q)
        );
    }

    return processedRows;
}
