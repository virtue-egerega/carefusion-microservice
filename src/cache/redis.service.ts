import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis is required infrastructure, like Postgres: the app doesn't start without it, and requests
 * that need it fail while it's down (09 §9).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
    private readonly logger = new Logger(RedisService.name);
    readonly client: Redis;

    constructor(config: ConfigService) {
        this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
            lazyConnect: true,
            // Don't queue commands while disconnected: a revocation check must fail, not hang
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
        });
        this.client.on('error', err => this.logger.error(`Redis: ${err.message}`));
    }

    async onModuleInit() {
        await this.client.connect();
        await this.client.ping();
    }

    async onApplicationShutdown() {
        await this.client.quit();
    }
}
