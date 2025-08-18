import { AsyncLocalStorage } from 'node:async_hooks';
import {
    Injectable,
    OnApplicationShutdown,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type PrismaInstance = InstanceType<typeof PrismaClient>;
type TxClient = Parameters<Parameters<PrismaInstance['$transaction']>[0]>[0];

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
    private readonly _prisma: PrismaInstance;
    private readonly als = new AsyncLocalStorage<{ tx: TxClient }>();

    constructor(config: ConfigService) {
        const adapter = new PrismaPg({
            connectionString: config.getOrThrow('DATABASE_URL'),
        });
        this._prisma = new PrismaClient({ adapter });
    }

    get client(): PrismaInstance {
        return (this.als.getStore()?.tx ?? this._prisma) as PrismaInstance;
    }
    async onModuleInit() {
        await this._prisma.$connect();
    }

    async onApplicationShutdown() {
        await this._prisma.$disconnect();
    }
}
