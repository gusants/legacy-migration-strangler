import { type ArgumentsHost, BadRequestException, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

export const INVALID_PAYLOAD_BODY = { error: 'invalid_payload' } as const;

@Catch(BadRequestException)
export class BadRequestToInvalidPayloadFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(_exception: BadRequestException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    this.adapterHost.httpAdapter.reply(response, INVALID_PAYLOAD_BODY, HttpStatus.BAD_REQUEST);
  }
}
