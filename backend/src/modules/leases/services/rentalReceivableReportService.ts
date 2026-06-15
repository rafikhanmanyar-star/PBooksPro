import type pg from 'pg';
import { computeRentalReceivableReport } from '../../../reportEngines/index.js';
import { listInvoices, rowToInvoiceApi } from '../../customers/services/invoicesService.js';
import { listContacts, rowToContactApi } from '../../crm/services/contactsService.js';
import { listBuildings, rowToBuildingApi } from '../../properties/services/buildingsService.js';
import { listProperties, rowToPropertyApi } from '../../properties/services/propertiesService.js';

function asRecord<T extends Record<string, unknown>>(x: Record<string, unknown>): T {
  return x as T;
}

async function loadRentalReceivableStateInput(client: pg.PoolClient, tenantId: string) {
  const [invRows, contactRows, buildingRows, propertyRows] = await Promise.all([
    listInvoices(client, tenantId),
    listContacts(client, tenantId),
    listBuildings(client, tenantId),
    listProperties(client, tenantId),
  ]);

  return {
    invoices: invRows.map((r) => asRecord(rowToInvoiceApi(r))),
    contacts: contactRows.map((r) => asRecord(rowToContactApi(r))),
    buildings: buildingRows.map((r) => asRecord(rowToBuildingApi(r))),
    properties: propertyRows.map((r) => asRecord(rowToPropertyApi(r))),
  };
}

export async function getRentalReceivableReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: { buildingId?: string }
) {
  const input = await loadRentalReceivableStateInput(client, tenantId);
  const propertyReceivables = computeRentalReceivableReport(input, {
    buildingId: filters.buildingId ?? 'all',
  });
  return { propertyReceivables };
}
