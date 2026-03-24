import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(PrismaExceptionFilter.name);

    catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let statusCode: number;
        let message: string = 'An unexpected database error occurred';

        switch (exception.code) {
            // Unique constraint violation
            case 'P2002': {
                statusCode = HttpStatus.CONFLICT;
                const fields = (exception.meta?.target as string[])?.join(', ') || 'field';
                message = `A record with this ${fields} already exists`;
                break;
            }

            // Record not found
            case 'P2025': {
                statusCode = HttpStatus.NOT_FOUND;
                message = 'The requested resource was not found';
                break;
            }

            // Foreign key constraint failed
            case 'P2003': {
                statusCode = HttpStatus.BAD_REQUEST;
                const field = (exception.meta?.field_name as string) || 'reference';
                message = `Related resource not found: ${field}`;
                break;
            }

            // Required record not found for relation
            case 'P2018': {
                statusCode = HttpStatus.NOT_FOUND;
                message = 'Required related resource not found';
                break;
            }

            default: {
                statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
                message = 'An unexpected database error occurred';
                this.logger.error(
                    `Unhandled Prisma error ${exception.code} on ${request.method} ${request.url}`,
                    exception.message,
                );
            }
        }

        response.status(statusCode).json({
            success: false,
            statusCode,
            message,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}