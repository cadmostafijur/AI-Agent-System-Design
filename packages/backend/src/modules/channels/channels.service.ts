import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { TokenVaultService } from './token-vault.service';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private tokenVault: TokenVaultService,
  ) {}

  /**
   * List all channels for a tenant.
   */
  async listChannels(tenantId: string) {
    return this.prisma.channel.findMany({
      where: { tenantId },
      select: {
        id: true,
        type: true,
        name: true,
        status: true,
        autoReplyEnabled: true,
        platformPageId: true,
        createdAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Initiate OAuth connection for a social channel.
   * Returns the OAuth URL that the frontend should redirect to.
   */
  async initiateConnection(tenantId: string, channelType: string) {
    const oauthUrl = this.buildOAuthUrl(channelType, tenantId);
    return { oauthUrl, channelType };
  }

  /**
   * Handle OAuth callback — exchange code for tokens and store securely.
   */
  async handleOAuthCallback(
    tenantId: string,
    channelType: string,
    code: string,
    state: string,
  ) {
    // Exchange authorization code for access token
    const tokenData = await this.exchangeCodeForToken(channelType, code);

    // Encrypt and store tokens
    const { encrypted, iv } = this.tokenVault.encrypt(tokenData.accessToken);

    // Get page/account info from the platform
    const pageInfo = await this.fetchPageInfo(channelType, tokenData.accessToken);

    // Create or update channel
    const channel = await this.prisma.channel.upsert({
      where: {
        tenantId_type_platformPageId: {
          tenantId,
          type: channelType as any,
          platformPageId: pageInfo.id,
        },
      },
      update: {
        name: pageInfo.name,
        accessTokenEnc: encrypted,
        tokenIv: iv,
        tokenExpiresAt: tokenData.expiresAt,
        status: 'ACTIVE',
      },
      create: {
        tenantId,
        type: channelType as any,
        platformPageId: pageInfo.id,
        name: pageInfo.name,
        accessTokenEnc: encrypted,
        tokenIv: iv,
        tokenExpiresAt: tokenData.expiresAt,
        config: {},
      },
    });

    // Subscribe to platform webhooks
    await this.subscribeToWebhooks(channelType, tokenData.accessToken, pageInfo.id);

    this.logger.log(`Channel connected: ${channelType}/${pageInfo.name} for tenant ${tenantId}`);

    return {
      id: channel.id,
      type: channel.type,
      name: channel.name,
      status: channel.status,
    };
  }

  /**
   * Disconnect a channel — revoke tokens and unsubscribe webhooks.
   */
  async disconnectChannel(tenantId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, tenantId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Decrypt token for cleanup
    try {
      const accessToken = this.tokenVault.decrypt(channel.accessTokenEnc, channel.tokenIv);
      await this.unsubscribeWebhooks(channel.type, accessToken, channel.platformPageId);
    } catch (error) {
      this.logger.warn(`Failed to unsubscribe webhooks for channel ${channelId}: ${error.message}`);
    }

    // Mark as disconnected (soft delete — preserve conversation history)
    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        status: 'DISCONNECTED',
        accessTokenEnc: '',
        tokenIv: '',
      },
    });

    return { success: true };
  }

  /**
   * Get decrypted access token for a channel (used by workers to send messages).
   */
  async getAccessToken(channelId: string): Promise<string> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel || channel.status !== 'ACTIVE') {
      throw new NotFoundException('Active channel not found');
    }

    return this.tokenVault.decrypt(channel.accessTokenEnc, channel.tokenIv);
  }

  // ── Private: OAuth Helpers ──

  private buildOAuthUrl(channelType: string, tenantId: string): string {
    const state = Buffer.from(JSON.stringify({ tenantId, ts: Date.now() })).toString('base64');

    switch (channelType) {
      case 'FACEBOOK':
      case 'INSTAGRAM':
        const fbAppId = this.config.get<string>('FACEBOOK_APP_ID');
        const fbRedirect = `${this.config.get('APP_URL')}/api/v1/auth/callback/facebook`;
        const fbScopes = channelType === 'FACEBOOK'
          ? 'pages_messaging,pages_read_engagement,pages_manage_metadata'
          : 'instagram_basic,instagram_manage_messages,pages_manage_metadata';
        return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(fbRedirect)}&scope=${fbScopes}&state=${state}`;

      case 'WHATSAPP':
        // WhatsApp Business uses embedded signup flow
        const waAppId = this.config.get<string>('FACEBOOK_APP_ID');
        return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${waAppId}&redirect_uri=${encodeURIComponent(this.config.get('APP_URL') + '/api/v1/auth/callback/whatsapp')}&scope=whatsapp_business_management,whatsapp_business_messaging&state=${state}`;

      case 'TWITTER':
        // Twitter OAuth 2.0 with PKCE
        const twitterClientId = this.config.get<string>('TWITTER_API_KEY');
        return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${twitterClientId}&redirect_uri=${encodeURIComponent(this.config.get('APP_URL') + '/api/v1/auth/callback/twitter')}&scope=dm.read%20dm.write%20tweet.read%20users.read&state=${state}&code_challenge=challenge&code_challenge_method=plain`;

      default:
        throw new BadRequestException(`Unsupported channel type: ${channelType}`);
    }
  }

  private async exchangeCodeForToken(channelType: string, code: string): Promise<{ accessToken: string; expiresAt?: Date }> {
    // Platform-specific token exchange — simplified implementation
    // In production, each platform has its own token exchange flow
    switch (channelType) {
      case 'FACEBOOK':
      case 'INSTAGRAM':
      case 'WHATSAPP': {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/oauth/access_token?` +
          `client_id=${this.config.get('FACEBOOK_APP_ID')}` +
          `&client_secret=${this.config.get('FACEBOOK_APP_SECRET')}` +
          `&code=${code}` +
          `&redirect_uri=${encodeURIComponent(this.config.get('APP_URL') + '/api/v1/auth/callback/facebook')}`,
        );
        const data = await response.json() as any;
        const expiresAt = data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : undefined;
        return { accessToken: data.access_token, expiresAt };
      }

      case 'TWITTER': {
        const response = await fetch('https://api.twitter.com/2/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${this.config.get('TWITTER_API_KEY')}:${this.config.get('TWITTER_API_SECRET')}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${this.config.get('APP_URL')}/api/v1/auth/callback/twitter`,
            code_verifier: 'challenge',
          }),
        });
        const data = await response.json() as any;
        return { accessToken: data.access_token, expiresAt: new Date(Date.now() + 7200 * 1000) };
      }

      default:
        throw new BadRequestException(`Unsupported channel: ${channelType}`);
    }
  }

  private async fetchPageInfo(channelType: string, accessToken: string): Promise<{ id: string; name: string }> {
    // Fetch the page/account info from the platform
    switch (channelType) {
      case 'FACEBOOK': {
        const res = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
        const data = await res.json() as any;
        const page = data.data?.[0];
        return { id: page?.id || 'unknown', name: page?.name || 'Facebook Page' };
      }
      case 'INSTAGRAM': {
        const res = await fetch(`https://graph.facebook.com/v18.0/me?fields=instagram_business_account&access_token=${accessToken}`);
        const data = await res.json() as any;
        return { id: data.instagram_business_account?.id || 'unknown', name: 'Instagram Account' };
      }
      case 'WHATSAPP': {
        return { id: this.config.get('WHATSAPP_PHONE_NUMBER_ID', 'unknown'), name: 'WhatsApp Business' };
      }
      case 'TWITTER': {
        const res = await fetch('https://api.twitter.com/2/users/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json() as any;
        return { id: data.data?.id || 'unknown', name: data.data?.name || 'Twitter Account' };
      }
      default:
        return { id: 'unknown', name: 'Unknown Channel' };
    }
  }

  private async subscribeToWebhooks(channelType: string, accessToken: string, pageId: string): Promise<void> {
    // Subscribe to platform webhooks — platform-specific
    this.logger.log(`Subscribing to ${channelType} webhooks for page ${pageId}`);
    // Implementation varies by platform — Meta uses subscribed_apps endpoint, Twitter uses Account Activity API
  }

  private async unsubscribeWebhooks(channelType: string, accessToken: string, pageId: string): Promise<void> {
    this.logger.log(`Unsubscribing from ${channelType} webhooks for page ${pageId}`);
  }
}
