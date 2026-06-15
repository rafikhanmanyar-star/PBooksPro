import type pg from 'pg';
import { formatPgDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import { VendorPriceHistoryRepository } from '../repositories/VendorPriceHistoryRepository.js';
import { VendorPerformanceRatingRepository } from '../repositories/VendorPerformanceRatingRepository.js';
import { QuotationRepository } from '../repositories/QuotationRepository.js';
import { rowToQuotationApi } from './quotationsService.js';

export type ItemRateLookupResult = {
  lastPurchaseRate?: number;
  lastContractRate?: number;
  lastBillRate?: number;
  averageMarketRate?: number;
  previousRate?: number;
};

function parseDeliveryDays(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseWarrantyMonths(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

async function getLastContractRate(
  client: pg.PoolClient,
  tenantId: string,
  vendorId: string,
  categoryId: string
): Promise<number | null> {
  const r = await client.query<{ expense_category_items: unknown }>(
    `SELECT expense_category_items
     FROM contracts
     WHERE tenant_id = $1 AND vendor_id = $2 AND deleted_at IS NULL
     ORDER BY start_date DESC
     LIMIT 20`,
    [tenantId, vendorId]
  );
  for (const row of r.rows) {
    const items = Array.isArray(row.expense_category_items)
      ? row.expense_category_items
      : typeof row.expense_category_items === 'string'
        ? JSON.parse(row.expense_category_items)
        : [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      if (String(item.categoryId ?? item.category_id) !== categoryId) continue;
      const rate = Number(item.pricePerUnit ?? item.price_per_unit ?? 0);
      if (rate > 0) return rate;
    }
  }
  return null;
}

async function getLastBillRate(
  client: pg.PoolClient,
  tenantId: string,
  vendorId: string,
  categoryId: string
): Promise<number | null> {
  const r = await client.query<{ expense_category_items: unknown }>(
    `SELECT expense_category_items
     FROM bills
     WHERE tenant_id = $1 AND vendor_id = $2 AND deleted_at IS NULL
     ORDER BY issue_date DESC
     LIMIT 20`,
    [tenantId, vendorId]
  );
  for (const row of r.rows) {
    const items = Array.isArray(row.expense_category_items)
      ? row.expense_category_items
      : typeof row.expense_category_items === 'string'
        ? JSON.parse(row.expense_category_items)
        : [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      if (String(item.categoryId ?? item.category_id) !== categoryId) continue;
      const rate = Number(item.pricePerUnit ?? item.price_per_unit ?? item.pricePerQuantity ?? 0);
      if (rate > 0) return rate;
    }
  }
  return null;
}

export async function lookupQuotationItemRates(
  client: pg.PoolClient,
  tenantId: string,
  input: { vendorId: string; categoryId: string; itemName?: string }
): Promise<ItemRateLookupResult> {
  const historyRepo = new VendorPriceHistoryRepository(tenantId);
  const [lastPurchase, lastContract, lastBill, avgMarket] = await Promise.all([
    historyRepo.getLastRate(client, input.vendorId, input.categoryId, input.itemName),
    getLastContractRate(client, tenantId, input.vendorId, input.categoryId),
    getLastBillRate(client, tenantId, input.vendorId, input.categoryId),
    historyRepo.getAverageMarketRate(client, input.categoryId, input.itemName),
  ]);
  const previousRate = lastPurchase ?? lastContract ?? lastBill ?? undefined;
  return {
    lastPurchaseRate: lastPurchase ?? undefined,
    lastContractRate: lastContract ?? undefined,
    lastBillRate: lastBill ?? undefined,
    averageMarketRate: avgMarket ?? undefined,
    previousRate,
  };
}

export async function compareVendorQuotations(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    projectId?: string;
    buildingId?: string;
    packageName?: string;
    categoryId?: string;
    itemName?: string;
  }
) {
  const clauses = ['q.tenant_id = $1', 'q.deleted_at IS NULL', "q.status IN ('Active', 'Approved')"];
  const params: unknown[] = [tenantId];
  let idx = 2;
  if (filters.projectId) {
    clauses.push(`q.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters.buildingId) {
    clauses.push(`q.building_id = $${idx++}`);
    params.push(filters.buildingId);
  }
  if (filters.packageName) {
    clauses.push(`LOWER(q.package_name) = LOWER($${idx++})`);
    params.push(filters.packageName);
  }

  const r = await client.query(
    `SELECT q.id, q.vendor_id, q.quotation_number, q.date, q.delivery_period, q.warranty_period,
            q.payment_terms, q.items, v.name AS vendor_name
     FROM quotations q
     JOIN vendors v ON v.id = q.vendor_id AND v.tenant_id = q.tenant_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY q.date DESC`,
    params
  );

  const ratingRepo = new VendorPerformanceRatingRepository(tenantId);
  const rows: Array<Record<string, unknown>> = [];

  for (const row of r.rows) {
    const items = Array.isArray(row.items)
      ? row.items
      : typeof row.items === 'string'
        ? JSON.parse(row.items)
        : [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const categoryId = String(item.categoryId ?? item.category_id ?? '');
      if (filters.categoryId && categoryId !== filters.categoryId) continue;
      const itemName = item.itemName ?? item.item_name ? String(item.itemName ?? item.item_name) : undefined;
      if (filters.itemName && itemName?.toLowerCase() !== filters.itemName.toLowerCase()) continue;
      const rate = Number(item.pricePerQuantity ?? item.price_per_quantity ?? item.unitRate ?? 0);
      if (rate <= 0) continue;
      const vendorRating = await ratingRepo.getVendorAverageRating(client, row.vendor_id);
      rows.push({
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        quotationId: row.id,
        quotationNumber: row.quotation_number ?? undefined,
        rate,
        deliveryPeriod: row.delivery_period ?? undefined,
        warrantyPeriod: row.warranty_period ?? undefined,
        paymentTerms: row.payment_terms ?? undefined,
        quotationDate: formatPgDateToYyyyMmDd(row.date) ?? '',
        vendorRating: vendorRating ?? undefined,
        itemName,
        categoryId,
      });
    }
  }

  if (!rows.length) return rows;

  const minRate = Math.min(...rows.map((r) => Number(r.rate)));
  const deliveryDays = rows.map((r) => parseDeliveryDays(r.deliveryPeriod as string | undefined));
  const minDelivery = deliveryDays.filter((d) => d != null).length
    ? Math.min(...(deliveryDays.filter((d) => d != null) as number[]))
    : null;
  const warrantyMonths = rows.map((r) => parseWarrantyMonths(r.warrantyPeriod as string | undefined));
  const maxWarranty = warrantyMonths.filter((w) => w != null).length
    ? Math.max(...(warrantyMonths.filter((w) => w != null) as number[]))
    : null;
  const maxRating = Math.max(...rows.map((r) => Number(r.vendorRating ?? 0)));

  return rows.map((row) => ({
    ...row,
    isLowestRate: Number(row.rate) === minRate,
    isBestDelivery: minDelivery != null && parseDeliveryDays(row.deliveryPeriod as string | undefined) === minDelivery,
    isBestWarranty: maxWarranty != null && parseWarrantyMonths(row.warrantyPeriod as string | undefined) === maxWarranty,
    isHighestRated: maxRating > 0 && Number(row.vendorRating ?? 0) === maxRating,
  }));
}

export async function listVendorPriceHistory(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    vendorId?: string;
    categoryId?: string;
    itemName?: string;
    projectId?: string;
    limit?: number;
  }
) {
  const repo = new VendorPriceHistoryRepository(tenantId);
  const rows = await repo.listHistory(client, filters);
  return rows.map((row) => ({
    id: row.id,
    vendorId: row.vendor_id,
    categoryId: row.category_id ?? undefined,
    itemId: row.item_id ?? undefined,
    itemName: row.item_name ?? undefined,
    quotationId: row.quotation_id ?? undefined,
    quotedRate: Number(row.quoted_rate),
    quotationDate: formatPgDateToYyyyMmDd(row.quotation_date) ?? '',
    projectId: row.project_id ?? undefined,
    buildingId: row.building_id ?? undefined,
    isApprovedRate: row.is_approved_rate === true,
  }));
}

export async function getProcurementDashboardMetrics(client: pg.PoolClient, tenantId: string) {
  const repo = new QuotationRepository(tenantId);
  const quotations = await repo.listActive(client);
  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  let activeCount = 0;
  let expiringCount = 0;
  const vendorRates: Array<{ vendorId: string; vendorName: string; rate: number }> = [];

  for (const row of quotations) {
    const api = rowToQuotationApi(row);
    const status = String(api.status ?? 'Draft');
    if (status === 'Active' || status === 'Approved') activeCount += 1;
    if (api.expiryDate) {
      const exp = new Date(`${String(api.expiryDate).slice(0, 10)}T12:00:00`);
      if (exp >= now && exp <= in7Days) expiringCount += 1;
    }
    for (const item of (api.items as Array<Record<string, unknown>>) ?? []) {
      const rate = Number(item.pricePerQuantity ?? 0);
      if (rate > 0) {
        vendorRates.push({
          vendorId: String(api.vendorId),
          vendorName: String(api.name),
          rate,
        });
      }
    }
  }

  vendorRates.sort((a, b) => a.rate - b.rate);

  return {
    activeQuotations: activeCount,
    expiringQuotations: expiringCount,
    lowestVendorRates: vendorRates.slice(0, 5),
    priceIncreaseAlerts: 0,
    topVendors: [],
    monthlyPriceTrends: [],
  };
}
