import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CrmService } from './crm.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm')
export class CrmController {
  constructor(private crmService: CrmService) {}

  @Get('integrations')
  @ApiOperation({ summary: 'List CRM integrations' })
  async getIntegrations(@CurrentUser() user: JwtPayload) {
    return this.crmService.getIntegrations(user.tid);
  }

  @Get('sync/status')
  @ApiOperation({ summary: 'Get CRM sync queue status' })
  async getSyncStatus(@CurrentUser() user: JwtPayload) {
    return this.crmService.getSyncStatus(user.tid);
  }

  @Post('sync/:leadId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Force sync a lead to CRM' })
  async forcSync(
    @CurrentUser() user: JwtPayload,
    @Param('leadId') leadId: string,
  ) {
    // TODO: Fetch lead data and enqueue CRM sync
    return { queued: true, leadId };
  }
}
