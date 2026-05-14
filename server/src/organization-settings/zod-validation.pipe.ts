import {
  BadRequestException,
  PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * NestJS validation pipe backed by a Zod schema. The rest of the codebase
 * uses class-validator for DTO classes, but settings are JSON shapes that
 * map cleanly to Zod (and let us derive a TypeScript type without writing
 * separate decorated classes). Falls back to a 400 with the Zod issue
 * messages if validation fails.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      );
      throw new BadRequestException({
        message: 'Invalid settings payload',
        errors: messages,
      });
    }
    return result.data;
  }
}
