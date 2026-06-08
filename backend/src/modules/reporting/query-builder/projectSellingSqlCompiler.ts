import type { RegisteredField } from '../metadata/fieldRegistryTypes.js';
import { isCalculatedField } from '../metadata/fieldRegistryTypes.js';
import type { ReportModuleRegistry } from '../metadata/moduleRegistries.js';
import type { CustomReportGeneratePayload } from '../validators/reportConfigurationSchema.js';
import {
  buildFilterSql,
  buildGroupedSelect,
  buildGroupedOrderParts,
  escapeIlikePattern,
  expandSqlKeysPreserveOrder,
  resolveSelectedKeys,
  type CompiledReportQuery,
} from './reportSqlHelpers.js';

const MAX_EXPORT_ROWS = 5000;
const MAX_PREVIEW_ROWS = 500;

export type { CompiledReportQuery };

/** @deprecated use CompiledReportQuery */
export type CompiledProjectSellingQuery = CompiledReportQuery;

export const PROJECT_SELLING_BASE_FROM = `
FROM project_agreements pa
LEFT JOIN contacts client
  ON client.id = pa.client_id AND client.tenant_id = pa.tenant_id AND client.deleted_at IS NULL
LEFT JOIN projects proj
  ON proj.id = pa.project_id AND proj.tenant_id = pa.tenant_id AND proj.deleted_at IS NULL
LEFT JOIN contacts broker
  ON broker.id = pa.rebate_broker_id AND broker.tenant_id = pa.tenant_id AND broker.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT string_agg(u.unit_number, ', ' ORDER BY u.unit_number) AS unit_numbers,
         count(*)::int AS unit_count,
         max(u.unit_type) AS primary_unit_type,
         max(u.status) AS primary_unit_status
  FROM project_agreement_units pau
  JOIN units u ON u.id = pau.unit_id AND u.tenant_id = pa.tenant_id AND u.deleted_at IS NULL
  WHERE pau.agreement_id = pa.id
) uagg ON TRUE
LEFT JOIN LATERAL (
  SELECT oc.name AS owner_contact_name, oc.id AS owner_contact_id
  FROM project_agreement_units pau
  JOIN units u ON u.id = pau.unit_id AND u.tenant_id = pa.tenant_id AND u.deleted_at IS NULL
  LEFT JOIN contacts oc ON oc.id = u.owner_contact_id AND oc.tenant_id = u.tenant_id AND oc.deleted_at IS NULL
  WHERE pau.agreement_id = pa.id
  ORDER BY u.unit_number NULLS LAST
  LIMIT 1
) ownr ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(inv.paid_amount), 0) AS invoice_paid_total,
         COALESCE(SUM(inv.amount), 0) AS invoice_amount_total,
         COUNT(*)::int AS invoice_count
  FROM invoices inv
  WHERE inv.tenant_id = pa.tenant_id AND inv.deleted_at IS NULL AND inv.agreement_id = pa.id
) inv_sums ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(t.amount), 0) AS txn_amount_net,
         COUNT(*)::int AS txn_count
  FROM transactions t
  WHERE t.tenant_id = pa.tenant_id AND t.deleted_at IS NULL AND t.agreement_id = pa.id
) txn_sums ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS return_count,
         COALESCE(SUM(sr.refund_amount), 0) AS refunds_total
  FROM sales_returns sr
  WHERE sr.tenant_id = pa.tenant_id AND sr.deleted_at IS NULL AND sr.agreement_id = pa.id
) sr_sums ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(pra.recorded_value), 0) AS assets_received_value,
         COUNT(*)::int AS assets_received_count
  FROM project_received_assets pra
  WHERE pra.tenant_id = pa.tenant_id AND pra.deleted_at IS NULL
    AND pra.project_id = pa.project_id AND pra.contact_id = pa.client_id
) asset_sums ON TRUE
LEFT JOIN LATERAL (
  SELECT ip.net_value, ip.down_payment_percentage
  FROM installment_plans ip
  WHERE ip.tenant_id = pa.tenant_id AND ip.deleted_at IS NULL
    AND ip.lead_id = pa.client_id AND ip.project_id = pa.project_id
  ORDER BY ip.updated_at DESC NULLS LAST
  LIMIT 1
) ip_one ON TRUE
LEFT JOIN categories cat_sell
  ON cat_sell.id = pa.selling_price_category_id AND cat_sell.tenant_id = pa.tenant_id AND cat_sell.deleted_at IS NULL
LEFT JOIN categories cat_rebate
  ON cat_rebate.id = pa.rebate_category_id AND cat_rebate.tenant_id = pa.tenant_id AND cat_rebate.deleted_at IS NULL
`;

function fieldMap(registry: RegisteredField[]): Map<string, RegisteredField> {
  const m = new Map<string, RegisteredField>();
  for (const f of registry) m.set(f.key, f);
  return m;
}

