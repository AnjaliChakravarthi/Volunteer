import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

/**
 * Structured JSON request/response logging interceptor.
 * Logs method, path, correlation ID, status code, and duration.
 * No PII in log bodies — reference IDs only (§3.3).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const correlationId = req.headers[CORRELATION_ID_HEADER] as string;
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<{ statusCode: number }>();
          this.logger.log(
            JSON.stringify({
              level: 'info',
              method,
              url,
              status: res.statusCode,
              duration_ms: Date.now() - start,
              correlation_id: correlationId,
            }),
          );
        },
        error: () => {
          // Errors are logged by GlobalExceptionFilter; log timing here only
          this.logger.warn(
            JSON.stringify({
              level: 'warn',
              method,
              url,
              duration_ms: Date.now() - start,
              correlation_id: correlationId,
            }),
          );
        },
      }),
    );
  }
}
