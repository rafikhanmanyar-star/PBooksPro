import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import { VendorPerformanceRatingRepository } from '../../vendors/repositories/VendorPerformanceRatingRepository.js';
import {
  parseDeliveryDays,
  parsePaymentTermsDays,
  parseWarrantyMonths,
  scoreQuotationCandidates,
  type QuotationComparisonCandidate,
} from '../../../procurement/vendorRecommendationEngine.js';
import { QuotationComparisonSessionRepository } from '../repositories/QuotationComparisonSessionRepository.js';

export type QuotationComparisonFilters = {
  projectId?: string;
  buildingId?: string;
  packageName?: string;
  categoryId?: string;
  itemName?: string;
};

export type QuotationComparisonMatrixRow = {
  vendorId: string;
  vendorName: string;
  quotationId: string;
  quotationNumber?: string;
  unitPrice: number;
  totalAmount: number;
  deliveryPeriod?: string;
  warrantyPeriod?: string;
  paymentTerms?: string;
  quotationDate: string;
  vendorRating?: number;
  itemName?: string;
  categoryId?: string;
  recommendationScore: number;
  recommendationRank: number;
  isRecommended: boolean;
  isLowestRate: boolean;
  isBestDelivery: boolean;
  isBestWarranty: boolean;
  isHighestRated: boolean;
};

