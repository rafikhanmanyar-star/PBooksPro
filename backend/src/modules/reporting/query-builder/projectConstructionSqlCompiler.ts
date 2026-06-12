import type { RegisteredField } from '../metadata/fieldRegistryTypes.js';
import { isCalculatedField } from '../metadata/fieldRegistryTypes.js';
import type { ReportModuleRegistry } from '../metadata/moduleRegistries.js';
import type { CustomReportGeneratePayload } from '../validators/reportConfigurationSchema.js';
import type { CompiledReportQuery } from './reportSqlHelpers.js';
import {
  buildFilterSql,
  buildGroupedSelect,
  buildGroupedOrderParts,
  escapeIlikePattern,
  expandSqlKeysPreserveOrder,
  resolveSelectedKeys,
} from './reportSqlHelpers.js';

const MAX_EXPORT_ROWS = 5000;
const MAX_PREVIEW_ROWS = 500;

export const PROJECT_CONSTRUCTION_BASE_FROM = `
FROM contracts c
LEFT JOIN vendors v
  ON v.id = c.vendor_id AND v.tenant_id = c.tenant_id AND v.deleted_at IS NULL
LEFT JOIN projects proj
  ON proj.id = c.project_id AND proj.tenant_id = c.tenant_id AND proj.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(b.amount), 0) AS billed,
         COALESCE(SUM(b.paid_amount), 0) AS paid,
         COUNT(*)::int AS bill_count
  FROM bills b
  WHERE b.tenant_id = c.tenant_id AND b.deleted_at IS NULL AND b.contract_id = c.id
) bill_sums ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)), 0) AS overdue_amount
  FROM bills b
  WHERE b.tenant_id = c.tenant_id AND b.deleted_at IS NULL AND b.contract_id = c.id
    AND b.due_date < CURRENT_DATE AND b.status <> 'Paid'
) od ON TRUE
`;

function fieldMap(registry: RegisteredField[]): Map<string, RegisteredField> {
  const m = new Map<string, RegisteredField>();
  for (const f of registry) m.set(f.key, f);
  return m;
}

export function compileProjectConstructionReport(
  registryPack: ReportModuleRegistry,
  tenantId: string,
  payload: CustomReportGeneratePayload,
  mode: 'preview' | 'export'
): CompiledReportQuery {
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
    const targets = registryPack.fields.filter((f) => f.searchable && !isCalculatedField(f));
    const chunks: string[] = [];
    const patSlot = `$${pIdx++}`;
    params.push(pattern);
    for (const t of targets.slice(0, 16)) {
      chunks.push(`${t.sqlExpr}::text ILIKE ${patSlot} ESCAPE '\\'`);
    }
    if (chunks.length) searchSql = ` AND (${chunks.join(' OR ')})`;
  }

  const baseWhere = ` WHERE c.tenant_id = $1 AND c.deleted_at IS NULL${filterBuilt.sql}${searchSql}`;
  const hasGroup = Boolean(payload.groupBy?.length);
  const selectParts: string[] = [];

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

    const groupSql = grouped.groupExprs.length ? ` GROUP BY ${grouped.groupExprs.join(', ')}` : '';
    const orderParts = buildGroupedOrderParts(
      payload.sortBy,
      registryPack.groupDimensions,
      grouped.projectedKeys
    );
    const orderSql = orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : '';
    const inner = `SELECT ${selectParts.join(', ')} ${PROJECT_CONSTRUCTION_BASE_FROM} ${baseWhere} ${groupSql}`;

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
  const orderSql = orderParts.length
    ? ` ORDER BY ${orderParts.join(', ')}`
    : ' ORDER BY c.start_date DESC NULLS LAST, c.contract_number';

  const innerFrom = `${PROJECT_CONSTRUCTION_BASE_FROM} ${baseWhere}`;
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
    isGrouped: false,
  };
}
