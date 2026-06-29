import { Body, Controller, Post } from '@nestjs/common';
import { CalculateCheckoutDto } from './dto/calculate-checkout.dto';
import { CheckoutService } from './checkout.service';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('loyalty/apply')
  applyLoyalty(@Body() payload: CalculateCheckoutDto) {
    return this.checkoutService.applyLoyalty(payload);
  }

  @Post('promo-code/validate')
  validatePromoCode(@Body() payload: CalculateCheckoutDto) {
    return this.checkoutService.validatePromoCode(payload);
  }

  @Post('gift-card/validate')
  validateGiftCard(@Body() payload: CalculateCheckoutDto) {
    return this.checkoutService.validateGiftCard(payload);
  }

  @Post('calculate')
  calculate(@Body() payload: CalculateCheckoutDto) {
    return this.checkoutService.calculate(payload);
  }
}
