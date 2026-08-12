import { z } from 'zod';

export type PaymentMethod = 'cash_on_delivery' | 'online_card';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export const CheckoutFormCustomerSchema = z.object({
  fullName: z.string().trim().min(2, 'Укажите имя и фамилию').max(150),
  phone: z
    .string()
    .trim()
    .min(10, 'Телефон заполнен некорректно')
    .max(30),
  email: z.string().trim().max(200).email('E-mail заполнен некорректно'),
  address: z.string().trim().max(500).optional().nullable(),
});

export const CheckoutItemSchema = z.object({
  sku: z.string().trim().min(1).max(255),
  title: z.string().trim().max(500).optional(),
  image: z.string().trim().max(500).url().optional().or(z.literal('')),
  quantity: z.coerce.number().int().min(1).max(999999),
  price: z.coerce.number().finite().min(0).max(1_000_000_000),
});

export const CalculateCheckoutPayloadSchema = z.object({
  phone: z.string().trim().max(30).optional(),
  promoCode: z.string().trim().max(100).optional(),
  giftCardNumber: z.string().trim().max(100).optional(),
  registerInLoyaltyProgram: z.boolean().optional(),
  items: z.array(CheckoutItemSchema).min(1).max(500),
});

export const CreateOrderPayloadSchema = z.object({
  customer: CheckoutFormCustomerSchema,
  items: z.array(CheckoutItemSchema).min(1).max(500),
  totalAmount: z.coerce.number().finite().min(0).max(1_000_000_000),
  promoCode: z.string().trim().max(100).optional(),
  giftCardNumber: z.string().trim().max(100).optional(),
  loyaltyCardNumber: z.string().trim().max(100).optional(),
  registerInLoyaltyProgram: z.boolean().optional(),
  deliveryMethod: z.string().trim().max(255).optional(),
  comment: z.string().trim().max(2000).optional(),
  paymentMethod: z
    .enum(['cash_on_delivery', 'online_card'])
    .default('cash_on_delivery')
    .optional(),
});

export type SyncCatalogItemPayload = {
  sku: string;
  title?: string;
  subtitle?: string;
  description?: string;
  brand?: string;
  images?: Array<{
    url: string;
    title?: string;
    alt?: string;
  }>;
  price?: number;
  oldPrice?: number;
  currency?: string;
  category?: string;
  section?: string;
  weightKg?: number;
  dimensionsCm?: {
    length?: number;
    width?: number;
    height?: number;
  };
  attributes?: Array<{
    name: string;
    value: string;
  }>;
  variants?: Array<{
    sku: string;
    price?: number;
    quantity?: number;
    attributes?: Array<{
      name: string;
      value: string;
    }>;
  }>;
  quantity?: number;
  availability?: 'in_stock' | 'preorder' | 'out_of_stock';
  showOnSite?: boolean;
  preorderDays?: number;
};

export const SyncCatalogItemPayloadSchema: z.ZodType<SyncCatalogItemPayload> =
  z.object({
    sku: z.string().trim().min(1).max(255),
    title: z.string().trim().max(500).optional(),
    subtitle: z.string().trim().max(500).optional(),
    description: z.string().trim().max(20000).optional(),
    brand: z.string().trim().max(255).optional(),
    images: z
      .array(
        z.object({
          url: z.string().trim().url().max(500),
          title: z.string().trim().max(255).optional(),
          alt: z.string().trim().max(255).optional(),
        }),
      )
      .max(100)
      .optional(),
    price: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
    oldPrice: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
    currency: z.string().trim().max(20).optional(),
    category: z.string().trim().max(255).optional(),
    section: z.string().trim().max(255).optional(),
    weightKg: z.coerce.number().finite().min(0).max(1_000_000).optional(),
    dimensionsCm: z
      .object({
        length: z.coerce.number().finite().min(0).max(1_000_000).optional(),
        width: z.coerce.number().finite().min(0).max(1_000_000).optional(),
        height: z.coerce.number().finite().min(0).max(1_000_000).optional(),
      })
      .optional(),
    attributes: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(255),
          value: z.string().trim().min(1).max(2000),
        }),
      )
      .max(500)
      .optional(),
    variants: z
      .array(
        z.object({
          sku: z.string().trim().min(1).max(255),
          price: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
          quantity: z.coerce.number().int().min(0).max(999999999).optional(),
          attributes: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(255),
                value: z.string().trim().min(1).max(2000),
              }),
            )
            .max(100)
            .optional(),
        }),
      )
      .max(500)
      .optional(),
    quantity: z.coerce.number().int().min(0).max(999999999).optional(),
    availability: z.enum(['in_stock', 'preorder', 'out_of_stock']).optional(),
    showOnSite: z.boolean().optional(),
    preorderDays: z.coerce.number().int().min(0).max(3650).optional(),
  });

