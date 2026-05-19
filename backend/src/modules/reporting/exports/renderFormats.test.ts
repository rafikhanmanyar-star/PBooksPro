import assert from 'node:assert/strict';
import test from 'node:test';

import { preparePdfGridForExport } from './renderFormats.js';

test('PDF report export includes rows and columns beyond the old preview caps', async () => {
  const columns = Array.from({ length: 9 }, (_, i) => `col_${i + 1}`);
  const labels = Object.fromEntries(columns.map((c, i) => [c, `Column ${i + 1}`]));
  const rows = Array.from({ length: 201 }, (_, i) =>
    Object.fromEntries(columns.map((c, j) => [c, `row-${i + 1}-col-${j + 1}`]))
  );

  const grid = preparePdfGridForExport({ columns, labels, rows });

  assert.equal(grid.titles.at(-1), 'Column 9');
  assert.equal(grid.rows.at(-1)?.at(-1), 'row-201-col-9');
});
