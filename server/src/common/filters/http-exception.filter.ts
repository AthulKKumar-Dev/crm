import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let statusCode: number;
        let message: string = 'Internal server error';
        let errors: string[] | undefined;

        if (exception instanceof HttpException) {
            statusCode = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object') {
                const res = exceptionResponse as Record<string, unknown>;
                message = (res.message as string) || exception.message;

                // class-validator returns an array of error messages
                if (Array.isArray(res.message)) {
                    errors = res.message;
                    message = 'Validation failed';
                }
            }
        } else {
            statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

            // Log the full error internally, never expose to client
            this.logger.error(
                `Unhandled exception on ${request.method} ${request.url}`,
                exception instanceof Error ? exception.stack : String(exception),
            );
        }

        response.status(statusCode).json({
            success: false,
            statusCode,
            message,
            ...(errors && { errors }),
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}