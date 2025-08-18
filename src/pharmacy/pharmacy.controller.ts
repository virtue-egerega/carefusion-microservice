import { Controller, Get } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';

@Controller('pharmacy')
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get()
  getHello(): string {
    return this.pharmacyService.getHello();
  }
}
