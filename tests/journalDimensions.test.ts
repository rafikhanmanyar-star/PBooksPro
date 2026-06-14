import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryDimensionsFrom,
  journalLineWithDimensions,
  normalizeDimensionId,
  resolveJournalDimensions,
} from '../shared/financial-core/journalDimensions.ts';

describe('journalDimensions', () => {
  it('normalizeDimensionId trims and drops empty', () => {
    assert.equal(normalizeDimensionId('  p1  '), 'p1');
    assert.equal(normalizeDimensionId(''), null);
    assert.equal(normalizeDimensionId(null), null);
    assert.equal(normalizeDimensionId(undefined), null);
  });

  it('resolveJournalDimensions reads snake_case and camelCase', () => {
    assert.deepEqual(
      resolveJournalDimensions({
        project_id: 'proj-1',
        building_id: 'bld-1',
        cost_center_code: 'CC-HQ',
      }),
      {
        projectId: 'proj-1',
        buildingId: 'bld-1',
        costCenterId: 'CC-HQ',
      }
    );
    assert.deepEqual(
      resolveJournalDimensions({ projectId: 'p2', buildingId: 'b2', costCenterId: 'cc2' }),
      {
        projectId: 'p2',
        buildingId: 'b2',
        costCenterId: 'cc2',
      }
    );
  });

  it('journalLineWithDimensions applies entry-level dims to both legs', () => {
    const dims = resolveJournalDimensions({ project_id: 'p1', building_id: 'b1' });
    const line = journalLineWithDimensions(
      { accountId: 'acc-a', debitAmount: 100, creditAmount: 0 },
      dims
    );
    assert.equal(line.projectId, 'p1');
    assert.equal(line.buildingId, 'b1');
    assert.equal(line.costCenterId, null);
  });

  it('entryDimensionsFrom maps to journal body fields', () => {
    const dims = resolveJournalDimensions({ projectId: 'p1', buildingId: 'b1' });
    assert.deepEqual(entryDimensionsFrom(dims), {
      projectId: 'p1',
      buildingId: 'b1',
      costCenterId: null,
    });
  });
});
