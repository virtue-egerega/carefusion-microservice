import { Controller, Get } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';

@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get()
  getHello(): string {
    return this.consultationsService.getHello();
  }
}
