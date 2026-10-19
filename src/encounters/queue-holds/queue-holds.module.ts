import { Module } from '@nestjs/common';
import { QueueHoldsService } from './queue-holds.service';

// Its own module so Billing can import it while Encounters imports Billing, without a cycle
@Module({
    providers: [QueueHoldsService],
    exports: [QueueHoldsService],
})
export class QueueHoldsModule {}
