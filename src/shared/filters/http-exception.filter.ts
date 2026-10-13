import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
            exception instanceof HttpException
                ? resolveMessage(exception)
                : 'Internal server error';

        // A machine-readable reason, e.g. ACCESS_CHANGED on a forced re-login (09 §9.5)
        const body = exception instanceof HttpException ? exception.getResponse() : null;
        const code = body && typeof body === 'object' ? (body as Record<string, any>).code : undefined;

        res.status(status).json({
            success: false,
            statusCode: status,
            ...(code && { code }),
            message,
            path: req.url,
        });
    }
}

function resolveMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, any>;
        if (Array.isArray(r.message)) return r.message.join('; ');
        if (typeof r.message === 'string') return r.message;
    }
    return exception.message;
}
