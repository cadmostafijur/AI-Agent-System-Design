import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all connected channels' })
  async listChannels(@CurrentUser() user: JwtPayload) {
    return this.channelsService.listChannels(user.tid);
  }

  @Post('connect')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Initiate channel OAuth connection' })
  async connect(
    @CurrentUser() user: JwtPayload,
    @Body('channelType') channelType: string,
  ) {
    return this.channelsService.initiateConnection(user.tid, channelType);
  }

  @Get('callback/:channel')
  @ApiOperation({ summary: 'OAuth callback handler' })
  async callback(
    @Param('channel') channel: string,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    return this.channelsService.handleOAuthCallback(
      stateData.tenantId,
      channel.toUpperCase(),
      code,
      state,
    );
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Disconnect a channel' })
  async disconnect(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.channelsService.disconnectChannel(user.tid, id);
  }
}
