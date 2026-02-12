import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get('brand-voice')
  @ApiOperation({ summary: 'Get brand voice configuration' })
  async getBrandVoice(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getBrandVoice(user.tid);
  }

  @Put('brand-voice')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update brand voice configuration' })
  async updateBrandVoice(
    @CurrentUser() user: JwtPayload,
    @Body() body: any,
  ) {
    return this.settingsService.updateBrandVoice(user.tid, body);
  }

  @Get('team')
  @ApiOperation({ summary: 'List team members' })
  async getTeam(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getTeamMembers(user.tid);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all tenant settings' })
  async getSettings(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getTenantSettings(user.tid);
  }
}
