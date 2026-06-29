import { Injectable } from '@nestjs/common';
import { MaxmaService } from '../../integrations/maxma.service';
import { SyncCustomerDto } from './dto/sync-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly maxmaService: MaxmaService) {}

  syncCustomer(payload: SyncCustomerDto) {
    return this.maxmaService.syncCustomer(payload);
  }
}
