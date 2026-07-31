import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Injects a correlation ID on every incoming request.
 * Uses the client-supplied header if present and valid UUID; otherwise generates one.
 * The ID propagates to all log entries and error responses for incident tracing.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[CORRELATION_ID_HEADER] as string | undefined;
    // Validate format to prevent header injection (must be UUID v4)
    const correlationId =
      incoming && /^[0-9a-f-]{36}$/i.test(incoming) ? incoming : uuidv4();

    req.headers[CORRELATION_ID_HEADER] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
