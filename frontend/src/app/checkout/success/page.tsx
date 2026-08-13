import Link from 'next/link';
import styles from '../page.module.css';

export const dynamic = 'force-dynamic';
const CATALOG_URL = 'https://anette-gallery.tilda.ws/main';

export default function CheckoutSuccessPage() {
  return (
    <main className={styles.resultPage}>
      <div className={styles.resultCard}>
        <div className={styles.statusIconSuccess}>✔</div>
        <h1 className={styles.resultTitle}>Заказ оформлен</h1>
        <p className={styles.resultSubtitle}>
          Спасибо за покупку! Мы свяжемся с вами в ближайшее время для
          подтверждения и согласования деталей доставки.
        </p>
        <a href={CATALOG_URL} className={styles.resultButton}>
          Вернуться в каталог
        </a>
      </div>
    </main>
  );
}
