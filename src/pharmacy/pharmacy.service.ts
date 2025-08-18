import { Injectable } from '@nestjs/common';

@Injectable()
export class PharmacyService {
  getHello(): string {
    return 'Hello World!';
  }
}