export async function buildQuotationComparisonMatrix(
  client: pg.PoolClient,
  tenantId: string,
  filters: QuotationComparisonFilters
): Promise<QuotationComparisonMatrixRow[]> {
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
            q.payment_terms, q.items, q.total_amount::text AS total_amount, v.name AS vendor_name
     FROM quotations q
     JOIN vendors v ON v.id = q.vendor_id AND v.tenant_id = q.tenant_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY q.date DESC`,
    params
  );

  const ratingRepo = new VendorPerformanceRatingRepository(tenantId);
  const candidates: QuotationComparisonCandidate[] = [];
  const meta: Array<{
    vendorId: string;
    vendorName: string;
    quotationId: string;
    quotationNumber?: string;
    deliveryPeriod?: string;
    warrantyPeriod?: string;
    paymentTerms?: string;
    quotationDate: string;
    itemName?: string;
    categoryId?: string;
  }> = [];

  for (const row of r.rows) {
    const items = Array.isArray(row.items)
      ? row.items
      : typeof row.items === 'string'
        ? JSON.parse(row.items)
        : [];
    const vendorRating = await ratingRepo.getVendorAverageRating(client, row.vendor_id);

    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const categoryId = String(item.categoryId ?? item.category_id ?? '');
      if (filters.categoryId && categoryId !== filters.categoryId) continue;
      const itemName = item.itemName ?? item.item_name ? String(item.itemName ?? item.item_name) : undefined;
      if (filters.itemName && itemName?.toLowerCase() !== filters.itemName.toLowerCase()) continue;
      const unitPrice = Number(item.pricePerQuantity ?? item.price_per_quantity ?? item.unitRate ?? 0);
      if (unitPrice <= 0) continue;
      const qty = Number(item.quantity ?? 0);
      const lineTotal = qty > 0 ? qty * unitPrice : unitPrice;
      const quotationTotal = Number(row.total_amount ?? 0);

      candidates.push({
        quotationId: row.id,
        vendorId: row.vendor_id,
        unitPrice,
        totalAmount: lineTotal > 0 ? lineTotal : quotationTotal,
        deliveryDays: parseDeliveryDays(row.delivery_period),
        warrantyMonths: parseWarrantyMonths(row.warranty_period),
        vendorRating: vendorRating ?? null,
        paymentTermsDays: parsePaymentTermsDays(row.payment_terms),
      });
      meta.push({
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        quotationId: row.id,
        quotationNumber: row.quotation_number ?? undefined,
        deliveryPeriod: row.delivery_period ?? undefined,
        warrantyPeriod: row.warranty_period ?? undefined,
        paymentTerms: row.payment_terms ?? undefined,
        quotationDate: formatPgDateToYyyyMmDd(row.date) ?? '',
        itemName,
        categoryId: categoryId || undefined,
      });
    }
  }

  if (!candidates.length) return [];

  const scored = scoreQuotationCandidates(candidates);
  const minRate = Math.min(...scored.map((s) => s.unitPrice));
  const deliveryDays = scored.map((s) => s.deliveryDays).filter((d): d is number => d != null);
  const minDelivery = deliveryDays.length ? Math.min(...deliveryDays) : null;
  const warrantyMonths = scored.map((s) => s.warrantyMonths).filter((w): w is number => w != null);
  const maxWarranty = warrantyMonths.length ? Math.max(...warrantyMonths) : null;
  const maxRating = Math.max(...scored.map((s) => s.vendorRating ?? 0));

  return scored.map((row, idx) => {
    const m = meta[idx]!;
    return {
      vendorId: m.vendorId,
      vendorName: m.vendorName,
      quotationId: m.quotationId,
      quotationNumber: m.quotationNumber,
      unitPrice: row.unitPrice,
      totalAmount: row.totalAmount,
      deliveryPeriod: m.deliveryPeriod,
      warrantyPeriod: m.warrantyPeriod,
      paymentTerms: m.paymentTerms,
      quotationDate: m.quotationDate,
      vendorRating: row.vendorRating ?? undefined,
      itemName: m.itemName,
      categoryId: m.categoryId,
      recommendationScore: row.recommendationScore,
      recommendationRank: row.recommendationRank,
      isRecommended: row.isRecommended,
      isLowestRate: row.unitPrice === minRate,
      isBestDelivery: minDelivery != null && row.deliveryDays === minDelivery,
      isBestWarranty: maxWarranty != null && row.warrantyMonths === maxWarranty,
      isHighestRated: maxRating > 0 && (row.vendorRating ?? 0) === maxRating,
    };
  });
}

export async function createComparisonSession(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    title?: string;
    projectId?: string;
    buildingId?: string;
    packageName?: string;
    categoryId?: string;
    itemName?: string;
    quotationIds?: string[];
    createdBy?: string | null;
  }
) {
  const repo = new QuotationComparisonSessionRepository(tenantId);
  const sessionId = `qcs_${randomUUID().replace(/-/g, '')}`;
  const matrix = await buildQuotationComparisonMatrix(client, tenantId, {
    projectId: input.projectId,
    buildingId: input.buildingId,
    packageName: input.packageName,
    categoryId: input.categoryId,
    itemName: input.itemName,
  });

  const filtered =
    input.quotationIds?.length
      ? matrix.filter((row) => input.quotationIds!.includes(row.quotationId))
      : matrix;

  const session = await repo.insertSession(client, sessionId, {
    title: input.title?.trim() || null,
    project_id: input.projectId ?? null,
    building_id: input.buildingId ?? null,
    package_name: input.packageName ?? null,
    category_id: input.categoryId ?? null,
    item_name: input.itemName ?? null,
    created_by: input.createdBy ?? null,
  });

  for (const row of filtered) {
    await repo.addQuotation(
      client,
      `qcsq_${randomUUID().replace(/-/g, '')}`,
      sessionId,
      row.quotationId,
      row.recommendationScore,
      row.recommendationRank,
      row.isRecommended
    );
  }

  return { session: sessionToApi(session), matrix: filtered };
}

export function sessionToApi(row: {
  id: string;
  title: string | null;
  project_id: string | null;
  building_id: string | null;
  package_name: string | null;
  category_id: string | null;
  item_name: string | null;
  preferred_quotation_id: string | null;
  approved_quotation_id: string | null;
  purchase_order_id: string | null;
  status: string;
  version: number;
  created_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    title: row.title ?? undefined,
    projectId: row.project_id ?? undefined,
    buildingId: row.building_id ?? undefined,
    packageName: row.package_name ?? undefined,
    categoryId: row.category_id ?? undefined,
    itemName: row.item_name ?? undefined,
    preferredQuotationId: row.preferred_quotation_id ?? undefined,
    approvedQuotationId: row.approved_quotation_id ?? undefined,
    purchaseOrderId: row.purchase_order_id ?? undefined,
    status: row.status,
    version: row.version,
    createdBy: row.created_by ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
