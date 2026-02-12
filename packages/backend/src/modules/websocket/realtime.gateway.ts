import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../database/redis.service';

/**
 * Real-time WebSocket Gateway.
 * 
 * Handles:
 * - Tenant-scoped rooms (each tenant gets isolated rooms)
 * - New message notifications
 * - Lead updates
 * - Conversation status changes
 * - Typing indicators
 * 
 * Uses Redis pub/sub for horizontal scaling across multiple API instances.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private connectedUsers = new Map<string, { tenantId: string; userId: string }>();

  constructor(
    private jwtService: JwtService,
    private redis: RedisService,
  ) {
    // Subscribe to Redis pub/sub channels for cross-instance messaging
    this.setupRedisSubscriptions();
  }

  /**
   * Authenticate WebSocket connections using JWT.
   */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const tenantId = payload.tid;
      const userId = payload.sub;

      // Store connection info
      this.connectedUsers.set(client.id, { tenantId, userId });

      // Join tenant-specific rooms
      client.join(`tenant:${tenantId}`);
      client.join(`user:${userId}`);

      this.logger.log(`Client connected: ${client.id} (tenant: ${tenantId}, user: ${userId})`);
    } catch (error) {
      this.logger.warn(`WebSocket auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userInfo = this.connectedUsers.get(client.id);
    this.connectedUsers.delete(client.id);
    if (userInfo) {
      this.logger.log(`Client disconnected: ${client.id} (user: ${userInfo.userId})`);
    }
  }

  /**
   * Handle conversation subscription — client wants updates for a specific conversation.
   */
  @SubscribeMessage('join:conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) return;

    client.join(`conversation:${data.conversationId}`);
    this.logger.debug(`User ${userInfo.userId} joined conversation ${data.conversationId}`);
  }

  @SubscribeMessage('leave:conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  /**
   * Emit events to specific tenant rooms.
   * Called by workers/services when data changes.
   */
  emitToTenant(tenantId: string, event: string, data: any) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  emitToConversation(conversationId: string, event: string, data: any) {
    this.server.to(`conversation:${conversationId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Set up Redis pub/sub for cross-instance event distribution.
   */
  private setupRedisSubscriptions() {
    // Pattern: tenant:{id}:conversations, tenant:{id}:leads
    const channels = ['conversations', 'leads', 'notifications'];

    for (const channel of channels) {
      this.redis.subscribe(`broadcast:${channel}`, (message) => {
        try {
          const data = JSON.parse(message);
          if (data.tenantId) {
            this.emitToTenant(data.tenantId, data.event || channel, data.payload || data);
          }
        } catch (error) {
          this.logger.error(`Redis message parse error: ${error.message}`);
        }
      });
    }
  }
}
