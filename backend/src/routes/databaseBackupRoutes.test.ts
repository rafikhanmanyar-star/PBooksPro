import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPgRestoreFailureMessage } from './databaseBackupRoutes.js';

test('pg_restore exit code 1 is treated as a restore failure', () => {
  const msg = getPgRestoreFailureMessage(1, 'pg_restore: warning: errors ignored on restore: 2');

  assert.equal(msg, 'pg_restore: warning: errors ignored on restore: 2');
});

test('pg_restore exit code 0 is treated as success', () => {
  assert.equal(getPgRestoreFailureMessage(0, ''), null);
});
