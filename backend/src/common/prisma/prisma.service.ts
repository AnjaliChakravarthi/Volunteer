import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma service — wraps PrismaClient as a NestJS-injectable singleton.
 * Handles connect/disconnect lifecycle and provides a hook for middleware.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
        // Enable 'query' logging only in development via PRISMA_LOG_LEVEL env
        ...(process.env['PRISMA_LOG_QUERIES'] === 'true'
          ? [{ level: 'query' as const, emit: 'event' as const }]
          : []),
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // Wire Prisma log events to NestJS logger (no raw console output in prod)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('warn', (e: { message: string }) => {
      this.logger.warn(e.message);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('error', (e: { message: string }) => {
      this.logger.error(e.message);
    });

    await this.$connect();
    this.logger.log('Database connection established.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed.');
  }
}
