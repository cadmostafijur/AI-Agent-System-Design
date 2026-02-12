import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  /**
   * Register a new tenant and admin user.
   * Creates: Tenant → User (ADMIN) → Default BrandVoice → Token Budget
   */
  async register(dto: RegisterDto) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Check if company slug is taken
    const slug = this.generateSlug(dto.companyName);
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });
    if (existingTenant) {
      throw new ConflictException('Company name already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create tenant + user + defaults in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          slug,
          plan: 'STARTER',
          settings: {
            timezone: dto.timezone || 'UTC',
            autoReplyEnabled: true,
            humanHandoffThreshold: 0.4,
          },
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          name: dto.name,
          role: 'ADMIN',
        },
      });

      // Create default brand voice
      await tx.brandVoice.create({
        data: {
          tenantId: tenant.id,
          companyName: dto.companyName,
          tone: 'professional',
          style: 'helpful and concise',
          guidelines: 'Be friendly, accurate, and helpful. If unsure about something, offer to connect with a human team member.',
        },
      });

      // Create token budget based on plan
      await tx.tokenBudget.create({
        data: {
          tenantId: tenant.id,
          dailyLimit: 10000,     // Starter plan
          monthlyLimit: 200000,
          hardCap: true,
        },
      });

      return { tenant, user };
    });

    // Generate tokens
    const tokens = await this.generateTokens(result.user.id, result.tenant.id, result.user.role);

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
        plan: result.tenant.plan,
      },
      tokens,
    };
  }

  /**
   * Authenticate a user and issue JWT tokens.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isActive: true },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.tenantId, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        plan: user.tenant.plan,
      },
      tokens,
    };
  }

  /**
   * Refresh access token using a valid refresh token.
   * Implements refresh token rotation (single-use).
   */
  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { tenant: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Delete used refresh token (rotation)
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    // Issue new tokens
    const tokens = await this.generateTokens(
      stored.user.id,
      stored.user.tenantId,
      stored.user.role,
    );

    return { tokens };
  }

  /**
   * Invalidate all refresh tokens for a user (logout).
   */
  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    // Blacklist current access token
    await this.redis.set(`blacklist:${userId}`, '1', 3600); // 1 hour TTL
    return { success: true };
  }

  /**
   * Invite a new team member to the tenant.
   */
  async inviteTeamMember(tenantId: string, email: string, role: string, invitedBy: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: { tenantId, email },
    });
    if (existingUser) {
      throw new ConflictException('User already exists in this team');
    }

    // Generate temporary password (user will reset on first login)
    const tempPassword = uuidv4().substring(0, 12);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash,
        name: email.split('@')[0], // Placeholder name
        role: role as any,
      },
    });

    // TODO: Send invitation email with temporary credentials

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      temporaryPassword: tempPassword, // Only returned once; should be sent via email
    };
  }

  // ── Private Helpers ──

  private async generateTokens(userId: string, tenantId: string, role: string) {
    const payload: JwtPayload = {
      sub: userId,
      tid: tenantId,
      role,
      email: '', // Filled at validation time
    };

    const accessToken = this.jwt.sign(payload);

    // Generate refresh token
    const refreshToken = uuidv4();
    const refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRY', '7d');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(refreshExpiry));

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRY', '1h'),
    };
  }

  private generateSlug(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }
}
