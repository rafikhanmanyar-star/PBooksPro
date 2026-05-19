import assert from 'node:assert/strict';
import test from 'node:test';

import { getRegistryForModule } from '../metadata/moduleRegistries.js';
import { PROJECT_SELLING_MODULE_KEY } from '../metadata/projectSellingFields.js';
import { compileProjectSellingReport } from './projectSellingSqlCompiler.js';

test('grouped project selling reports project group dimensions and aggregate aliases', () => {
  const compiled = compileProjectSellingReport(
    getRegistryForModule(PROJECT_SELLING_MODULE_KEY),
    'tenant-1',
    {
      module: PROJECT_SELLING_MODULE_KEY,
      fields: ['booking_no'],
      groupBy: ['project_name'],
      aggregates: [{ field: 'selling_price', operation: 'SUM' }],
      page: 1,
      pageSize: 50,
    },
    'preview'
  );

  assert.deepEqual(compiled.projectedKeys, ['project_name', 'agg_0_selling_price_SUM']);
  assert.match(compiled.listSql, /AS "project_name"/);
  assert.match(compiled.listSql, /AS "agg_0_selling_price_SUM"/);
});
