import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptBackupPayload,
  decryptBackupPayload,
  encryptSecret,
  decryptSecret,
  sha256Hex,
  isEncryptedBackupPayload,
  encryptBackupWithPassword,
  decryptBackupWithPassword,
  isPasswordEncryptedBackup,
  encryptBackupForDownload,
  decryptBackupFile,
  maskSecret,
} from './backupCryptoService.js';

describe('backupCryptoService', () => {
  const prevJwt = process.env.JWT_SECRET;
  const prevEnc = process.env.BACKUP_ENCRYPTION_KEY;
  const prevMaster = process.env.BACKUP_STORAGE_MASTER_KEY;

  before(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-backup-crypto-32chars!';
    process.env.BACKUP_ENCRYPTION_KEY = 'test-backup-encryption-key-value!!';
    process.env.BACKUP_STORAGE_MASTER_KEY = 'test-storage-master-key-value!!!';
  });

  after(() => {
    process.env.JWT_SECRET = prevJwt;
    process.env.BACKUP_ENCRYPTION_KEY = prevEnc;
    process.env.BACKUP_STORAGE_MASTER_KEY = prevMaster;
  });

  it('encrypts and decrypts backup payload round-trip', () => {
    const plain = Buffer.from('pg_dump fake binary content', 'utf8');
    const enc = encryptBackupPayload(plain);
    assert.ok(isEncryptedBackupPayload(enc));
    assert.notDeepEqual(enc.subarray(0, 32), plain.subarray(0, Math.min(32, plain.length)));
    const dec = decryptBackupPayload(enc);
    assert.deepEqual(dec, plain);
  });

  it('computes sha256 hex', () => {
    const h = sha256Hex(Buffer.from('abc', 'utf8'));
    assert.equal(h.length, 64);
    assert.match(h, /^[a-f0-9]+$/);
  });

  it('encrypts and decrypts storage secrets', () => {
    const stored = encryptSecret('AKIAEXAMPLEKEY');
    assert.notEqual(stored, 'AKIAEXAMPLEKEY');
    assert.equal(decryptSecret(stored), 'AKIAEXAMPLEKEY');
  });

  it('encrypts and decrypts password-protected backup (PBKENC2)', () => {
    const plain = Buffer.from('pg_dump fake binary content', 'utf8');
    const enc = encryptBackupWithPassword(plain, 'my-secure-password');
    assert.ok(isPasswordEncryptedBackup(enc));
    const dec = decryptBackupWithPassword(enc, 'my-secure-password');
    assert.deepEqual(dec, plain);
  });

  it('encryptBackupForDownload uses password or server key', () => {
    const plain = Buffer.from('data', 'utf8');
    const withPwd = encryptBackupForDownload(plain, 'longpassword1');
    assert.ok(isPasswordEncryptedBackup(withPwd));
    const withServer = encryptBackupForDownload(plain);
    assert.ok(isEncryptedBackupPayload(withServer));
  });

  it('decryptBackupFile handles nested server then password', () => {
    const plain = Buffer.from('nested', 'utf8');
    const pwdEnc = encryptBackupWithPassword(plain, 'longpassword1');
    const serverEnc = encryptBackupPayload(pwdEnc);
    const dec = decryptBackupFile(serverEnc, { password: 'longpassword1' });
    assert.deepEqual(dec, plain);
  });

  it('masks secrets for display', () => {
    assert.equal(maskSecret('ABCDEFGH'), '****EFGH');
    assert.equal(maskSecret('ab'), '****');
  });
});

describe('providerFactory defaultEndpointHint', () => {
  it('returns hints for all providers', async () => {
    const { defaultEndpointHint } = await import('./storage/providerFactory.js');
    assert.ok(defaultEndpointHint('aws_s3').length > 0);
    assert.ok(defaultEndpointHint('cloudflare_r2').includes('r2'));
    assert.ok(defaultEndpointHint('azure_blob').length > 0);
  });
});
