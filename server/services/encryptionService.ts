import crypto from 'crypto';
import type { CipherGCM, DecipherGCM } from 'crypto';

/**
 * Encryption Service
 * Handles encryption and decryption of sensitive data like API keys
 * Uses AES-256-GCM for authenticated encryption
 */
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 32 bytes for AES-256
  private ivLength = 16; // 16 bytes for IV
  private saltLength = 64; // 64 bytes for salt
  private tagLength = 16; // 16 bytes for authentication tag
  private tagPosition = this.saltLength + this.ivLength;
  private encryptedPosition = this.tagPosition + this.tagLength;

  /**
   * Get encryption key from environment variable
   * Falls back to a default key if not set (not recommended for production)
   */
  private getEncryptionKey(): Buffer {
    const key = process.env.WHATSAPP_ENCRYPTION_KEY;
    if (!key) {
      console.warn('⚠️ WHATSAPP_ENCRYPTION_KEY not set, using default key (NOT SECURE FOR PRODUCTION)');
      // Use a default key if not set (32 bytes)
      return crypto.scryptSync('default-key-not-secure', 'salt', this.keyLength);
    }
    
    // Use the provided key (should be 32 bytes / 64 hex characters)
    if (key.length !== 64) {
      throw new Error('WHATSAPP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    
    return Buffer.from(key, 'hex');
  }

  /**
   * Derive key from master key and salt using PBKDF2
   */
  private deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(masterKey, salt, 100000, this.keyLength, 'sha256');
  }

  /**
   * Encrypt sensitive data (e.g., API keys)
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      return '';
    }

    const masterKey = this.getEncryptionKey();
    const salt = crypto.randomBytes(this.saltLength);
    const key = this.deriveKey(masterKey, salt);
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv) as CipherGCM;
    cipher.setAAD(Buffer.from('whatsapp-api-key', 'utf8')); // Additional authenticated data

    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const tag = cipher.getAuthTag();

    // Combine: salt + iv + tag + encrypted data
    const combined = Buffer.concat([salt, iv, tag, encrypted]);

    // Return as base64 string
    return combined.toString('base64');
  }

  /**
   * Decrypt encrypted data
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) {
      return '';
    }

    try {
      const masterKey = this.getEncryptionKey();
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = combined.subarray(0, this.saltLength);
      const iv = combined.subarray(this.saltLength, this.tagPosition);
      const tag = combined.subarray(this.tagPosition, this.encryptedPosition);
      const encrypted = combined.subarray(this.encryptedPosition);

      const key = this.deriveKey(masterKey, salt);

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as DecipherGCM;
      decipher.setAuthTag(tag);
      decipher.setAAD(Buffer.from('whatsapp-api-key', 'utf8'));

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data. Invalid encrypted data or wrong key.');
    }
  }

  /**
   * Generate a random encryption key (for setup)
   * Returns a 64-character hex string (32 bytes)
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
