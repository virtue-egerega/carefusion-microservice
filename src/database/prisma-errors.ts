import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

const isKnown = (e: unknown, code: string): e is Prisma.PrismaClientKnownRequestError =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

/** Unique constraint violated (P2002). */
export const isUniqueViolation = (e: unknown) => isKnown(e, 'P2002');

/** Foreign key violated (P2003): the referenced row doesn't exist. */
export const isForeignKeyViolation = (e: unknown) => isKnown(e, 'P2003');

/**
 * Lets a write rely on DB constraints instead of a pre-check query: runs fn and maps
 * FK / unique violations to 404 / 409 with the given messages.
 */
export async function withConstraintErrors<T>(
    fn: () => Promise<T>,
    messages: { notFound?: string; conflict?: string },
): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (messages.notFound && isForeignKeyViolation(e)) throw new NotFoundException(messages.notFound);
        if (messages.conflict && isUniqueViolation(e)) throw new ConflictException(messages.conflict);
        throw e;
    }
}
