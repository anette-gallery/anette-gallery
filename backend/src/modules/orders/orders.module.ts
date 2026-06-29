import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
