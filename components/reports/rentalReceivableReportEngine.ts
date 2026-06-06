import { InvoiceType, type Building, type Contact, type Invoice, type Property } from '../../types';

export interface DueLine {
    invoiceId: string;
    invoiceNumber: string;
    period: string;
    dueDate: string;
    type: 'Rent' | 'Security';
    amount: number;
    paidAmount: number;
    balance: number;
    runningBalance: number;
}

export interface PropertyReceivable {
    propertyId: string;
    propertyName: string;
    buildingId: string;
    buildingName: string;
    tenantName: string;
    lines: DueLine[];
    totalDue: number;
}

export function computeRentalReceivableReport(
    input: {
        invoices: Invoice[];
        properties: Property[];
        buildings: Building[];
        contacts: Contact[];
    },
    filters: { buildingId?: string }
): PropertyReceivable[] {
    const selectedBuildingId = filters.buildingId ?? 'all';
    const propertiesById = new Map(input.properties.map((p) => [p.id, p]));
    const buildingsById = new Map(input.buildings.map((b) => [b.id, b]));
    const contactsById = new Map(input.contacts.map((c) => [c.id, c]));

    const dueInvoices = input.invoices.filter(
        (inv) =>
            (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT) &&
            inv.amount - inv.paidAmount > 0
    );

    const byProperty = new Map<string, { inv: Invoice; balance: number }[]>();

    for (const inv of dueInvoices) {
        const propId = inv.propertyId;
        if (!propId) continue;

        const buildingId = inv.buildingId || propertiesById.get(propId)?.buildingId;
        if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;

        const balance = inv.amount - inv.paidAmount;
        if (!byProperty.has(propId)) byProperty.set(propId, []);
        byProperty.get(propId)!.push({ inv, balance });
    }

    const result: PropertyReceivable[] = [];

    byProperty.forEach((items, propertyId) => {
        const prop = propertiesById.get(propertyId);
        const buildingId = prop?.buildingId || items[0]?.inv.buildingId || '';
        const building = buildingsById.get(buildingId);
        const buildingName = building?.name || 'Unassigned';
        const propertyName = prop?.name || 'Unknown';

        items.sort((a, b) => {
            const dA = new Date(a.inv.issueDate).getTime();
            const dB = new Date(b.inv.issueDate).getTime();
            if (dA !== dB) return dA - dB;
            return (
                (a.inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ? 0 : 1) -
                (b.inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ? 0 : 1)
            );
        });

        let runningBalance = 0;
        const lines: DueLine[] = items.map(({ inv, balance }) => {
            runningBalance += balance;
            const d = new Date(inv.issueDate);
            const period = `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
            return {
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber,
                period,
                dueDate: inv.dueDate || inv.issueDate,
                type: inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ? 'Security' : 'Rent',
                amount: inv.amount,
                paidAmount: inv.paidAmount,
                balance,
                runningBalance,
            };
        });

        const tenantId = items[0]?.inv.contactId;
        const tenantName = tenantId ? contactsById.get(tenantId)?.name || 'Unknown' : '—';

        result.push({
            propertyId,
            propertyName,
            buildingId,
            buildingName,
            tenantName,
            lines,
            totalDue: lines.reduce((sum, l) => sum + l.balance, 0),
        });
    });

    result.sort((a, b) => {
        if (a.buildingName !== b.buildingName) return a.buildingName.localeCompare(b.buildingName);
        return a.propertyName.localeCompare(b.propertyName);
    });

    return result;
}
