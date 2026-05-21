import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

import type { RegisteredField } from '../metadata/fieldRegistryTypes.js';
import { isCalculatedField } from '../metadata/fieldRegistryTypes.js';
import { getRegistryForModule } from '../metadata/moduleRegistries.js';
import { PROJECT_SELLING_MODULE_KEY } from '../metadata/projectSellingFields.js';
import { compileProjectSellingReport } from '../query-builder/projectSellingSqlCompiler.js';
import type { CustomReportGeneratePayload } from '../validators/reportConfigurationSchema.js';

import {
  evaluateNumericFormula,
  evaluateTemplateFormula,
} from './formulaEvaluator.js';
import { memoryCacheGet, memoryCacheSet } from '../../../utils/memoryCache.js';

export type GeneratedColumnMeta = {
  key: string;
  label: string;
  type: string;
};

export type GeneratedReportResult = {
  columns: GeneratedColumnMeta[];
  rows: Record<string, unknown>[];
  totalCount: number;
  page: number;
  pageSize: number;
};

function fieldMap(registry: RegisteredField[]): Map<string, RegisteredField> {
  const m = new Map<string, RegisteredField>();
  for (const f of registry) m.set(f.key, f);
  return m;
}

export function stableSerialize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((x) => stableSerialize(x)).join(',')}]`;
  }
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(o[k])}`).join(',')}}`;
}

function normalizePgRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
  }
  return out;
}

/** Copies values under lowercase aliases so `{field}` formulas and accessors align with PG identifier casing. */
function augmentCaseInsensitiveAliases(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(row)) {
    const lk = k.toLowerCase();
    if (!(lk in out)) {
      out[lk] = v;
    }
  }
  return out;
}

function rawGet(full: Record<string, unknown>, k: string): unknown {
  if (full[k] !== undefined && full[k] !== null) return full[k];
  const lk = k.toLowerCase();
  if (full[lk] !== undefined && full[lk] !== null) return full[lk];
  for (const [key, val] of Object.entries(full)) {
    if (key.toLowerCase() === lk) return val;
  }
  return full[k];
}

export function deriveColumnLabels(
  registryRows: RegisteredField[],
  projectedKeys: string[],
  payload: CustomReportGeneratePayload,
  formulas: { key: string; label?: string }[] | undefined
): { labels: Record<string, string>; metas: GeneratedColumnMeta[] } {
  const rmap = fieldMap(registryRows);
  const labels: Record<string, string> = {};
  const cols: GeneratedColumnMeta[] = [];
  const colCfgs =
    payload.columns?.reduce((m, c) => {
      m.set(c.key, c);
      return m;
    }, new Map<string, { headerLabel?: string }>()) ?? new Map();
  for (const k of projectedKeys) {
    const def = rmap.get(k);
    const label = colCfgs.get(k)?.headerLabel ?? (def ? def.label : k);
    labels[k] = label;
    cols.push({
      key: k,
      label,
      type: def?.type ?? 'string',
    });
  }
  for (const f of formulas ?? []) {
    labels[f.key] = f.label ?? f.key;
    cols.push({
      key: f.key,
      label: labels[f.key] ?? f.key,
      type: 'number',
    });
  }
  return { labels, metas: cols };
}

function applyComputedExpressions(
  rmap: Map<string, RegisteredField>,
  projectedKeys: string[],
  payload: CustomReportGeneratePayload,
  full: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of projectedKeys) {
    const def = rmap.get(k);
    if (def && isCalculatedField(def)) {
      try {
        out[k] = evaluateTemplateFormula(def.formula, full);
      } catch {
        out[k] = null;
      }
    } else {
      out[k] = rawGet(full, k);
    }
  }
  for (const f of payload.formulas ?? []) {
    try {
      out[f.key] = evaluateNumericFormula(f.expression, full);
    } catch {
      out[f.key] = null;
    }
  }
  return out;
}

export async function runCustomReport(
  client: PoolClient,
  tenantId: string,
  payload: CustomReportGeneratePayload,
  mode: 'preview' | 'export'
): Promise<GeneratedReportResult> {
  const registryPack = getRegistryForModule(payload.module);
  const rmap = fieldMap(registryPack.fields);
  let compiled;
  if (payload.module === PROJECT_SELLING_MODULE_KEY) {
    compiled = compileProjectSellingReport(registryPack, tenantId, payload, mode);
  } else {
    throw new Error(`UNSUPPORTED_MODULE:${payload.module}`);
  }

  const cacheSalt = stableSerialize({
    ...payload,
    mode,
    v: 2,
  });
  const cacheHash = createHash('sha256').update(cacheSalt).digest('hex');
  const cacheKey =
    mode === 'preview'
      ? `customReport:v1:${tenantId}:${payload.module}:${cacheHash}`
      : '';

  if (cacheKey && mode === 'preview') {
    const hit = memoryCacheGet<GeneratedReportResult>(cacheKey);
    if (hit) return hit;
  }

  await client.query(`SET statement_timeout TO '35000'`);

  try {
    const listRes = await client.query(compiled.listSql, compiled.params);
    const countRes = await client.query<{ c: string }>(compiled.countSql, compiled.countParams);
    const totalCount = Number(countRes.rows[0]?.c ?? 0);
    const page = payload.page ?? 1;
    const pageSize = Math.min(payload.pageSize ?? 50, mode === 'export' ? 5000 : 500);

    const rowsIn = listRes.rows.map((r) =>
      augmentCaseInsensitiveAliases(normalizePgRow(r as Record<string, unknown>))
    );
    const rows = rowsIn.map((full) =>
      applyComputedExpressions(rmap, compiled.projectedKeys, payload, full)
    );

    const { metas } = deriveColumnLabels(
      registryPack.fields,
      compiled.projectedKeys,
      payload,
      payload.formulas
    );

    const result: GeneratedReportResult = {
      columns: metas,
      rows,
      totalCount,
      page,
      pageSize,
    };

    if (cacheKey) memoryCacheSet(cacheKey, result, 15_000);
    return result;
  } finally {
    await client.query('RESET statement_timeout');
  }
}
