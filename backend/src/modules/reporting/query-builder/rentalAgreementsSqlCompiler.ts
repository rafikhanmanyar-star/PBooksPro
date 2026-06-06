import type { RegisteredField } from '../metadata/fieldRegistryTypes.js';
import { isCalculatedField } from '../metadata/fieldRegistryTypes.js';
import type { ReportModuleRegistry } from '../metadata/moduleRegistries.js';
import type { CustomReportGeneratePayload } from '../validators/reportConfigurationSchema.js';
import type { CompiledReportQuery } from './reportSqlHelpers.js';
import {
  buildFilterSql,
  buildGroupedSelect,
  escapeIlikePattern,
  expandSqlKeysPreserveOrder,
  groupDimensionAlias,
  resolveSelectedKeys,
} from './reportSqlHelpers.js';

const MAX_EXPORT_ROWS = 5000;
const MAX_PREVIEW_ROWS = 500;

export const RENTAL_AGREEMENTS_BASE_FROM = `
FROM rental_agreements ra
LEFT JOIN contacts tenant
  ON tenant.id = ra.contact_id AND tenant.tenant_id = ra.tenant_id AND tenant.deleted_at IS NULL
LEFT JOIN properties prop
  ON prop.id = ra.property_id AND prop.tenant_id = ra.tenant_id AND prop.deleted_at IS NULL
LEFT JOIN buildings bld
  ON bld.id = prop.building_id AND bld.tenant_id = ra.tenant_id AND bld.deleted_at IS NULL
LEFT JOIN contacts owner
  ON owner.id = COALESCE(ra.owner_id, prop.owner_id)
  AND owner.tenant_id = ra.tenant_id AND owner.deleted_at IS NULL
LEFT JOIN contacts broker
  ON broker.id = ra.broker_id AND broker.tenant_id = ra.tenant_id AND broker.deleted_at IS NULL
`;

function fieldMap(registry: RegisteredField[]): Map<string, RegisteredField> {
  const m = new Map<string, RegisteredField>();
  for (const f of registry) m.set(f.key, f);
  return m;
}

export function compileRentalAgreementsReport(
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

  const baseWhere = ` WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL${filterBuilt.sql}${searchSql}`;

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
    const orderParts: string[] = [];
    for (const s of payload.sortBy ?? []) {
      if (registryPack.groupDimensions[s.field]) {
        orderParts.push(`"${groupDimensionAlias(s.field)}" ${s.direction}`);
      }
    }
    const orderSql = orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : '';
    const inner = `SELECT ${selectParts.join(', ')} ${RENTAL_AGREEMENTS_BASE_FROM} ${baseWhere} ${groupSql}`;

    const countSql = `SELECT COUNT(*)::bigint AS c FROM (${inner}) __grp`;
    const cap = mode === 'export' ? MAX_EXPORT_ROWS : MAX_PREVIEW_ROWS;
    const listSql = `${inner} ${orderSql} LIMIT ${cap}`;

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
    : ' ORDER BY ra.start_date DESC NULLS LAST, ra.agreement_number';

  const innerFrom = `${RENTAL_AGREEMENTS_BASE_FROM} ${baseWhere}`;
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
