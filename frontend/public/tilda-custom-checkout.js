(function () {
  var script = document.currentScript;
  var CHECKOUT_URL =
    (script && script.dataset && script.dataset.checkoutUrl) ||
    'https://anette-gallery-frontend.vercel.app/checkout';
  var BUTTON_TEXT =
    (script && script.dataset && script.dataset.buttonText) ||
    'Оформить заказ';
  var BRIDGE_ATTR = 'data-custom-checkout-bound';

  function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      var normalized = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
      var parsed = Number(normalized);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  function toQuantity(value) {
    var parsed = Math.trunc(toNumber(value));
    return parsed > 0 ? parsed : 1;
  }

  function normalizeItem(item, index) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    var title = item.title || item.name || item.product || ('Товар ' + (index + 1));
    var sku =
      item.sku ||
      item.uid ||
      item.art ||
      item.article ||
      item.variant ||
      ('item-' + (index + 1));
    var quantity = toQuantity(item.quantity || item.qty || item.count || 1);
    var price = toNumber(item.price || item.amount || item.sum || item.cost || 0);

    if (!title || price < 0) {
      return null;
    }

    return {
      sku: String(sku).trim(),
      title: String(title).trim(),
      quantity: quantity,
      price: price,
    };
  }

  function tryReadWindowCart() {
    var candidates = [
      window.tcart && window.tcart.products,
      window.tildaCart && window.tildaCart.products,
      window.t_store && window.t_store.products,
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];

      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate.map(normalizeItem).filter(Boolean);
      }
    }

    return [];
  }

  function tryReadStorageCart() {
    var keys = ['tcart', 'tcart_products', 'tilda_cart', 'tildacart'];

    for (var i = 0; i < keys.length; i += 1) {
      var raw = null;

      try {
        raw = window.localStorage.getItem(keys[i]) || window.sessionStorage.getItem(keys[i]);
      } catch (error) {
        raw = null;
      }

      if (!raw) {
        continue;
      }

      try {
        var parsed = JSON.parse(raw);
        var products = Array.isArray(parsed) ? parsed : parsed && parsed.products;

        if (Array.isArray(products) && products.length > 0) {
          return products.map(normalizeItem).filter(Boolean);
        }
      } catch (error) {
        // ignore malformed storage payload
      }
    }

    return [];
  }

  function textContent(node, selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var target = node.querySelector(selectors[i]);

      if (target && target.textContent) {
        var value = target.textContent.trim();

        if (value) {
          return value;
        }
      }
    }

    return '';
  }

  function tryReadDomCart() {
    var nodes = document.querySelectorAll(
      '.t706__product, .t706__cartwin-prod, .js-product'
    );

    if (!nodes.length) {
      return [];
    }

    return Array.prototype.map.call(nodes, function (node, index) {
      var title = textContent(node, [
        '.t706__product-title',
        '.t706__cartwin-prodtitle',
        '.t706__cartwin-prodname',
        '.js-product-name',
      ]);
      var sku =
        node.getAttribute('data-product-sku') ||
        node.getAttribute('data-sku') ||
        node.getAttribute('data-product-lid') ||
        ('item-' + (index + 1));
      var quantity = toQuantity(
        textContent(node, ['.t706__product-quantity', '.t706__cartwin-prodquantity'])
      );
      var linePrice = toNumber(
        textContent(node, [
          '.t706__cartwin-prodamount-price',
          '.t706__product-price',
          '.t706__cartwin-prodamount',
        ])
      );

      return normalizeItem(
        {
          sku: sku,
          title: title || ('Товар ' + (index + 1)),
          quantity: quantity,
          price: quantity > 1 ? linePrice / quantity : linePrice,
        },
        index
      );
    }).filter(Boolean);
  }

  function readField(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var input = document.querySelector(selectors[i]);

      if (input && typeof input.value === 'string') {
        var value = input.value.trim();

        if (value) {
          return value;
        }
      }
    }

    return '';
  }

  function buildCheckoutUrl() {
    var items = tryReadWindowCart();

    if (!items.length) {
      items = tryReadStorageCart();
    }

    if (!items.length) {
      items = tryReadDomCart();
    }

    if (!items.length) {
      return null;
    }

    var url = new URL(CHECKOUT_URL, window.location.origin);
    url.searchParams.set('items', JSON.stringify(items));

    var fields = {
      name: readField([
        'input[name="name"]',
        'input[name="Name"]',
        'input[name="fio"]',
        'input[name="fullName"]',
      ]),
      phone: readField([
        'input[name="phone"]',
        'input[name="tel"]',
        'input[name="telephone"]',
        'input[type="tel"]',
      ]),
      email: readField([
        'input[name="email"]',
        'input[type="email"]',
      ]),
      comment: readField([
        'textarea[name="comment"]',
        'textarea[name="message"]',
      ]),
    };

    Object.keys(fields).forEach(function (key) {
      if (fields[key]) {
        url.searchParams.set(key, fields[key]);
      }
    });

    return url.toString();
  }

  function openCustomCheckout(event) {
    var targetUrl = buildCheckoutUrl();

    if (!targetUrl) {
      window.alert('Не удалось собрать товары из корзины Tilda для перехода в checkout.');
      return;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    window.location.href = targetUrl;
  }

  function isCartButton(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }

    var text = ((node.textContent || node.value || '') + '').toLowerCase();
    var inCartPopup = !!node.closest('.t706__cartwin, .t706, .t-store__cart, .t-popup');

    return inCartPopup && /оформ|заказ|checkout|order/.test(text);
  }

  function bindCartButtons() {
    var nodes = document.querySelectorAll('button, a, input[type="submit"]');

    Array.prototype.forEach.call(nodes, function (node) {
      if (!isCartButton(node) || node.getAttribute(BRIDGE_ATTR) === '1') {
        return;
      }

      node.setAttribute(BRIDGE_ATTR, '1');

      if (node.tagName === 'INPUT') {
        node.value = BUTTON_TEXT;
      } else if (node.textContent && /оформ|заказ|checkout|order/i.test(node.textContent)) {
        node.textContent = BUTTON_TEXT;
      }

      node.addEventListener('click', openCustomCheckout, true);
    });
  }

  bindCartButtons();

  var observer = new MutationObserver(function () {
    bindCartButtons();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
