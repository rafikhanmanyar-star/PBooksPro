import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../context/appInitialState';
import { applyEntityReducerPatch } from '../services/realtime/entityReducerPatch';
import type { AppAction } from '../types';

describe('entityReducerPatch', () => {
  it('dispatches ADD_TRANSACTION for remote transaction create', () => {
    const actions: AppAction[] = [];
    applyEntityReducerPatch(
      {
        type: 'transaction',
        action: 'created',
        data: {
          id: 'tx-1',
          type: 'expense',
          amount: 100,
          date: '2026-01-01',
          accountId: 'acc-1',
        },
      },
      {
        latestState: initialState,
        dispatch: (a) => actions.push(a),
      }
    );

    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'ADD_TRANSACTION');
    assert.equal((actions[0] as { _isRemote?: boolean })._isRemote, true);
  });

  it('dispatches DELETE_BILL for remote bill delete', () => {
    const actions: AppAction[] = [];
    applyEntityReducerPatch(
      {
        type: 'bill',
        action: 'deleted',
        id: 'bill-1',
      },
      {
        latestState: initialState,
        dispatch: (a) => actions.push(a),
      }
    );

    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'DELETE_BILL');
    assert.equal((actions[0] as { payload: string }).payload, 'bill-1');
  });

  it('skips stale versioned project patch', () => {
    const actions: AppAction[] = [];
    applyEntityReducerPatch(
      {
        type: 'project',
        action: 'updated',
        data: { id: 'proj-1', name: 'Old', version: 1 },
      },
      {
        latestState: {
          ...initialState,
          projects: [{ id: 'proj-1', name: 'New', version: 5 } as never],
        },
        dispatch: (a) => actions.push(a),
      }
    );

    assert.equal(actions.length, 0);
  });
});
