import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

type ErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<{
      status: (statusCode: number) => { json: (body: unknown) => void };
    }>();
    const request = http.getRequest<{ requestId?: string }>();

    const statusCode = this.resolveStatusCode(exception);
    const error = this.resolveErrorPayload(exception);

    response.status(statusCode).json({
      data: null,
      error,
      meta: {
        requestId: request.requestId ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  }

  private resolveStatusCode(exception: unknown) {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveErrorPayload(exception: unknown): ErrorPayload {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return {
          code: this.normalizeCode(exception.name),
          message: response,
        };
      }

      if (response && typeof response === 'object') {
        const payload = response as Record<string, unknown>;
        const message = Array.isArray(payload.message)
          ? payload.message.join('; ')
          : typeof payload.message === 'string'
            ? payload.message
            : exception.message;

        const details = Object.fromEntries(
          Object.entries(payload).filter(([key]) => !['message', 'error', 'statusCode'].includes(key)),
        );

        return {
          code:
            typeof payload.error === 'string' && payload.error.trim()
              ? this.normalizeCode(payload.error)
              : this.normalizeCode(exception.name),
          message,
          ...(Object.keys(details).length > 0 ? { details } : {}),
        };
      }
    }

    if (exception instanceof Error) {
      return {
        code: this.normalizeCode(exception.name),
        message: exception.message || 'Unexpected server error',
      };
    }

    return {
      code: 'internal_server_error',
      message: 'Unexpected server error',
    };
  }

  private normalizeCode(value: string) {
    const cleaned = value.replace(/exception$/i, '').trim();
    if (!cleaned) {
      return 'internal_server_error';
    }

    return cleaned
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }
}