export function compileProjectSellingReport(
  registryPack: ReportModuleRegistry,
  tenantId: string,
  payload: CustomReportGeneratePayload,
  mode: 'preview' | 'export'
): CompiledProjectSellingQuery {
  const rmap = fieldMap(registryPack.fields);
  const keys = resolveSelectedKeys(payload);

  for (const k of keys) {
    const d = rmap.get(k);
    if (!d) throw new Error(`UNKNOWN_FIELD:${k}`);
  }

  for (const g of payload.groupBy ?? []) {
    if (!registryPack.groupDimensions[g]) {
      throw new Error(`UNKNOWN_GROUP_DIMENSION:${g}`);
    }
  }

  const params: unknown[] = [tenantId];
  let pIdx = 2;

  const filterBuilt = buildFilterSql(rmap, payload.filters ?? [], pIdx);
  pIdx = filterBuilt.nextIndex;
  params.push(...filterBuilt.params);

  let searchSql = '';
  if (payload.search?.trim()) {
    const pattern = escapeIlikePattern(payload.search.trim());
    const targets = registryPack.fields.filter(
      (f) => f.searchable && !isCalculatedField(f)
    );
    const chunks: string[] = [];
    const patSlot = `$${pIdx++}`;
    params.push(pattern);
    for (const t of targets.slice(0, 16)) {
      chunks.push(`${t.sqlExpr}::text ILIKE ${patSlot} ESCAPE '\\'`);
    }
    if (chunks.length) searchSql = ` AND (${chunks.join(' OR ')})`;
  }

  const baseWhere = ` WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL${filterBuilt.sql}${searchSql}`;

  const hasGroup = Boolean(payload.groupBy?.length);
  const selectParts: string[] = [];
  const groupExprs: string[] = [];

  if (hasGroup) {
    for (const k of keys) {
      const d = rmap.get(k);
      if (d && isCalculatedField(d)) {
        throw new Error('CALCULATED_FIELDS_UNSUPPORTED_WITH_GROUP_BY');
      }
    }
    const grouped = buildGroupedSelect(
      payload.groupBy ?? [],
      registryPack.groupDimensions,
      payload.aggregates ?? [],
      keys,
      rmap
    );
    selectParts.push(...grouped.selectParts);
    groupExprs.push(...grouped.groupExprs);

    const groupSql = groupExprs.length ? ` GROUP BY ${groupExprs.join(', ')}` : '';
    const orderParts = buildGroupedOrderParts(
      payload.sortBy,
      registryPack.groupDimensions,
      grouped.projectedKeys
    );
    const orderSql = orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : '';
    const inner = `SELECT ${selectParts.join(', ')} ${PROJECT_SELLING_BASE_FROM} ${baseWhere} ${groupSql}`;

    const countSql = `SELECT COUNT(*)::bigint AS c FROM (${inner}) __grp`;
    const page = payload.page ?? 1;
    const pageSize = Math.min(payload.pageSize ?? 50, MAX_PREVIEW_ROWS);
    const offset = mode === 'export' ? 0 : (page - 1) * pageSize;
    const limit = mode === 'export' ? MAX_EXPORT_ROWS : pageSize;
    const listSql = `${inner} ${orderSql} LIMIT ${limit} OFFSET ${offset}`;

    return {
      listSql,
      params: [...params],
      countSql,
      countParams: [...params],
      projectedKeys: grouped.projectedKeys,
      columnLabels: grouped.columnLabels,
      isGrouped: true,
    };
  }

  const expandedKeys = expandSqlKeysPreserveOrder(keys, rmap);
  for (const k of expandedKeys) {
    const fd = rmap.get(k)!;
    selectParts.push(`${fd.sqlExpr} AS "${k}"`);
  }

  const orderParts: string[] = [];
  for (const s of payload.sortBy ?? []) {
    const fd = rmap.get(s.field);
    if (fd && !isCalculatedField(fd) && fd.sortable !== false) {
      orderParts.push(`${fd.sqlExpr} ${s.direction}`);
    }
  }
  const orderSql = orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : ' ORDER BY pa.issue_date DESC NULLS LAST, pa.agreement_number';

  const innerFrom = `${PROJECT_SELLING_BASE_FROM} ${baseWhere}`;
  const countSql = `SELECT COUNT(*)::bigint AS c ${innerFrom}`;
  const page = payload.page ?? 1;
  const pageSize = Math.min(payload.pageSize ?? 50, MAX_PREVIEW_ROWS);
  const offset = mode === 'export' ? 0 : (page - 1) * pageSize;
  const limit = mode === 'export' ? MAX_EXPORT_ROWS : pageSize;

  const listSql = `SELECT ${selectParts.join(', ')} ${innerFrom} ${orderSql} LIMIT ${limit} OFFSET ${offset}`;

  return {
    listSql,
    params: [...params],
    countSql,
    countParams: [...params],
    projectedKeys: keys,
  };
}
