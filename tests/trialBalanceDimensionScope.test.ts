import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrialBalanceDimensionParam } from '../backend/src/services/trialBalanceReportService.ts';
import {
  isDimensionScopeActive,
  scopeFromReportFilters,
  scopeTargetsBuilding,
} from '../shared/financial-core/dimensionScope.ts';

describe('trial balance dimension scope', () => {
  it('parseTrialBalanceDimensionParam treats all/empty as unset', () => {
    assert.equal(parseTrialBalanceDimensionParam(undefined), undefined);
    assert.equal(parseTrialBalanceDimensionParam(''), undefined);
    assert.equal(parseTrialBalanceDimensionParam('all'), undefined);
    assert.equal(parseTrialBalanceDimensionParam(' ALL '), undefined);
  });

  it('parseTrialBalanceDimensionParam returns trimmed id', () => {
    assert.equal(parseTrialBalanceDimensionParam(' proj-1 '), 'proj-1');
  });

  it('scopeFromReportFilters builds active project scope', () => {
    const scope = scopeFromReportFilters('p1', undefined, undefined);
    assert.equal(isDimensionScopeActive(scope), true);
    assert.equal(scope.projectId, 'p1');
  });

  it('scopeFromReportFilters prefers building when both set', () => {
    const scope = scopeFromReportFilters('p1', 'b1', undefined);
    assert.equal(scopeTargetsBuilding(scope), true);
  });
});
