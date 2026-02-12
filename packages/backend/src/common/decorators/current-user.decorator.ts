import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string;      // user ID
  tid: string;      // tenant ID
  role: string;     // user role
  email: string;    // user email
}

/**
 * Extract the current authenticated user from the request.
 * 
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: JwtPayload) { ... }
 * 
 *   @Get('tenant')
 *   getTenant(@CurrentUser('tid') tenantId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (data) {
      return user[data];
    }

    return user;
  },
);
