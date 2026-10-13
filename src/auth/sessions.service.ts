import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../cache/redis.service';

/** Why a session was ended (09 §9.5). Returned to the client as `code` on 401. */
export type SessionEndReason =
    | 'ACCESS_CHANGED'
    | 'PASSWORD_RESET'
    | 'PASSWORD_CHANGED'
    | 'ACCOUNT_DISABLED'
    | 'LOGGED_OUT'
    | 'TOKEN_EXPIRED';

const MESSAGES: Record<SessionEndReason, string> = {
    ACCESS_CHANGED:   'Your access was changed by an administrator. Please log in again, on every device you use.',
    PASSWORD_RESET:   'Your password was reset. Log in with the temporary password from your administrator, on every device you use.',
    PASSWORD_CHANGED: 'Your password was changed. Please log in again on every device you use.',
    ACCOUNT_DISABLED: 'Your account has been deactivated. Contact your administrator.',
    LOGGED_OUT:       'You have been logged out.',
    TOKEN_EXPIRED:    'Your session has expired. Please log in again.',
};

export const sessionEnded = (reason: SessionEndReason) =>
    new UnauthorizedException({ code: reason, message: MESSAGES[reason] });

const tokenKey   = (jti: string) => `revoked:token:${jti}`;
const reloginKey = (userId: string) => `relogin:user:${userId}`;

/**
 * Revocation without database reads (09 §9): a per-token blacklist (logout) and a per-user
 * re-login flag (password and access changes), both in Redis.
 */
@Injectable()
export class SessionsService {
    constructor(private readonly redis: RedisService) {}

    /** The reason this token can no longer be used, or null. One Redis round trip. */
    async endedReason(jti: string, userId: string): Promise<SessionEndReason | null> {
        try {
            const [token, user] = await this.redis.client.mget(tokenKey(jti), reloginKey(userId));
            return (token ?? user ?? null) as SessionEndReason | null;
        } catch {
            // Redis is required infrastructure: without it revocations can't be checked (fail closed)
            throw new ServiceUnavailableException('Session service unavailable. Try again shortly.');
        }
    }

    /** Blacklists one token until it would have expired anyway. `exp` is the JWT exp (seconds). */
    async revokeToken(jti: string, exp: number, reason: SessionEndReason) {
        const ttl = exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) await this.redis.client.set(tokenKey(jti), reason, 'EX', ttl);
    }

    /** Forces these users to log in again; kept until each one logs in (09 §9.3). */
    async requireRelogin(userIds: string[], reason: SessionEndReason) {
        if (!userIds.length) return;
        const pipeline = this.redis.client.pipeline();
        for (const id of new Set(userIds)) pipeline.set(reloginKey(id), reason);
        await pipeline.exec();
    }

    /** Called on successful login. */
    async clearRelogin(userId: string) {
        await this.redis.client.del(reloginKey(userId));
    }
}
