import { IsEmail, IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteDto {
  @ApiProperty({ example: 'jane@acmecorp.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'AGENT', enum: ['ADMIN', 'AGENT', 'VIEWER'] })
  @IsString()
  @IsIn(['ADMIN', 'AGENT', 'VIEWER'])
  role: string;
}
