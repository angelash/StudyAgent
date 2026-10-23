import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ErrorRequestHandler } from 'express';

/** Complete bounded manuscripts fit; parser errors never echo submitted private text. */
export function configureJsonBody(app: NestExpressApplication) {
  app.useBodyParser('json', { limit: '512kb' });
  const safeParserError: ErrorRequestHandler = (exception, _request, _response, next) => {
    const error = exception as Error & { type?: string; status?: number };
    if (error instanceof Error && error.type === 'entity.too.large' && error.status === 413)
      next(new PayloadTooLargeException({ error: 'payload_too_large', message: '提交内容超过512KB，请缩小范围后重试' }));
    else if (error instanceof Error && error.type === 'entity.parse.failed' && error.status === 400)
      next(new BadRequestException({ error: 'invalid_json', message: '请求内容格式不完整，请重新提交' }));
    else if (error instanceof Error && error.status === 400)
      next(new BadRequestException({ error: 'invalid_request_body', message: '请求内容未完整读取，请重新提交' }));
    else if (error instanceof Error && error.status === 415)
      next(new UnsupportedMediaTypeException({ error: 'unsupported_body_encoding', message: '请求编码不受支持，请使用UTF-8 JSON' }));
    else next(exception);
  };
  app.use(safeParserError);
}
