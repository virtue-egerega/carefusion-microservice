import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { sessionEnded, SessionsService } from './sessions.service';
import type { RedisService } from '../cache/redis.service';

function fakeRedis(store: Record<string, string> = {}) {
    const sets: { key: string; value: string; ttl?: number }[] = [];
    const client = {
        mget: jest.fn(async (...keys: string[]) => keys.map(k => store[k] ?? null)),
        set: jest.fn(async (key: string, value: string, _ex?: string, ttl?: number) => { sets.push({ key, value, ttl }); }),
        del: jest.fn(async () => 1),
        pipeline: () => {
            const queued: [string, string][] = [];
            return {
                set(key: string, value: string) { queued.push([key, value]); return this; },
                exec: async () => { for (const [key, value] of queued) sets.push({ key, value }); },
            };
        },
    };
    return { service: new SessionsService({ client } as unknown as RedisService), client, sets };
}

describe('SessionsService', () => {
    it('finds no reason for a token that was never revoked', async () => {
        const { service } = fakeRedis();
        expect(await service.endedReason('jti-1', 'user-1')).toBeNull();
    });

    it('reports a logged-out token', async () => {
        const { service } = fakeRedis({ 'revoked:token:jti-1': 'LOGGED_OUT' });
        expect(await service.endedReason('jti-1', 'user-1')).toBe('LOGGED_OUT');
    });

    it('reports a forced re-login for any token of that user', async () => {
        const { service } = fakeRedis({ 'relogin:user:user-1': 'PASSWORD_RESET' });
        expect(await service.endedReason('any-jti', 'user-1')).toBe('PASSWORD_RESET');
        expect(await service.endedReason('any-jti', 'user-2')).toBeNull();
    });

    it('checks both keys in one round trip', async () => {
        const { service, client } = fakeRedis();
        await service.endedReason('jti-1', 'user-1');
        expect(client.mget).toHaveBeenCalledTimes(1);
        expect(client.mget).toHaveBeenCalledWith('revoked:token:jti-1', 'relogin:user:user-1');
    });

    it('fails closed when Redis is unreachable', async () => {
        const { service, client } = fakeRedis();
        client.mget.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        await expect(service.endedReason('jti-1', 'user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('blacklists a token only for its remaining lifetime', async () => {
        const { service, sets } = fakeRedis();
        const now = Math.floor(Date.now() / 1000);
        await service.revokeToken('jti-1', now + 900, 'LOGGED_OUT');
        expect(sets[0].key).toBe('revoked:token:jti-1');
        expect(sets[0].ttl).toBeGreaterThan(890);
        expect(sets[0].ttl).toBeLessThanOrEqual(900);
    });

    it('does not store an already-expired token', async () => {
        const { service, sets } = fakeRedis();
        await service.revokeToken('jti-1', Math.floor(Date.now() / 1000) - 5, 'LOGGED_OUT');
        expect(sets).toHaveLength(0);
    });

    it('flags each user once, with no expiry', async () => {
        const { service, sets } = fakeRedis();
        await service.requireRelogin(['a', 'b', 'a'], 'ACCESS_CHANGED');
        expect(sets).toEqual([
            { key: 'relogin:user:a', value: 'ACCESS_CHANGED' },
            { key: 'relogin:user:b', value: 'ACCESS_CHANGED' },
        ]);
    });

    it('builds a 401 carrying the reason code and a message', () => {
        const err = sessionEnded('ACCESS_CHANGED');
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(err.getResponse()).toMatchObject({ code: 'ACCESS_CHANGED', message: expect.stringContaining('every device') });
    });
});