export const MAXMA_ERROR_SCHEMA = z.object({
  code: z.number().int(),
  description: z.string().max(10000),
  hint: z.string().max(10000).optional().nullable(),
});

export type MAXMAError = z.infer<typeof MAXMA_ERROR_SCHEMA>;

export const CheckoutCalculateResponseSchema = z.object({
  totalAmount: z.coerce.number().finite(),
  items: z.array(
    z.object({
      sku: z.string(),
      title: z.string().optional(),
      quantity: z.number().int(),
      unitPrice: z.coerce.number().finite(),
      finalAmount: z.coerce.number().finite().optional(),
    }),
  ),
  discountApplied: z.boolean(),
  discountSource: z
    .enum(['promo', 'gift_card', 'loyalty', 'none'])
    .default('none'),
  discountAmount: z.coerce.number().finite().default(0),
  discountDescription: z.string().optional().nullable(),
  loyaltyAccount: z
    .object({
      cardNumber: z.string(),
      balance: z.coerce.number().finite(),
      level: z.string().optional(),
    })
    .optional()
    .nullable(),
  promoCode: z.string().optional().nullable(),
  giftCardNumber: z.string().optional().nullable(),
  errors: z.array(MAXMA_ERROR_SCHEMA).default([]),
  warnings: z.array(z.string()).default([]),
});

export type CalculateCheckoutPayload = z.infer<
  typeof CalculateCheckoutPayloadSchema
>;

export type CheckoutFormState = {
  customer: z.infer<typeof CheckoutFormCustomerSchema> & {
    address?: string | null;
  };
  items: z.infer<typeof CheckoutItemSchema>[];
  promoCode?: string;
  giftCardNumber?: string;
  loyaltyCardNumber?: string;
  registerInLoyaltyProgram?: boolean;
  deliveryMethod?: string;
  comment?: string;
  paymentMethod?: PaymentMethod;
};

export type CheckoutCalculation = z.infer<
  typeof CheckoutCalculateResponseSchema
>;

export type CreateOrderPayload = z.infer<typeof CreateOrderPayloadSchema> & {
  paymentMethod?: PaymentMethod;
};

export type SyncCatalogBatchPayload = {
  items: SyncCatalogItemPayload[];
  dryRun?: boolean;
  force?: boolean;
  resumeFromSku?: string;
};

export type CreatePaymentPayload = {
  orderId: string;
  amount: number;
  clientId?: string;
  clientEmail?: string;
  clientPhone?: string;
  description?: string;
};

export const CreatePaymentPayloadSchema = z.object({
  orderId: z.string().min(1).max(255),
  amount: z.coerce.number().finite().min(1).max(1_000_000_000),
  clientId: z.string().min(1).max(255).optional(),
  clientEmail: z.string().email().max(255).optional(),
  clientPhone: z.string().trim().max(30).optional(),
  description: z.string().trim().max(1000).optional(),
});

export type CreatePaymentResponse = {
  status: 'ok';
  invoiceId: string;
  paymentUrl: string;
  expiresAt?: string;
};

export type PaykeeperNotifyPayload = {
  id: string;
  clientid: string;
  orderid: string;
  sum: string;
  client_email?: string;
  client_phone?: string;
  payment_type?: string;
  paykeeper_account?: string;
  status?: string;
  keys?: string;
  sign?: string;
};

export type OrderItem = {
  sku: string;
  title?: string;
  image?: string;
  quantity: number;
  unitPrice: number;
};

export type OrderRequestSaveResult =
  | {
      saved: true;
      id: string;
      source: string;
      status: string;
    }
  | {
      saved: false;
      source: string;
      status: string;
      reason: string;
    };

export type OrderRequestListItem = {
  id: string;
  sourceChannel: string;
  status: string;
  fullName?: string;
  phone?: string;
  email?: string;
  totalAmount: number;
  itemsCount: number;
  deliveryMethod?: string;
  comment?: string;
  rawPayload: unknown;
  responsePayload: unknown;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paymentInvoiceId?: string;
  paymentPayload?: unknown;
  createdAt: string;
  updatedAt: string;
};
