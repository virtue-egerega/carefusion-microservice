import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Injectable()
export class AppService {
    constructor(private readonly database: DatabaseService) {}

    async health() {
        const db = await Promise.allSettled([this.database.client.user.count()]);

        return {
            uptime: process.uptime(),
            db: db[0].status === 'fulfilled' ? 'up' : 'down',
        };
    }
}
