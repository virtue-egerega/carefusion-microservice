import { Module } from '@nestjs/common';
import { BillingAccountsController } from './billing-accounts.controller';
import { BillingAccountsService } from './billing-accounts.service';
import { ChargesService } from './charges.service';
import { LedgerService } from './ledger.service';
import { CoverageController } from './coverage/coverage.controller';
import { CoverageService } from './coverage/coverage.service';
import { PayersService } from './coverage/payers.service';

@Module({
    controllers: [BillingAccountsController, CoverageController],
    providers: [LedgerService, BillingAccountsService, ChargesService, PayersService, CoverageService],
    exports: [LedgerService, BillingAccountsService, ChargesService, CoverageService],
})
export class BillingModule {}
