import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDimensionFilter,
  buildDimensionSql,
  DIMENSION_FILTER_ALL,
  isDimensionScopeActive,
  journalLineMatchesDimensionScope,
  matchesDimensionScope,
  resolveJournalLineDimensions,
  scopeFromReportFilters,
} from '../shared/financial-core/dimensionScope.ts';

describe('dimensionScope', () => {
  it('no filter — consolidated scope matches all rows', () => {
    const scope = scopeFromReportFilters('all', 'all');
    assert.equal(isDimensionScopeActive(scope), false);
    assert.equal(matchesDimensionScope(scope, { projectId: 'p1', buildingId: 'b1' }), true);
    assert.equal(buildDimensionSql(scope, []), '');
  });

  it('project filter matches project_id on operational values', () => {
    const scope = scopeFromReportFilters('proj-a', 'all');
    assert.equal(isDimensionScopeActive(scope), true);
    assert.equal(matchesDimensionScope(scope, { projectId: 'proj-a', buildingId: 'b1' }), true);
    assert.equal(matchesDimensionScope(scope, { projectId: 'proj-b' }), false);
  });

  it('building filter matches building_id only', () => {
    const scope = scopeFromReportFilters('all', 'bld-1');
    assert.equal(matchesDimensionScope(scope, { projectId: 'p1', buildingId: 'bld-1' }), true);
    assert.equal(matchesDimensionScope(scope, { projectId: 'p1', buildingId: 'bld-2' }), false);
  });

  it('combined filter — building takes precedence over project', () => {
    const scope = { projectId: 'proj-a', buildingId: 'bld-1', costCenterId: DIMENSION_FILTER_ALL };
    assert.equal(
      matchesDimensionScope(scope, { projectId: 'proj-a', buildingId: 'bld-1' }),
      true
    );
    assert.equal(
      matchesDimensionScope(scope, { projectId: 'proj-a', buildingId: 'bld-2' }),
      false
    );
    assert.equal(
      matchesDimensionScope(scope, { projectId: 'proj-b', buildingId: 'bld-1' }),
      true
    );
  });

  it('applyDimensionFilter filters collections', () => {
    const scope = scopeFromReportFilters('p1', 'all');
    const items = [
      { id: '1', projectId: 'p1' },
      { id: '2', projectId: 'p2' },
    ];
    const out = applyDimensionFilter(items, scope, (x) => ({ projectId: x.projectId }));
    assert.deepEqual(out.map((x) => x.id), ['1']);
  });

  it('journalLineMatchesDimensionScope uses GL line/entry building_id (no transaction lookup)', () => {
    const scope = scopeFromReportFilters('all', 'bld-x');
    const line = { projectId: 'p1', buildingId: 'bld-x', costCenterId: null };
    const entry = { projectId: 'p1', buildingId: null, costCenterId: null };
    assert.equal(journalLineMatchesDimensionScope(line, entry, scope), true);

    const entryOnly = { projectId: null, buildingId: 'bld-x', costCenterId: null };
    const lineBare = { projectId: null, buildingId: null, costCenterId: null };
    assert.equal(journalLineMatchesDimensionScope(lineBare, entryOnly, scope), true);
    assert.equal(
      resolveJournalLineDimensions(lineBare, entryOnly).buildingId,
      'bld-x'
    );
  });

  it('buildDimensionSql uses journal_lines.building_id COALESCE', () => {
    const params: unknown[] = [1, 2];
    const sql = buildDimensionSql(scopeFromReportFilters('all', 'bld-9'), params, {
      lineAlias: 'jl',
      entryAlias: 'je',
    });
    assert.match(sql, /jl\.building_id/);
    assert.match(sql, /je\.building_id/);
    assert.doesNotMatch(sql, /transactions/);
    assert.equal(params.length, 3);
    assert.equal(params[2], 'bld-9');
  });

  it('buildDimensionSql project filter uses journal project columns', () => {
    const params: unknown[] = [];
    const sql = buildDimensionSql(scopeFromReportFilters('proj-z', 'all'), params);
    assert.match(sql, /jl\.project_id/);
    assert.match(sql, /je\.project_id/);
    assert.doesNotMatch(sql, /transactions/);
    assert.equal(params[0], 'proj-z');
  });
});
