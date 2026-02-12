import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict endpoint access to specific roles.
 * 
 * Usage:
 *   @Roles('ADMIN')
 *   @Get('settings')
 *   getSettings() { ... }
 * 
 *   @Roles('ADMIN', 'AGENT')
 *   @Post('reply')
 *   sendReply() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
