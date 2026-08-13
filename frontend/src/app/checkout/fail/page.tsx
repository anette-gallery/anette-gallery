'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from '../page.module.css';

const CATALOG_URL = 'https://anette-gallery.tilda.ws/main';

function CheckoutFailContent() {
  const search = useSearchParams();
  const reason = search.get('reason') || 'payment_failed';

  const reasonText: Record<string, string> = {
    payment_failed: 'Платеж не прошел.',
    cancelled: 'Платеж отменен пользователем.',
    expired: 'Сессия оплаты истекла.',
  };

  return (
    <main className={styles.resultPage}>
      <div className={styles.resultCard}>
        <div className={styles.statusIconFail}>✕</div>
        <h1 className={styles.resultTitle}>Не удалось оплатить</h1>
        <p className={styles.resultSubtitle}>
          {reasonText[reason] || 'Платеж не прошел. Попробуйте снова.'}
        </p>
        <div className={styles.resultButtons}>
          <Link href="/checkout" className={styles.resultButton}>
            Попробовать снова
          </Link>
          <a href={CATALOG_URL} className={styles.resultButtonGhost}>
            Вернуться в каталог
          </a>
        </div>
      </div>
    </main>
  );
}

export const dynamic = 'force-dynamic';

export default function CheckoutFailPage() {
  return (
    <Suspense fallback={<main className={styles.resultPage} />}>
      <CheckoutFailContent />
    </Suspense>
  );
}
