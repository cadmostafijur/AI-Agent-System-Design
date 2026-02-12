import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leads')
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'List leads with filters' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('tag') tag?: string,
    @Query('minScore') minScore?: number,
    @Query('maxScore') maxScore?: number,
    @Query('crmSynced') crmSynced?: boolean,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.leadsService.listLeads(user.tid, {
      page, limit, tag, minScore, maxScore, crmSynced, sortBy, sortOrder,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get lead statistics' })
  async getStats(@CurrentUser() user: JwtPayload) {
    return this.leadsService.getLeadStats(user.tid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead detail' })
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.leadsService.getLeadDetail(user.tid, id);
  }

  @Patch(':id/tag')
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Override lead tag manually' })
  async updateTag(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('tag') tag: string,
  ) {
    return this.leadsService.updateLeadTag(user.tid, id, tag, user.sub);
  }
}
