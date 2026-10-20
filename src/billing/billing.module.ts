import { Module } from '@nestjs/common';
import { BillingAccountsController } from './accounts/billing-accounts.controller';
import { BillingAccountsService } from './accounts/billing-accounts.service';
import { ChargesController } from './charges/charges.controller';
import { ChargesService } from './charges/charges.service';
import { CoverageController } from './coverage/coverage.controller';
import { CoverageService } from './coverage/coverage.service';
import { LedgerService } from './ledger/ledger.service';
import { PayersController } from './payers/payers.controller';
import { PayersService } from './payers/payers.service';
import { QueueHoldsModule } from '../encounters/queue-holds/queue-holds.module';

@Module({
    imports: [QueueHoldsModule],
    controllers: [BillingAccountsController, ChargesController, PayersController, CoverageController],
    providers: [LedgerService, BillingAccountsService, ChargesService, PayersService, CoverageService],
    exports: [LedgerService, BillingAccountsService, ChargesService, CoverageService],
})
export class BillingModule {}
