import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List conversations (paginated, filterable)' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('channelId') channelId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('search') search?: string,
  ) {
    return this.conversationsService.listConversations(user.tid, {
      page,
      limit,
      status,
      channelId,
      assignedToId,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation with messages' })
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.conversationsService.getConversation(user.tid, id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get paginated messages' })
  async getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.conversationsService.getMessages(user.tid, id, page, limit);
  }

  @Post(':id/messages')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Send a manual reply' })
  async sendReply(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('content') content: string,
  ) {
    return this.conversationsService.sendManualReply(user.tid, id, user.sub, content);
  }

  @Patch(':id/assign')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Assign conversation to an agent' })
  async assign(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('agentId') agentId: string,
  ) {
    return this.conversationsService.assignConversation(user.tid, id, agentId);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Update conversation status' })
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.conversationsService.updateStatus(user.tid, id, status);
  }
}
