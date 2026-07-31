import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

/**
 * Global exception filter — produces the standard error envelope from §3.3:
 * { error: { code, message, correlation_id, details? } }
 *
 * Rules:
 *  - No stack traces or internal identifiers exposed to clients.
 *  - All 5xx errors logged at error level with correlation ID.
 *  - 4xx logged at warn level.
 *  - PII must NOT appear in log messages (use entity IDs only).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const correlationId =
      (request.headers[CORRELATION_ID_HEADER] as string) ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
        code = this.statusToCode(status);
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        code = (b['code'] as string) ?? this.statusToCode(status);
        message = (b['message'] as string) ?? exception.message;
        details = b['details'] as Record<string, unknown> | undefined;
      }
    }

    // Log 5xx at error, 4xx at warn — no stack traces to clients
    if (status >= 500) {
      this.logger.error(
        `${status} ${request.method} ${request.url} | correlation=${correlationId} | code=${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${status} ${request.method} ${request.url} | correlation=${correlationId} | code=${code} | msg=${message}`,
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        correlation_id: correlationId,
        ...(details ? { details } : {}),
      },
    });
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? `HTTP_${status}`;
  }
}
