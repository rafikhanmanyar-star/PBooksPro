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

export const ACCOUNTING_LEDGER_BASE_FROM = `
FROM transactions t
LEFT JOIN accounts a
  ON a.id = t.account_id AND a.tenant_id = t.tenant_id AND a.deleted_at IS NULL
LEFT JOIN categories cat
  ON cat.id = t.category_id AND cat.tenant_id = t.tenant_id AND cat.deleted_at IS NULL
LEFT JOIN contacts c
  ON c.id = t.contact_id AND c.tenant_id = t.tenant_id AND c.deleted_at IS NULL
LEFT JOIN vendors v
  ON v.id = t.vendor_id AND v.tenant_id = t.tenant_id AND v.deleted_at IS NULL
LEFT JOIN projects proj
  ON proj.id = t.project_id AND proj.tenant_id = t.tenant_id AND proj.deleted_at IS NULL`;

export function compileAccountingLedgerReport(
  registry: ReportModuleRegistry,
  tenantId: string,
  payload: CustomReportGeneratePayload,
  mode: 'preview' | 'export'
): CompiledReportQuery {
  const rmap = new Map(registry.fields.map((f) => [f.key, f]));
  const params: unknown[] = [tenantId];
  let baseWhere = `WHERE t.tenant_id = $1 AND t.deleted_at IS NULL`;

  if (payload.search?.trim()) {
    params.push(escapeIlikePattern(payload.search.trim()));
    const s = `$${params.length}`;
    baseWhere += ` AND (
      t.description ILIKE ${s} ESCAPE '\\'
      OR t.reference ILIKE ${s} ESCAPE '\\'
      OR a.name ILIKE ${s} ESCAPE '\\'
      OR cat.name ILIKE ${s} ESCAPE '\\'
      OR c.name ILIKE ${s} ESCAPE '\\'
      OR v.name ILIKE ${s} ESCAPE '\\'
      OR proj.name ILIKE ${s} ESCAPE '\\'
    )`;
  }

  const filterBuilt = buildFilterSql(rmap, payload.filters ?? [], params.length + 1);
  params.push(...filterBuilt.params);
  baseWhere += filterBuilt.sql;

  const keys = resolveSelectedKeys(payload);
  for (const k of keys) {
    if (!rmap.has(k)) throw new Error(`UNKNOWN_FIELD:${k}`);
  }
  for (const g of payload.groupBy ?? []) {
    if (!registry.groupDimensions[g]) {
      throw new Error(`UNKNOWN_GROUP_DIMENSION:${g}`);
    }
  }

  const hasGroup = Boolean(payload.groupBy?.length);
  if (hasGroup) {
    for (const k of keys) {
      const d = rmap.get(k);
      if (d && isCalculatedField(d)) {
        throw new Error('CALCULATED_FIELDS_UNSUPPORTED_WITH_GROUP_BY');
      }
    }
    const grouped = buildGroupedSelect(
      payload.groupBy ?? [],
      registry.groupDimensions,
      payload.aggregates ?? [],
      keys,
      rmap
    );
    const groupSql = grouped.groupExprs.length
      ? ` GROUP BY ${grouped.groupExprs.join(', ')}`
      : '';
    const orderParts = buildGroupedOrderParts(
      payload.sortBy,
      registry.groupDimensions,
      grouped.projectedKeys
    );
    const orderSql = orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : '';
    const inner = `SELECT ${grouped.selectParts.join(', ')} ${ACCOUNTING_LEDGER_BASE_FROM} ${baseWhere}${groupSql}`;
    const countSql = `SELECT COUNT(*)::bigint AS c FROM (${inner}) __grp`;
    const page = payload.page ?? 1;
    const pageSize = Math.min(payload.pageSize ?? 50, MAX_PREVIEW_ROWS);
    const offset = mode === 'export' ? 0 : (page - 1) * pageSize;
    const limit = mode === 'export' ? MAX_EXPORT_ROWS : pageSize;
    const listSql = `${inner}${orderSql} LIMIT ${limit} OFFSET ${offset}`;
    return {
      listSql,
      params,
      countSql,
      countParams: params,
      projectedKeys: grouped.projectedKeys,
      isGrouped: true,
      columnLabels: grouped.columnLabels,
    };
  }

  const expandedKeys = expandSqlKeysPreserveOrder(keys, rmap);
  for (const k of keys) {
    if (!rmap.has(k) && !expandedKeys.includes(k)) {
      throw new Error(`UNKNOWN_FIELD:${k}`);
    }
  }
  for (const k of expandedKeys) {
    const fd = rmap.get(k);
    if (!fd || isCalculatedField(fd)) {
      throw new Error(`UNKNOWN_FIELD:${k}`);
    }
  }

  const selectParts: string[] = [];
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
  const orderSql = orderParts.length
    ? ` ORDER BY ${orderParts.join(', ')}`
    : ' ORDER BY t.date DESC NULLS LAST, t.id DESC';

  const innerFrom = `${ACCOUNTING_LEDGER_BASE_FROM} ${baseWhere}`;
  const countSql = `SELECT COUNT(*)::bigint AS c ${innerFrom}`;
  const page = payload.page ?? 1;
  const pageSize = Math.min(payload.pageSize ?? 50, MAX_PREVIEW_ROWS);
  const offset = mode === 'export' ? 0 : (page - 1) * pageSize;
  const limit = mode === 'export' ? MAX_EXPORT_ROWS : pageSize;
  const listSql = `SELECT ${selectParts.join(', ')} ${innerFrom} ${orderSql} LIMIT ${limit} OFFSET ${offset}`;

  return {
    listSql,
    params,
    countSql,
    countParams: params,
    projectedKeys: keys,
  };
}
