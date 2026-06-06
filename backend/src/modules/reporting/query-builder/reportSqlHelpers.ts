import type { RegisteredField } from '../metadata/fieldRegistryTypes.js';
import { isCalculatedField } from '../metadata/fieldRegistryTypes.js';
import type {
  CustomReportGeneratePayload,
  ReportFilterOp,
} from '../validators/reportConfigurationSchema.js';

export function escapeIlikePattern(raw: string): string {
  const esc = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${esc}%`;
}

export function buildFilterSql(
  registry: Map<string, RegisteredField>,
  filters: NonNullable<CustomReportGeneratePayload['filters']>,
  paramStart: number
): { sql: string; params: unknown[]; nextIndex: number } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = paramStart;

  const nextSlot = () => `$${idx++}`;

  for (const f of filters) {
    const def = registry.get(f.field);
    if (!def || isCalculatedField(def) || def.filterable === false) {
      throw new Error(`FILTER_FIELD_NOT_ALLOWED:${f.field}`);
    }
    const col = def.sqlExpr;
    const op = f.operator as ReportFilterOp;

    if (op === 'IS NULL') {
      parts.push(`(${col} IS NULL)`);
      continue;
    }
    if (op === 'IS NOT NULL') {
      parts.push(`(${col} IS NOT NULL)`);
      continue;
    }

    if (op === 'BETWEEN') {
      const a = nextSlot();
      const b = nextSlot();
      parts.push(`(${col} BETWEEN ${a} AND ${b})`);
      params.push(f.value, f.valueTo);
      continue;
    }

    if (op === 'IN') {
      if (!Array.isArray(f.value) || f.value.length === 0) {
        throw new Error('FILTER_IN_REQUIRES_ARRAY');
      }
      const slots = f.value.map(() => nextSlot());
      parts.push(`(${col} IN (${slots.join(', ')}))`);
      params.push(...f.value);
      continue;
    }

    if (op === 'LIKE' || op === 'ILIKE') {
      const s = nextSlot();
      const wild = typeof f.value === 'string' ? f.value : String(f.value ?? '');
      parts.push(`(${col}::text ${op} ${s} ESCAPE '\\')`);
      params.push(wild);
      continue;
    }

    const s = nextSlot();
    parts.push(`(${col} ${op} ${s})`);
    params.push(f.value);
  }

  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params, nextIndex: idx };
}

export function resolveSelectedKeys(payload: CustomReportGeneratePayload): string[] {
  if (payload.columns?.length) {
    return payload.columns.map((c) => c.key);
  }
  return payload.fields ?? [];
}

/** Ensures `{calculated}` fields can be evaluated once dependency columns are fetched. */
export function expandSqlKeysPreserveOrder(
  keys: string[],
  rmap: Map<string, RegisteredField>
): string[] {
  const extras: string[] = [];
  const seen = new Set(keys);
  for (const k of keys) {
    const d = rmap.get(k);
    if (d && isCalculatedField(d)) {
      for (const dep of d.dependsOn ?? []) {
        if (!seen.has(dep)) {
          seen.add(dep);
          extras.push(dep);
        }
      }
    }
  }
  return [...keys, ...extras];
}

export function groupDimensionAlias(g: string): string {
  return `g_${g.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function formatGroupLabel(g: string): string {
  return g.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildGroupedSelect(
  groupBy: string[],
  groupDimensions: Record<string, string>,
  aggregates: { field: string; operation: string }[],
  keys: string[],
  rmap: Map<string, RegisteredField>
): {
  selectParts: string[];
  groupExprs: string[];
  projectedKeys: string[];
  columnLabels: Record<string, string>;
} {
  const selectParts: string[] = [];
  const groupExprs: string[] = [];
  const projectedKeys: string[] = [];
  const columnLabels: Record<string, string> = {};

  for (const g of groupBy) {
    const gx = groupDimensions[g];
    const alias = groupDimensionAlias(g);
    selectParts.push(`${gx} AS "${alias}"`);
    groupExprs.push(gx);
    projectedKeys.push(alias);
    columnLabels[alias] = formatGroupLabel(g);
  }

  const aggs =
    aggregates.length ? aggregates : [{ field: keys[0]!, operation: 'COUNT' as const }];
  for (let i = 0; i < aggs.length; i++) {
    const agg = aggs[i]!;
    const fd = rmap.get(agg.field);
    if (!fd || isCalculatedField(fd)) throw new Error(`AGG_FIELD_INVALID:${agg.field}`);
    if (agg.operation === 'COUNT') {
      const alias = `agg_${i}_count`;
      selectParts.push(`COUNT(*)::bigint AS "${alias}"`);
      projectedKeys.push(alias);
      columnLabels[alias] = 'Count';
    } else {
      if (!fd.aggregatable) throw new Error(`FIELD_NOT_AGGREGATABLE:${agg.field}`);
      const alias = `agg_${i}_${agg.field.replace(/\W/g, '_')}_${agg.operation}`;
      selectParts.push(`${agg.operation}(${fd.sqlExpr}) AS "${alias}"`);
      projectedKeys.push(alias);
      columnLabels[alias] = `${agg.operation} ${fd.label}`;
    }
  }

  return { selectParts, groupExprs, projectedKeys, columnLabels };
}

export type CompiledReportQuery = {
  listSql: string;
  params: unknown[];
  countSql: string;
  countParams: unknown[];
  projectedKeys: string[];
  columnLabels?: Record<string, string>;
  isGrouped?: boolean;
};
