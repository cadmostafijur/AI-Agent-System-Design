import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview metrics' })
  async getOverview(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getOverview(user.tid);
  }

  @Get('response-time')
  @ApiOperation({ summary: 'Response time statistics' })
  async getResponseTime(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: number,
  ) {
    return this.analyticsService.getResponseTimeStats(user.tid, days);
  }

  @Get('lead-funnel')
  @ApiOperation({ summary: 'Lead conversion funnel' })
  async getLeadFunnel(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getLeadFunnel(user.tid);
  }
}
