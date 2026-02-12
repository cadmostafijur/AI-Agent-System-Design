import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookValidator {
  private readonly logger = new Logger(WebhookValidator.name);

  constructor(private config: ConfigService) {}

  /**
   * Verify webhook challenge (Facebook/Instagram/WhatsApp hub.verify_token).
   */
  verifyChallenge(channel: string, verifyToken: string): void {
    const expectedToken = this.getVerifyToken(channel);

    if (verifyToken !== expectedToken) {
      this.logger.warn(`Invalid verify token for ${channel}`);
      throw new ForbiddenException('Invalid verify token');
    }
  }

  /**
   * Validate webhook signature to ensure the request comes from the platform.
   * Uses HMAC-SHA256 verification.
   */
  validateSignature(channel: string, rawBody: string, signature: string): void {
    if (!signature) {
      this.logger.warn(`Missing signature for ${channel} webhook`);
      throw new ForbiddenException('Missing webhook signature');
    }

    const secret = this.getAppSecret(channel);
    const expectedSignature = this.computeSignature(channel, rawBody, secret);

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.logger.warn(`Invalid signature for ${channel} webhook`);
      throw new ForbiddenException('Invalid webhook signature');
    }
  }

  /**
   * Handle Twitter CRC (Challenge-Response Check).
   * Twitter sends a crc_token that must be signed with the consumer secret.
   */
  handleTwitterCRC(crcToken: string): { response_token: string } {
    const consumerSecret = this.config.get<string>('TWITTER_API_SECRET', '');
    const hmac = crypto
      .createHmac('sha256', consumerSecret)
      .update(crcToken)
      .digest('base64');

    return { response_token: `sha256=${hmac}` };
  }

  // ── Private Helpers ──

  private getVerifyToken(channel: string): string {
    const tokenMap: Record<string, string> = {
      facebook: this.config.get<string>('FACEBOOK_VERIFY_TOKEN', ''),
      instagram: this.config.get<string>('FACEBOOK_VERIFY_TOKEN', ''), // Same as FB
      whatsapp: this.config.get<string>('WHATSAPP_VERIFY_TOKEN', ''),
    };
    return tokenMap[channel] || '';
  }

  private getAppSecret(channel: string): string {
    const secretMap: Record<string, string> = {
      facebook: this.config.get<string>('FACEBOOK_APP_SECRET', ''),
      instagram: this.config.get<string>('FACEBOOK_APP_SECRET', ''),
      whatsapp: this.config.get<string>('FACEBOOK_APP_SECRET', ''), // WhatsApp uses FB app secret
      twitter: this.config.get<string>('TWITTER_API_SECRET', ''),
    };
    return secretMap[channel] || '';
  }

  private computeSignature(channel: string, body: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (channel === 'twitter') {
      return `sha256=${Buffer.from(
        crypto.createHmac('sha256', secret).update(body).digest(),
      ).toString('base64')}`;
    }

    // Facebook/Instagram/WhatsApp use sha256=hex format
    return `sha256=${hmac}`;
  }
}
