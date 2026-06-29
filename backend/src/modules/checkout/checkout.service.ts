import { Injectable } from '@nestjs/common';
import { MaxmaService } from '../../integrations/maxma.service';
import { CalculateCheckoutDto } from './dto/calculate-checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(private readonly maxmaService: MaxmaService) {}

  private validateDiscountCompatibility(payload: CalculateCheckoutDto) {
    const hasLoyalty = Boolean(payload.phone);
    const hasPromo = Boolean(payload.promoCode);
    const hasGiftCard = Boolean(payload.giftCardNumber);

    return {
      canCombineLoyaltyAndGiftCard: hasLoyalty && hasGiftCard,
      canCombinePromoAndGiftCard: hasPromo && hasGiftCard,
      hasAllThree: hasLoyalty && hasPromo && hasGiftCard,
      hasUnsupportedCombination: hasLoyalty && hasPromo,
      discountPriority: 'discount-then-gift-card',
    };
  }

  applyLoyalty(payload: CalculateCheckoutDto) {
    return this.maxmaService.applyLoyalty(payload);
  }

  validatePromoCode(payload: CalculateCheckoutDto) {
    return this.maxmaService.validatePromoCode(payload);
  }

  validateGiftCard(payload: CalculateCheckoutDto) {
    return this.maxmaService.validateGiftCard(payload);
  }

  calculate(payload: CalculateCheckoutDto) {
    const compatibility = this.validateDiscountCompatibility(payload);

    if (compatibility.hasUnsupportedCombination) {
      const subtotal = payload.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

      return Promise.resolve({
        status: 'validation_error',
        mode: 'stub',
        target: 'backend',
        action: 'calculate-checkout',
        subtotal,
        total: subtotal,
        discounts: [],
        payload,
        compatibility: {
          ...compatibility,
          message:
            'Карта лояльности и промокод не суммируются. Сначала применяется скидка, затем сертификат',
        },
        display: {
          showBeforeAndAfterTotals: true,
          showDiscountBreakdown: true,
        },
      });
    }

    return this.maxmaService.calculateCheckout(payload);
  }
}
