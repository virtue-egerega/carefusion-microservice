import { Test, TestingModule } from '@nestjs/testing';
import { GoodsReceiptItemsController } from './goods-receipt-items.controller';
import { GoodsReceiptItemsService } from './goods-receipt-items.service';

describe('GoodsReceiptItemsController', () => {
  let controller: GoodsReceiptItemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoodsReceiptItemsController],
      providers: [GoodsReceiptItemsService],
    }).compile();

    controller = module.get<GoodsReceiptItemsController>(GoodsReceiptItemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
