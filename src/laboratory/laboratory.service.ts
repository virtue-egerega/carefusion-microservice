import { Injectable } from '@nestjs/common';

@Injectable()
export class LaboratoryService {
  getHello(): string {
    return 'Hello World!';
  }
}
