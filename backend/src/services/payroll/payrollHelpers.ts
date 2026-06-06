import type pg from 'pg';

export function iso(d: Date | string | null | undefined): string | undefined {
  if (d == null) return undefined;
  const x = d instanceof Date ? d : new Date(String(d));
  if (isNaN(x.getTime())) return undefined;
  return x.toISOString();
}

export function dateStr(d: Date | string | null | undefined): string {
  if (d == null) return '';
  if (typeof d === 'string') {
    const t = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const s = iso(d);
  return s ? s.slice(0, 10) : '';
}

export function numStr(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(String(v || '0')) || 0;
}

export function j<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

export function optStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export async function changedSince<T extends pg.QueryResultRow>(
  client: pg.PoolClient,
  sql: string,
  tenantId: string,
  since: Date
): Promise<T[]> {
  const r = await client.query<T>(sql, [tenantId, since]);
  return r.rows;
}
