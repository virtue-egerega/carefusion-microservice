import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';

const mockDb = {
    user: { count: jest.fn() },
};

describe('AppService', () => {
    let service: AppService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AppService,
                { provide: DatabaseService, useValue: mockDb },
            ],
        }).compile();

        service = module.get<AppService>(AppService);
    });

    afterEach(() => jest.clearAllMocks());

    describe('health', () => {
        it('returns db: up when the count succeeds', async () => {
            mockDb.user.count.mockResolvedValueOnce(0);

            const result = await service.health();

            expect(result.db).toBe('up');
            expect(typeof result.uptime).toBe('number');
        });

        it('returns db: down when the database count rejects', async () => {
            mockDb.user.count.mockRejectedValueOnce(new Error('db error'));

            const result = await service.health();

            expect(result.db).toBe('down');
        });
    });
});
