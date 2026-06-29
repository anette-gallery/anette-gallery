import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
