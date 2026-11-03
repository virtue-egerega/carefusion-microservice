import { Test, TestingModule } from '@nestjs/testing';
import { GoodsReceiptItemsService } from './goods-receipt-items.service';

describe('GoodsReceiptItemsService', () => {
  let service: GoodsReceiptItemsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GoodsReceiptItemsService],
    }).compile();

    service = module.get<GoodsReceiptItemsService>(GoodsReceiptItemsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
