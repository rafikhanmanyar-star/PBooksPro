import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canRestoreBackup } from './backupRestoreAuthService.js';

describe('canRestoreBackup', () => {
  it('allows super_admin and company_admin', () => {
    assert.equal(canRestoreBackup('super_admin'), true);
    assert.equal(canRestoreBackup('Super Admin'), true);
    assert.equal(canRestoreBackup('company_admin'), true);
    assert.equal(canRestoreBackup('admin'), true);
  });

  it('denies other roles', () => {
    assert.equal(canRestoreBackup('accountant'), false);
    assert.equal(canRestoreBackup('read_only'), false);
    assert.equal(canRestoreBackup('project_manager'), false);
  });
});
