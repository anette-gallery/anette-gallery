'use client';

import { FormEvent, useMemo, useState } from 'react';
import { calculateCheckout } from '@/lib/api';
import type {
  CalculateCheckoutPayload,
  CheckoutCalculationResponse,
} from '@/types/api';
import styles from './page.module.css';

const initialPayload: CalculateCheckoutPayload = {
  phone: '',
  promoCode: '',
  giftCardNumber: '',
  items: [
    {
      sku: 'SKU-001',
      quantity: 1,
      price: 5400,
    },
  ],
};

export default function CheckoutPage() {
  const [payload, setPayload] = useState<CalculateCheckoutPayload>(initialPayload);
  const [result, setResult] = useState<CheckoutCalculationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const subtotal = useMemo(
    () =>
      payload.items.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      ),
    [payload.items],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const sanitizedPayload: CalculateCheckoutPayload = {
        phone: payload.phone?.trim() || undefined,
        promoCode: payload.promoCode?.trim() || undefined,
        giftCardNumber: payload.giftCardNumber?.trim() || undefined,
        items: payload.items,
      };
      const response = await calculateCheckout(sanitizedPayload);
      setResult(response);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Не удалось выполнить расчет корзины.';
      setError(message);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.header}>
          <p className={styles.eyebrow}>Checkout Demo</p>
          <h1>Тестовая форма расчета корзины</h1>
          <p className={styles.description}>
            Страница отправляет данные в Next.js endpoint
            <code>/api/v1/checkout/calculate</code> и показывает результат серверного
            расчета.
          </p>
        </section>

        <div className={styles.layout}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>Телефон</span>
              <input
                value={payload.phone}
                onChange={(event) =>
                  setPayload((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder="+79990000000"
              />
            </label>

            <label className={styles.field}>
              <span>Промокод</span>
              <input
                value={payload.promoCode}
                onChange={(event) =>
                  setPayload((current) => ({
                    ...current,
                    promoCode: event.target.value,
                  }))
                }
                placeholder="SPRING10"
              />
            </label>

            <label className={styles.field}>
              <span>Подарочная карта</span>
              <input
                value={payload.giftCardNumber}
                onChange={(event) =>
                  setPayload((current) => ({
                    ...current,
                    giftCardNumber: event.target.value,
                  }))
                }
                placeholder="GIFT-001"
              />
            </label>

            <div className={styles.items}>
              <h2>Товар</h2>

              <label className={styles.field}>
                <span>Артикул</span>
                <input
                  value={payload.items[0]?.sku ?? ''}
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      items: [
                        {
                          ...current.items[0],
                          sku: event.target.value,
                        },
                      ],
                    }))
                  }
                />
              </label>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Количество</span>
                  <input
                    type="number"
                    min="1"
                    value={payload.items[0]?.quantity ?? 1}
                    onChange={(event) =>
                      setPayload((current) => ({
                        ...current,
                        items: [
                          {
                            ...current.items[0],
                            quantity: Number(event.target.value),
                          },
                        ],
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Цена</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payload.items[0]?.price ?? 0}
                    onChange={(event) =>
                      setPayload((current) => ({
                        ...current,
                        items: [
                          {
                            ...current.items[0],
                            price: Number(event.target.value),
                          },
                        ],
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className={styles.summary}>
              <span>Локальный subtotal</span>
              <strong>{subtotal.toFixed(2)} RUB</strong>
            </div>

            <button className={styles.submit} type="submit" disabled={isLoading}>
              {isLoading ? 'Считаем...' : 'Рассчитать в API'}
            </button>

            {error ? <p className={styles.error}>{error}</p> : null}
          </form>

          <aside className={styles.result}>
            <h2>Ответ API</h2>
            {result ? (
              <>
                <div className={styles.resultGrid}>
                  <div>
                    <span>Статус</span>
                    <strong>{result.status}</strong>
                  </div>
                  <div>
                    <span>Action</span>
                    <strong>{result.action}</strong>
                  </div>
                  <div>
                    <span>Subtotal</span>
                    <strong>{result.subtotal.toFixed(2)} RUB</strong>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>{result.total.toFixed(2)} RUB</strong>
                  </div>
                </div>

                <pre className={styles.code}>
                  {JSON.stringify(result, null, 2)}
                </pre>
              </>
            ) : (
              <p className={styles.placeholder}>
                После отправки формы здесь появится результат расчета корзины.
              </p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
