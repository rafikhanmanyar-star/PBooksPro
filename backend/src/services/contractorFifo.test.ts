import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allocateAdvancesFifo, type AdvanceRemains } from './contractorFifo.js';

describe('allocateAdvancesFifo', () => {
  it('consumes FIFO by advanceDate then id', () => {
    const rows: AdvanceRemains[] = [
      { id: 'b', advanceDate: '2026-02-01', remainingAmount: 100 },
      { id: 'a', advanceDate: '2026-01-01', remainingAmount: 50 },
      { id: 'c', advanceDate: '2026-01-01', remainingAmount: 30 },
    ];
    const got = allocateAdvancesFifo(rows, 70);
    assert.deepEqual(got, [
      { advanceId: 'a', amount: 50 },
      { advanceId: 'c', amount: 20 },
    ]);
  });

  it('returns empty when bill amount zero', () => {
    assert.deepEqual(allocateAdvancesFifo([{ id: 'x', advanceDate: '2026-01-01', remainingAmount: 10 }], 0), []);
  });

  it('respects depleted advances', () => {
    assert.deepEqual(
      allocateAdvancesFifo(
        [
          { id: 'z', advanceDate: '2026-03-01', remainingAmount: 0 },
          { id: 'y', advanceDate: '2026-03-02', remainingAmount: 25 },
        ],
        100
      ),
      [{ advanceId: 'y', amount: 25 }]
    );
  });
});
