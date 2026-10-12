import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
    intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
        return next.handle().pipe(
            map((data) => ({
                success: true,
                message: extractMessage(data),
                data: stripMessage(data),
            })),
        );
    }
}

function extractMessage(data: any): string {
    if (data && typeof data === 'object' && typeof data.message === 'string') {
        return data.message;
    }
    return 'OK';
}

function stripMessage(data: any): any {
    if (data && typeof data === 'object' && typeof data.message === 'string') {
        const { message: _, ...rest } = data;
        return Object.keys(rest).length ? rest : null;
    }
    return data;
}
