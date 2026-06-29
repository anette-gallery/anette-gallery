import { Body, Controller, Post } from '@nestjs/common';
import { SyncCustomerDto } from './dto/sync-customer.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('sync')
  syncCustomer(@Body() payload: SyncCustomerDto) {
    return this.customersService.syncCustomer(payload);
  }
}
