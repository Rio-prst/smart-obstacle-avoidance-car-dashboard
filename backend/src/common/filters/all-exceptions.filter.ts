import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.message : 'Unknown error');
    }

    response.status(status).json({ error: toErrorBody(status, exception) });
  }
}

function toErrorBody(status: number, exception: unknown): ErrorBody {
  if (!(exception instanceof HttpException)) {
    return { code: 'INTERNAL', message: 'Internal server error' };
  }

  const payload = exception.getResponse();

  if (typeof payload === 'string') {
    return { code: defaultCode(status), message: payload };
  }

  if (isRecord(payload)) {
    const code = typeof payload.code === 'string' ? payload.code : defaultCode(status);
    const message = typeof payload.message === 'string' ? payload.message : exception.message;

    if (Array.isArray(payload.message)) {
      return {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: payload.message.map((issue) => ({ issue })),
      };
    }

    if (Array.isArray(payload.details)) {
      return { code, message, details: payload.details };
    }

    return { code, message };
  }

  return { code: defaultCode(status), message: exception.message };
}

function defaultCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'CONTROL_REQUIRED';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    default:
      return 'INTERNAL';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
