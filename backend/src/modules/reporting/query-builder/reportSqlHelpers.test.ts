import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroupedSelect,
  buildGroupedOrderParts,
  groupDimensionAlias,
} from './reportSqlHelpers.js';
import type { RegisteredField } from '../metadata/fieldRegistryTypes.js';

const sampleFields: RegisteredField[] = [
  {
    key: 'selling_price',
    label: 'Selling price',
    type: 'number',
    entityGroup: 'Project Selling',
    filterable: true,
    sortable: true,
    aggregatable: true,
    searchable: false,
    sqlExpr: 'pa.selling_price',
  },
  {
    key: 'booking_no',
    label: 'Booking no',
    type: 'string',
    entityGroup: 'Project Selling',
    filterable: true,
    sortable: true,
    aggregatable: false,
    searchable: true,
    sqlExpr: 'pa.agreement_number',
  },
  {
    key: 'outstanding_vs_invoices',
    label: 'Outstanding',
    type: 'number',
    entityGroup: 'Discounts & pricing',
    filterable: false,
    sortable: false,
    aggregatable: false,
    searchable: false,
    kind: 'calculated',
    dependsOn: ['selling_price', 'invoice_paid_total'],
    sqlExpr: '0',
  },
];

describe('reportSqlHelpers grouping', () => {
  it('buildGroupedSelect emits SUM and COUNT aggregates', () => {
    const rmap = new Map(sampleFields.map((f) => [f.key, f]));
    const grouped = buildGroupedSelect(
      ['project_id'],
      { project_id: 'proj.id' },
      [
        { field: 'selling_price', operation: 'SUM' },
        { field: 'booking_no', operation: 'COUNT' },
      ],
      ['booking_no'],
      rmap
    );
    assert.ok(grouped.selectParts.some((s) => s.includes('SUM(pa.selling_price)')));
    assert.ok(grouped.selectParts.some((s) => s.includes('COUNT(*)')));
    assert.equal(grouped.projectedKeys.length, 3);
  });

  it('rejects calculated fields for aggregates', () => {
    const rmap = new Map(sampleFields.map((f) => [f.key, f]));
    assert.throws(
      () =>
        buildGroupedSelect(
          ['project_id'],
          { project_id: 'proj.id' },
          [{ field: 'outstanding_vs_invoices', operation: 'SUM' }],
          ['booking_no'],
          rmap
        ),
      /AGG_FIELD_INVALID/
    );
  });

  it('buildGroupedOrderParts accepts dimension and aggregate aliases', () => {
    const projected = [groupDimensionAlias('project_id'), 'agg_0_selling_price_SUM'];
    const parts = buildGroupedOrderParts(
      [
        { field: 'project_id', direction: 'ASC' },
        { field: 'agg_0_selling_price_SUM', direction: 'DESC' },
      ],
      { project_id: 'proj.id' },
      projected
    );
    assert.equal(parts.length, 2);
    assert.match(parts[0]!, /g_project_id/);
    assert.match(parts[1]!, /agg_0_selling_price_SUM/);
  });
});
