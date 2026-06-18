import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRealtimeTraceEnabled, rtTrace } from '../services/realtime/realtimeTrace';

describe('realtimeTrace', () => {
  it('no-ops when VITE_DEBUG_REALTIME is not true', () => {
    assert.equal(isRealtimeTraceEnabled(), false);
    const original = console.log;
    let called = false;
    console.log = () => {
      called = true;
    };
    try {
      rtTrace('socket.received', { entityType: 'transaction' });
      assert.equal(called, false);
    } finally {
      console.log = original;
    }
  });
});
