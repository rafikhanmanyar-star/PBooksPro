import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_REFRESH_COOLDOWN_MS,
  isWithinRefreshCooldown,
  shouldSkipInitialSocketConnect,
  shouldSkipRemoteReducerPatch,
  TAB_VISIBILITY_COOLDOWN_MS,
} from '../services/realtime/entityEventRefreshPolicy';

describe('entityEventRefreshPolicy', () => {
  it('C-5: own mutation skips reducer patch only', () => {
    assert.equal(shouldSkipRemoteReducerPatch('user-a', 'user-a'), true);
    assert.equal(shouldSkipRemoteReducerPatch('user-a', 'user-b'), false);
    assert.equal(shouldSkipRemoteReducerPatch(undefined, 'user-b'), false);
  });

  it('skips first socket connect for reconnect refresh', () => {
    assert.equal(shouldSkipInitialSocketConnect(true), true);
    assert.equal(shouldSkipInitialSocketConnect(false), false);
  });

  it('respects API refresh cooldown', () => {
    const now = 10_000;
    assert.equal(isWithinRefreshCooldown(now, 9_000, API_REFRESH_COOLDOWN_MS), true);
    assert.equal(isWithinRefreshCooldown(now, 1_000, API_REFRESH_COOLDOWN_MS), false);
  });

  it('respects tab visibility cooldown', () => {
    const now = 40_000;
    assert.equal(isWithinRefreshCooldown(now, 20_000, TAB_VISIBILITY_COOLDOWN_MS), true);
    assert.equal(isWithinRefreshCooldown(now, 5_000, TAB_VISIBILITY_COOLDOWN_MS), false);
  });
});
