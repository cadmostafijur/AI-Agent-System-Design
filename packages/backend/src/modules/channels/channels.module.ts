import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { TokenVaultService } from './token-vault.service';

@Module({
  controllers: [ChannelsController],
  providers: [ChannelsService, TokenVaultService],
  exports: [ChannelsService, TokenVaultService],
})
export class ChannelsModule {}
