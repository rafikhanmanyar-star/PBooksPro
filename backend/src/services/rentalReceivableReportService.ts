import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { listInvoices, rowToInvoiceApi } from './invoicesService.js';
import { listContacts, rowToContactApi } from './contactsService.js';
import { listBuildings, rowToBuildingApi } from './buildingsService.js';
import { listProperties, rowToPropertyApi } from './propertiesService.js';

type RentalReceivableEngineModule = {
  computeRentalReceivableReport: (
    input: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => unknown[];
};

let cachedEngine: RentalReceivableEngineModule | null = null;

async function loadRentalReceivableEngine(): Promise<RentalReceivableEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'rentalReceivableReportEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Rental receivable engine bundle missing: ${bundled}. Run: node scripts/ensure-rental-receivable-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as RentalReceivableEngineModule;
  return cachedEngine;
}

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
  const engine = await loadRentalReceivableEngine();
  const input = await loadRentalReceivableStateInput(client, tenantId);
  const propertyReceivables = engine.computeRentalReceivableReport(input, {
    buildingId: filters.buildingId ?? 'all',
  });
  return { propertyReceivables };
}
