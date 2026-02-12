import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  Headers,
  Param,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { WebhookValidator } from './webhook-validator.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private webhooksService: WebhooksService,
    private validator: WebhookValidator,
  ) {}

  // ── Facebook / Instagram Webhook ──

  /**
   * Facebook/Instagram webhook verification (challenge-response).
   * Called by Meta when subscribing to webhooks.
   */
  @Get('facebook')
  @ApiOperation({ summary: 'Facebook webhook verification' })
  verifyFacebook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    this.logger.log(`Facebook webhook verification: mode=${mode}`);
    this.validator.verifyChallenge('facebook', verifyToken);
    return challenge;
  }

  /**
   * Facebook/Instagram incoming webhook events.
   * Must respond with 200 within 20 seconds — we ACK immediately and queue for async processing.
   */
  @Post('facebook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Facebook webhook receiver' })
  async handleFacebook(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<string> {
    // Validate signature
    const rawBody = req.rawBody?.toString() || JSON.stringify(body);
    this.validator.validateSignature('facebook', rawBody, signature);

    // ACK immediately, process asynchronously
    await this.webhooksService.enqueueWebhookEvent('FACEBOOK', body);

    return 'EVENT_RECEIVED';
  }

  // ── Instagram (separate endpoint for clarity, same Meta webhook) ──

  @Get('instagram')
  @ApiOperation({ summary: 'Instagram webhook verification' })
  verifyInstagram(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    this.validator.verifyChallenge('instagram', verifyToken);
    return challenge;
  }

  @Post('instagram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Instagram webhook receiver' })
  async handleInstagram(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<string> {
    const rawBody = req.rawBody?.toString() || JSON.stringify(body);
    this.validator.validateSignature('instagram', rawBody, signature);
    await this.webhooksService.enqueueWebhookEvent('INSTAGRAM', body);
    return 'EVENT_RECEIVED';
  }

  // ── WhatsApp Business ──

  @Get('whatsapp')
  @ApiOperation({ summary: 'WhatsApp webhook verification' })
  verifyWhatsApp(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    this.validator.verifyChallenge('whatsapp', verifyToken);
    return challenge;
  }

  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WhatsApp webhook receiver' })
  async handleWhatsApp(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<string> {
    const rawBody = req.rawBody?.toString() || JSON.stringify(body);
    this.validator.validateSignature('whatsapp', rawBody, signature);
    await this.webhooksService.enqueueWebhookEvent('WHATSAPP', body);
    return 'EVENT_RECEIVED';
  }

  // ── Twitter / X ──

  @Get('twitter')
  @ApiOperation({ summary: 'Twitter CRC challenge' })
  verifyTwitter(@Query('crc_token') crcToken: string) {
    return this.validator.handleTwitterCRC(crcToken);
  }

  @Post('twitter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Twitter webhook receiver' })
  async handleTwitter(
    @Body() body: any,
    @Headers('x-twitter-webhooks-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<string> {
    const rawBody = req.rawBody?.toString() || JSON.stringify(body);
    this.validator.validateSignature('twitter', rawBody, signature);
    await this.webhooksService.enqueueWebhookEvent('TWITTER', body);
    return 'OK';
  }
}
