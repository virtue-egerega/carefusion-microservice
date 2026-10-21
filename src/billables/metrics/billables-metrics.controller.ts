import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize, OrganizationId } from '../../auth/auth.decorators';
import { BillablesMetricsService } from './billables-metrics.service';

@ApiTags('billables')
@Controller('billables/metrics')
export class BillablesMetricsController {
    constructor(private readonly metricsService: BillablesMetricsService) {}

    @ApiOperation({
        summary: 'Totals for the billables overview page',
        description: '`upcomingPrices` / `upcomingDiscounts`: lines scheduled to start in the future and not withdrawn.',
    })
    @Authorize('billable.view')
    @Get()
    overview(@OrganizationId() orgId: string) {
        return this.metricsService.overview(orgId);
    }
}
