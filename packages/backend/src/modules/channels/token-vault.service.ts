import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Token Vault Service — Encrypts/decrypts OAuth tokens using AES-256-GCM.
 * 
 * In production, this should delegate to AWS KMS or HashiCorp Vault
 * for envelope encryption. This implementation uses a local key for development.
 */
@Injectable()
export class TokenVaultService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  private readonly ivLength: number;

  constructor(private config: ConfigService) {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');

    // Derive a 32-byte key from the configuration
    if (encryptionKey.length >= 64) {
      this.key = Buffer.from(encryptionKey, 'hex');
    } else {
      // Development fallback — use SHA-256 of the key string
      this.key = crypto.createHash('sha256').update(encryptionKey || 'dev-key').digest();
    }

    this.ivLength = this.config.get<number>('ENCRYPTION_IV_LENGTH', 16);
  }

  /**
   * Encrypt a plaintext token.
   * Returns the encrypted data (ciphertext + auth tag) and IV, both as hex strings.
   */
  encrypt(plaintext: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Append auth tag for integrity verification
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encrypted: `${encrypted}:${authTag}`,
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt an encrypted token.
   */
  decrypt(encryptedData: string, ivHex: string): string {
    const [encrypted, authTagHex] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
