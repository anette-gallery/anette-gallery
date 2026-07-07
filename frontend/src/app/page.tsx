import styles from './page.module.css';

const checkpoints = [
  'Каталог и карточка товара на Next.js',
  'Checkout с интеграцией карт лояльности, промокодов и сертификатов',
  'Backend API для Maxma, Tilda и 1С',
  'GitHub + Vercel + отдельный backend deployment',
];

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.badge}>Lapaloma Commerce Platform</div>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>ООО &quot;ЛАПАЛОМА&quot;</p>
          <h1>Стартовый frontend для интеграции Tilda, Maxma и 1С</h1>
          <p className={styles.description}>
            Этот проект разворачивается как основа для каталога, корзины,
            checkout и личного кабинета на Next.js с дальнейшим подключением
            backend API и деплоем через GitHub и Vercel.
          </p>
        </section>
        <section className={styles.grid}>
          {checkpoints.map((item) => (
            <article key={item} className={styles.card}>
              <h2>{item}</h2>
            </article>
          ))}
        </section>
        <section className={styles.actions}>
          <a className={styles.primary} href="/checkout">
            Открыть checkout
          </a>
          <a
            className={styles.secondary}
            href="https://vercel.com/new"
            target="_blank"
            rel="noreferrer"
          >
            Подключить Vercel
          </a>
        </section>
      </main>
    </div>
  );
}
