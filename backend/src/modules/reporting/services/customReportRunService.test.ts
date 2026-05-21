import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PoolClient } from 'pg';

import { PROJECT_SELLING_MODULE_KEY } from '../metadata/projectSellingFields.js';
import { getRegistryForModule } from '../metadata/moduleRegistries.js';
import { compileProjectSellingReport } from '../query-builder/projectSellingSqlCompiler.js';
import type { CustomReportGeneratePayload } from '../validators/reportConfigurationSchema.js';
import { runCustomReport } from './customReportRunService.js';

type QueryCall = {
  sql: string;
  params?: unknown[];
};

class FakeReportClient {
  readonly calls: QueryCall[] = [];

  constructor(private readonly opts: { throwOnSetLocal?: boolean; groupedRows?: boolean } = {}) {}

  async query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    this.calls.push({ sql, params });

    if (/^SET LOCAL\b/i.test(sql) && this.opts.throwOnSetLocal) {
      const err = new Error('SET LOCAL can only be used in transaction blocks');
      (err as Error & { code?: string }).code = '25001';
      throw err;
    }

    if (/^(SET|RESET)\b/i.test(sql)) {
      return { rows: [] };
    }

    if (/^SELECT COUNT\(\*\)::bigint AS c\b/i.test(sql)) {
      return { rows: [{ c: '1' }] };
    }

    if (this.opts.groupedRows) {
      return {
        rows: [
          {
            project_name: 'Alpha Project',
            count_booking_no: '2',
            g_project_name: 'Alpha Project',
            agg_0_count: '2',
          },
        ],
      };
    }

    return {
      rows: [
        {
          booking_no: 'B-1',
          selling_price: 100,
          invoice_paid_total: 40,
        },
      ],
    };
  }
}

describe('runCustomReport', () => {
  it('runs preview queries on a plain pooled client without using SET LOCAL outside a transaction', async () => {
    const client = new FakeReportClient({ throwOnSetLocal: true });
    const payload: CustomReportGeneratePayload = {
      module: PROJECT_SELLING_MODULE_KEY,
      fields: ['booking_no', 'outstanding_vs_invoices'],
      page: 1,
      pageSize: 50,
    };

    const result = await runCustomReport(
      client as unknown as PoolClient,
      'tenant-1',
      payload,
      'preview'
    );

    assert.equal(result.rows[0]?.booking_no, 'B-1');
    assert.equal(result.rows[0]?.outstanding_vs_invoices, 60);
    assert.match(client.calls[0]!.sql, /^SET statement_timeout\b/i);
    assert.ok(client.calls.some((call) => /^RESET statement_timeout\b/i.test(call.sql)));
  });

  it('projects grouped report aliases so grouped rows are returned with values', async () => {
    const client = new FakeReportClient({ groupedRows: true });
    const payload: CustomReportGeneratePayload = {
      module: PROJECT_SELLING_MODULE_KEY,
      fields: ['booking_no'],
      groupBy: ['project_name'],
      aggregates: [{ field: 'booking_no', operation: 'COUNT' }],
      page: 1,
      pageSize: 50,
    };

    const result = await runCustomReport(
      client as unknown as PoolClient,
      'tenant-1',
      payload,
      'preview'
    );

    assert.deepEqual(
      result.columns.map((col) => col.key),
      ['project_name', 'count_booking_no']
    );
    assert.equal(result.rows[0]?.project_name, 'Alpha Project');
    assert.equal(result.rows[0]?.count_booking_no, '2');
  });
});

describe('compileProjectSellingReport', () => {
  it('allows calculated display fields when grouping and defaults COUNT to the first real field', () => {
    const registry = getRegistryForModule(PROJECT_SELLING_MODULE_KEY);
    const payload: CustomReportGeneratePayload = {
      module: PROJECT_SELLING_MODULE_KEY,
      fields: ['booking_no', 'outstanding_vs_invoices'],
      groupBy: ['project_name'],
      page: 1,
      pageSize: 50,
    };

    const compiled = compileProjectSellingReport(registry, 'tenant-1', payload, 'preview');

    assert.deepEqual(compiled.projectedKeys, ['project_name', 'count_booking_no']);
    assert.match(compiled.listSql, /COUNT\(\*\)::bigint AS "count_booking_no"/);
  });
});
