# Подключение кастомного checkout к Tilda

Этот сценарий нужен, чтобы из корзины `Tilda` переводить клиента в наш checkout на `Next.js`, а не оформлять заказ внутри стандартного popup checkout `Tilda`.

## Что уже готово

- страница checkout: `https://anette-gallery-frontend.vercel.app/checkout`
- JS-мост для Tilda: `https://anette-gallery-frontend.vercel.app/tilda-custom-checkout.js`

## Что вставить в Tilda

В `T123` или в `Настройки сайта -> Еще -> HTML-код для вставки перед </body>`:

```html
<script
  src="https://anette-gallery-frontend.vercel.app/tilda-custom-checkout.js"
  data-checkout-url="https://anette-gallery-frontend.vercel.app/checkout"
  data-button-text="Оформить заказ"
  defer
></script>
```

## Что делает скрипт

- следит за popup корзины `Tilda`
- находит кнопку оформления заказа
- собирает товары из корзины
- пытается подтянуть `name`, `phone`, `email`, `comment`, если они уже заполнены
- переводит клиента на наш checkout

Пример URL перехода:

```text
https://anette-gallery-frontend.vercel.app/checkout?items=[...]&name=...&phone=...
```

## Как проверить

1. Открыть сайт на `Tilda`
2. Добавить товар в корзину
3. Открыть корзину
4. Нажать кнопку `Оформить заказ`
5. Убедиться, что открылся наш checkout
6. Проверить, что товар, цена и количество попали в правый блок

## Что важно

- если на странице несколько кастомных сценариев для checkout, старый JS нужно удалить, чтобы он не конфликтовал
- скрипт рассчитан именно на переход в наш checkout, а не на оформление заказа внутри `Tilda`
- после публикации новой версии на `Vercel` в `Tilda` ничего менять не нужно, если URL скрипта и checkout не изменятся
