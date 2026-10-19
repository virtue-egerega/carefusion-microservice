import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('HttpExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        // Unexpected errors (Prisma, constraint violations, bugs) get a generic 500 for the client,
        // so they must be logged here with their stack or they're invisible
        if (status >= 500) {
            const detail = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
            this.logger.error(`${req.method} ${req.url} → ${status}\n${detail}`);
        }

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
