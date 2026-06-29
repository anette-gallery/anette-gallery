import { Injectable } from '@nestjs/common';
import { MaxmaService } from '../../integrations/maxma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly maxmaService: MaxmaService) {}

  createOrder(payload: CreateOrderDto) {
    return this.maxmaService.createOrder(payload);
  }
}
