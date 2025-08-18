import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

const mockAppService = {
    health: jest.fn(),
};

describe('AppController', () => {
    let appController: AppController;

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            controllers: [AppController],
            providers: [{ provide: AppService, useValue: mockAppService }],
        }).compile();

        appController = app.get<AppController>(AppController);
    });

    afterEach(() => jest.clearAllMocks());

    describe('health', () => {
        it('returns the health payload', async () => {
            const payload = { uptime: 42, db: 'up' };
            mockAppService.health.mockResolvedValueOnce(payload);

            const result = await appController.health();

            expect(result).toEqual(payload);
        });
    });
});
