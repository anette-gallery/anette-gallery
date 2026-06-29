import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, hasRealValue } from '../config/env.config';

type CheckoutRequest = {
  phone?: string;
  promoCode?: string;
  giftCardNumber?: string;
  registerInLoyaltyProgram?: boolean;
  items: Array<{
    sku: string;
    quantity: number;
    price: number;
  }>;
};

@Injectable()
export class MaxmaService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  private isLiveEnabled(path: string | null): boolean {
    const mode = this.configService.get('integrations.mode', { infer: true });
    const baseUrl = this.configService.get('integrations.maxma.baseUrl', {
      infer: true,
    });
    const apiKey = this.configService.get('integrations.maxma.apiKey', {
      infer: true,
    });

    return (
      mode === 'live' &&
      hasRealValue(baseUrl) &&
      hasRealValue(apiKey) &&
      hasRealValue(path)
    );
  }

  private buildUrl(path: string): string {
    const baseUrl = this.configService.get('integrations.maxma.baseUrl', {
      infer: true,
    });

    return new URL(path, baseUrl ?? 'http://localhost').toString();
  }

  private async post(path: string | null, action: string, payload: unknown) {
    if (!this.isLiveEnabled(path)) {
      return {
        status: 'stub',
        mode: 'stub',
        target: 'maxma',
        action,
        payload,
      };
    }

    const apiKey = this.configService.get('integrations.maxma.apiKey', {
      infer: true,
    });
    const url = this.buildUrl(path ?? '/');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.text();

    return {
      status: response.ok ? 'ok' : 'error',
      mode: 'live',
      target: 'maxma',
      action,
      responseStatus: response.status,
      url,
      responseBody: body,
      payload,
    };
  }

  syncCustomer(payload: object) {
    return this.post(
      this.configService.get('integrations.maxma.customerSyncPath', {
        infer: true,
      }),
      'sync-customer',
      payload,
    );
  }

  applyLoyalty(payload: CheckoutRequest) {
    return this.post(
      this.configService.get('integrations.maxma.loyaltyApplyPath', {
        infer: true,
      }),
      'apply-loyalty',
      payload,
    );
  }

  validatePromoCode(payload: CheckoutRequest) {
    return this.post(
      this.configService.get('integrations.maxma.promoValidatePath', {
        infer: true,
      }),
      'validate-promo-code',
      payload,
    );
  }

  validateGiftCard(payload: CheckoutRequest) {
    return this.post(
      this.configService.get('integrations.maxma.giftCardValidatePath', {
        infer: true,
      }),
      'validate-gift-card',
      payload,
    );
  }

  calculateCheckout(payload: CheckoutRequest) {
    const subtotal = payload.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const hasLoyalty = Boolean(payload.phone);
    const hasPromo = Boolean(payload.promoCode);
    const hasGiftCard = Boolean(payload.giftCardNumber);
    const canCombineLoyaltyAndGiftCard = hasLoyalty && hasGiftCard;
    const canCombinePromoAndGiftCard = hasPromo && hasGiftCard;
    const hasAllThree = hasLoyalty && hasPromo && hasGiftCard;
    const hasUnsupportedCombination = hasLoyalty && hasPromo;
    const path = this.configService.get(
      'integrations.maxma.checkoutCalculatePath',
      {
        infer: true,
      },
    );

    if (!this.isLiveEnabled(path)) {
      const shouldSuggestRegistration =
        Boolean(payload.phone) && !payload.registerInLoyaltyProgram;

      return Promise.resolve({
        status: 'stub',
        mode: 'stub',
        target: 'maxma',
        action: 'calculate-checkout',
        subtotal,
        total: subtotal,
        discounts: [],
        loyalty: {
          phoneFound: false,
          suggestRegistration: shouldSuggestRegistration,
          registrationChannel: shouldSuggestRegistration
            ? 'telegram-bot'
            : null,
          allowRegistrationDecline: true,
        },
        compatibility: {
          canCombineLoyaltyAndGiftCard,
          canCombinePromoAndGiftCard,
          hasAllThree,
          hasUnsupportedCombination,
          discountPriority: 'discount-then-gift-card',
          message: hasUnsupportedCombination
            ? 'Карта лояльности и промокод не суммируются'
            : 'Комбинация скидок допустима по текущим согласованным правилам',
        },
        fallbackPolicy: {
          allowCheckoutWithoutDiscounts: true,
          reason:
            'Если Maxma недоступна, оформление заказа должно продолжаться без скидок',
        },
        display: {
          showBeforeAndAfterTotals: true,
          showDiscountBreakdown: true,
        },
        payload,
      });
    }

    return this.post(path, 'calculate-checkout', payload);
  }

  createOrder(payload: object) {
    return this.post(
      this.configService.get('integrations.maxma.orderCreatePath', {
        infer: true,
      }),
      'create-order',
      payload,
    );
  }
}
