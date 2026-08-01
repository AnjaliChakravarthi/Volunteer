import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './common/prisma/prisma.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

import { IdentityModule } from './modules/identity/identity.module';
import { VolunteerProfileModule } from './modules/volunteer-profile/volunteer-profile.module';
import { EventSchedulingModule } from './modules/event-scheduling/event-scheduling.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ParticipationLedgerModule } from './modules/participation-ledger/participation-ledger.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [{
        ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60) * 1000,
        limit: config.get<number>('THROTTLE_LIMIT', 100),
      }],
    }),

    // Global Database Access
    PrismaModule,

    // Feature Modules
    IdentityModule,
    VolunteerProfileModule,
    EventSchedulingModule,
    RecruitmentModule,
    OnboardingModule,
    AttendanceModule,
    ParticipationLedgerModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply Correlation ID middleware to all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
