import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { QuotationComplianceFilters, QuotationComplianceMetrics } from '../../../quotationValidation/types.js';

export type QuotationPriceOverrideRow = {
  id: string;
  tenant_id: string;
  quotation_id: string | null;
  quotation_reference: string | null;
  source_type: string;
  source_id: string;
  line_item_id: string | null;
  vendor_id: string;
  category_id: string | null;
  project_id: string | null;
  quotation_rate: string | null;
  transaction_rate: string;
  variance_amount: string | null;
  variance_percentage: string | null;
  override_by: string | null;
  override_datetime: Date;
};

export type QuotationPriceOverrideInput = {
  quotationId?: string | null;
  quotationReference?: string | null;
  sourceType: 'contract' | 'bill';
  sourceId: string;
  lineItemId?: string | null;
  vendorId: string;
  categoryId?: string | null;
  projectId?: string | null;
  quotationRate?: number | null;
  transactionRate: number;
  varianceAmount?: number | null;
  variancePercentage?: number | null;
};

export class QuotationPriceOverrideRepository extends TenantRepository {
  constructor(tenantId: string) {
    super(tenantId);
  }

  async insertOverride(
    client: pg.PoolClient,
    input: QuotationPriceOverrideInput,
    userId: string | null
  ): Promise<QuotationPriceOverrideRow> {
    const id = `qpo_${randomUUID().replace(/-/g, '')}`;
    const r = await client.query<QuotationPriceOverrideRow>(
      `INSERT INTO quotation_price_overrides (
         id, tenant_id, quotation_id, quotation_reference, source_type, source_id, line_item_id,
         vendor_id, category_id, project_id, quotation_rate, transaction_rate,
         variance_amount, variance_percentage, override_by, override_datetime
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
       )
       RETURNING *`,
      [
        id,
        this.tenantId,
        input.quotationId ?? null,
        input.quotationReference ?? null,
        input.sourceType,
        input.sourceId,
        input.lineItemId ?? null,
        input.vendorId,
        input.categoryId ?? null,
        input.projectId ?? null,
        input.quotationRate ?? null,
        input.transactionRate,
        input.varianceAmount ?? null,
        input.variancePercentage ?? null,
        userId,
      ]
    );
    return r.rows[0]!;
  }

  async getComplianceMetrics(
    client: pg.PoolClient,
    filters: QuotationComplianceFilters
  ): Promise<QuotationComplianceMetrics> {
    const params: unknown[] = [this.tenantId];
    let where = 'tenant_id = $1';
    let p = 2;

    if (filters.dateFrom) {
      where += ` AND override_datetime >= $${p}::date`;
      params.push(filters.dateFrom);
      p++;
    }
    if (filters.dateTo) {
      where += ` AND override_datetime < ($${p}::date + INTERVAL '1 day')`;
      params.push(filters.dateTo);
      p++;
    }
    if (filters.vendorId) {
      where += ` AND vendor_id = $${p}`;
      params.push(filters.vendorId);
      p++;
    }
    if (filters.projectId) {
      where += ` AND project_id = $${p}`;
      params.push(filters.projectId);
      p++;
    }
    if (filters.categoryId) {
      where += ` AND category_id = $${p}`;
      params.push(filters.categoryId);
      p++;
    }

    const agg = await client.query<{
      above_count: string;
      total_variance: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(variance_amount, 0) > 0)::text AS above_count,
         COALESCE(SUM(GREATEST(COALESCE(variance_amount, 0), 0)), 0)::text AS total_variance
       FROM quotation_price_overrides
       WHERE ${where}`,
      params
    );

    const savings = await client.query<{ savings: string }>(
      `SELECT COALESCE(SUM(GREATEST(COALESCE(quotation_rate, 0) - transaction_rate, 0)), 0)::text AS savings
       FROM quotation_price_overrides
       WHERE ${where}`,
      params
    );

    const topVendors = await client.query<{
      vendor_id: string;
      variance_amount: string;
      override_count: string;
    }>(
      `SELECT vendor_id,
              COALESCE(SUM(GREATEST(COALESCE(variance_amount, 0), 0)), 0)::text AS variance_amount,
              COUNT(*)::text AS override_count
       FROM quotation_price_overrides
       WHERE ${where}
       GROUP BY vendor_id
       ORDER BY SUM(GREATEST(COALESCE(variance_amount, 0), 0)) DESC
       LIMIT 10`,
      params
    );

    const aboveCount = Number(agg.rows[0]?.above_count ?? 0);
    const totalVariance = Number(agg.rows[0]?.total_variance ?? 0);
    const totalRows = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM quotation_price_overrides WHERE ${where}`,
      params
    );
    const totalCount = Number(totalRows.rows[0]?.c ?? 0);

    return {
      purchasesWithinQuotation: Math.max(0, totalCount - aboveCount),
      purchasesAboveQuotation: aboveCount,
      totalVarianceAmount: totalVariance,
      savingsAchieved: Number(savings.rows[0]?.savings ?? 0),
      topVendorsByVariance: topVendors.rows.map((r) => ({
        vendorId: r.vendor_id,
        varianceAmount: Number(r.variance_amount),
        overrideCount: Number(r.override_count),
      })),
    };
  }
}
