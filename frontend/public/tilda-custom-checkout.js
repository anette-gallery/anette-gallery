(function () {
  var script = document.currentScript;
  var CHECKOUT_URL =
    (script && script.dataset && script.dataset.checkoutUrl) ||
    'https://anette-gallery-frontend.vercel.app/checkout';
  var BUTTON_TEXT =
    (script && script.dataset && script.dataset.buttonText) ||
    'Оформить заказ';
  var BRIDGE_ATTR = 'data-custom-checkout-bound';
  var BUTTON_CLASS = 't-custom-checkout-button';
  var STYLE_ELEMENT_ID = 't-custom-checkout-button-styles';
  var CART_ROOT_SELECTOR =
    '.t706__cartwin, .t706__cartpage, .t706__sidebar, .t706, .t-store__cart, .t-popup, .t228__cart, .js-store-cart';
  var CART_ACTION_SELECTOR =
    'button, a, input[type="submit"], input[type="button"], [role="button"], .t706__cartwin-proceed, .t706__cartpage-open-form, .t706__sidebar-continue, .t706__orderform-btn, .js-store-order, .js-cart-order, .js-tcart-checkout';

  function injectButtonStyles() {
    if (document.getElementById(STYLE_ELEMENT_ID)) {
      return;
    }

    var style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent =
      '.' +
      BUTTON_CLASS +
      '{' +
      'display:flex !important;' +
      'align-items:center !important;' +
      'justify-content:center !important;' +
      'width:100% !important;' +
      'min-height:56px !important;' +
      'padding:16px 24px !important;' +
      'border:0 !important;' +
      'border-radius:12px !important;' +
      'background:#d61f1f !important;' +
      'background-image:none !important;' +
      'box-shadow:0 10px 24px rgba(214,31,31,0.18) !important;' +
      'color:#fff !important;' +
      'font-size:18px !important;' +
      'font-weight:600 !important;' +
      'line-height:1.2 !important;' +
      'text-align:center !important;' +
      'text-decoration:none !important;' +
      'opacity:1 !important;' +
      'cursor:pointer !important;' +
      'transition:transform .18s ease, box-shadow .18s ease, background-color .18s ease !important;' +
      '}' +
      '.' +
      BUTTON_CLASS +
      ':hover,' +
      '.' +
      BUTTON_CLASS +
      ':focus{' +
      'background:#bf1717 !important;' +
      'box-shadow:0 12px 28px rgba(214,31,31,0.22) !important;' +
      'transform:translateY(-1px) !important;' +
      'color:#fff !important;' +
      'outline:none !important;' +
      '}' +
      '.' +
      BUTTON_CLASS +
      ':disabled{' +
      'opacity:.75 !important;' +
      'cursor:not-allowed !important;' +
      'transform:none !important;' +
      '}' +
      '.t706__cartwin .' +
      BUTTON_CLASS +
      ',.t706__sidebar .' +
      BUTTON_CLASS +
      ',.t706__cartpage .' +
      BUTTON_CLASS +
      '{margin-top:8px !important;}';

    document.head.appendChild(style);
  }

  function applyButtonStyles(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }

    node.classList.add(BUTTON_CLASS);
    node.style.setProperty('background', '#d61f1f', 'important');
    node.style.setProperty('background-image', 'none', 'important');
    node.style.setProperty('color', '#ffffff', 'important');
    node.style.setProperty('border', '0', 'important');
    node.style.setProperty('border-radius', '12px', 'important');
    node.style.setProperty('box-shadow', '0 10px 24px rgba(214,31,31,0.18)', 'important');
  }

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
      item.art ||
      item.article ||
      item.vendorCode ||
      item.vendor_code ||
      item.externalId ||
      item.external_id ||
      item.offerId ||
      item.offerid ||
      item.sku ||
      item.uid ||
      item.variant ||
      ('item-' + (index + 1));
    var quantity = toQuantity(item.quantity || item.qty || item.count || 1);
    var price = toNumber(item.price || item.amount || item.sum || item.cost || 0);
    var image =
      item.image ||
      item.img ||
      item.photo ||
      item.picture ||
      item.pic ||
      item.imageUrl ||
      item.image_url ||
      '';

    if (!title || price < 0) {
      return null;
    }

    return {
      sku: String(sku).trim(),
      title: String(title).trim(),
      image: image ? String(image).trim() : undefined,
      quantity: quantity,
      price: price,
    };
  }

  function tryReadWindowCart() {
    var candidates = [
      window.tcart && window.tcart.products,
      window.tcart && window.tcart.prod,
      window.tildaCart && window.tildaCart.products,
      window.t_store && window.t_store.products,
      window.tcart__products,
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
    var keys = ['tcart', 'tcart_products', 'tilda_cart', 'tildacart', '__tcart', 't706cart'];

    for (var i = 0; i < keys.length; i += 1) {
      var raw = null;

      try {
        raw = window.localStorage.getItem(keys[i]) || window.sessionStorage.getItem(keys[i]);
      } catch {
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
      } catch {
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
      '.t706__product, .t706__cartwin-prod, .t706__cartpage-prod, .t706__sidebar-prod, .js-product'
    );

    if (!nodes.length) {
      return [];
    }

    return Array.prototype.map.call(nodes, function (node, index) {
      var title = textContent(node, [
        '.t706__product-title',
        '.t706__cartwin-prodtitle',
        '.t706__cartpage-prodtitle',
        '.t706__sidebar-prodtitle',
        '.t706__cartwin-prodname',
        '.js-product-name',
      ]);
      var sku =
        node.getAttribute('data-product-article') ||
        node.getAttribute('data-product-articul') ||
        node.getAttribute('data-product-externalid') ||
        node.getAttribute('data-product-sku') ||
        node.getAttribute('data-sku') ||
        node.getAttribute('data-product-uid') ||
        node.getAttribute('data-product-lid') ||
        ('item-' + (index + 1));
      var quantity = toQuantity(
        textContent(node, [
          '.t706__product-quantity',
          '.t706__cartwin-prodquantity',
          '.t706__cartpage-prodquantity',
          '.t706__sidebar-prodquantity',
        ])
      );
      var imageNode = node.querySelector(
        'img.t706__product-img, img.t706__cartwin-prodimg, img, [data-original], [data-img-zoom-url]'
      );
      var image =
        (imageNode &&
          (imageNode.getAttribute('src') ||
            imageNode.getAttribute('data-original') ||
            imageNode.getAttribute('data-img-zoom-url'))) ||
        '';
      var linePrice = toNumber(
        textContent(node, [
          '.t706__cartwin-prodamount-price',
          '.t706__product-price',
          '.t706__cartwin-prodamount',
          '.t706__cartpage-prodamount',
          '.t706__sidebar-prodamount',
        ])
      );

      return normalizeItem(
        {
          sku: sku,
          title: title || ('Товар ' + (index + 1)),
          image: image,
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

  function normalizeSpaces(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeSpaces(value));
  }

  function looksLikePhone(value) {
    return /^\+?\d[\d\s()-]{8,}$/.test(normalizeSpaces(value));
  }

  function looksLikeName(value) {
    var normalized = normalizeSpaces(value);
    return normalized.length >= 3 && /[a-zа-яё]/i.test(normalized);
  }

  function getByPath(source, path) {
    var current = source;

    for (var i = 0; i < path.length; i += 1) {
      if (!current || typeof current !== 'object' || !(path[i] in current)) {
        return '';
      }

      current = current[path[i]];
    }

    return current;
  }

  function findNestedValue(source, keys, validator, depth) {
    if (!source || typeof source !== 'object' || depth > 4) {
      return '';
    }

    var sourceKeys = Object.keys(source);

    for (var i = 0; i < sourceKeys.length; i += 1) {
      var key = sourceKeys[i];
      var normalizedKey = key.toLowerCase();
      var value = source[key];

      if (keys.indexOf(normalizedKey) !== -1 && typeof value === 'string') {
        var normalizedValue = normalizeSpaces(value);

        if (validator(normalizedValue)) {
          return normalizedValue;
        }
      }

      if (value && typeof value === 'object') {
        var nestedValue = findNestedValue(value, keys, validator, depth + 1);

        if (nestedValue) {
          return nestedValue;
        }
      }
    }

    return '';
  }

  function readProfileFromDom() {
    var name = textContent(document, [
      '.profile-name',
      '[data-member-name]',
      '[data-profile-name]',
      '.t-account__name',
      '.t-auth__name',
      '.js-member-name',
    ]);
    var email = textContent(document, [
      '.profile-login',
      '[data-member-email]',
      '[data-profile-email]',
      '.t-account__email',
      '.js-member-email',
    ]);
    var phone = textContent(document, [
      '.profile-phone',
      '[data-member-phone]',
      '[data-profile-phone]',
      '.t-account__phone',
      '.js-member-phone',
    ]);

    if (!email) {
      var emailLink = document.querySelector('a[href^="mailto:"]');
      email = emailLink
        ? normalizeSpaces((emailLink.getAttribute('href') || '').replace(/^mailto:/i, ''))
        : '';
    }

    if (!phone) {
      var phoneLink = document.querySelector('a[href^="tel:"]');
      phone = phoneLink
        ? normalizeSpaces((phoneLink.getAttribute('href') || '').replace(/^tel:/i, ''))
        : '';
    }

    return {
      name: looksLikeName(name) ? name : '',
      email: looksLikeEmail(email) ? email : '',
      phone: looksLikePhone(phone) ? phone : '',
    };
  }

  function readProfileFromWindow() {
    var sources = [
      window.__TildaMembers,
      window.__TildaMember,
      window.__TildaProfile,
      window.tildaMember,
      window.tildaMembers,
      window.tildaUser,
      window.currentUser,
      window.currentMember,
      window.__member,
      window.__user,
    ];
    var keyPaths = [
      ['user'],
      ['member'],
      ['profile'],
      ['profile', 'user'],
      ['profile', 'member'],
      ['customer'],
      ['data'],
    ];
    var candidates = [];

    for (var i = 0; i < sources.length; i += 1) {
      if (sources[i] && typeof sources[i] === 'object') {
        candidates.push(sources[i]);

        for (var j = 0; j < keyPaths.length; j += 1) {
          var nested = getByPath(sources[i], keyPaths[j]);

          if (nested && typeof nested === 'object') {
            candidates.push(nested);
          }
        }
      }
    }

    var result = {
      name: '',
      email: '',
      phone: '',
    };

    for (var k = 0; k < candidates.length; k += 1) {
      var candidate = candidates[k];

      if (!result.name) {
        result.name = findNestedValue(
          candidate,
          ['name', 'fullname', 'full_name', 'fio', 'username', 'displayname'],
          looksLikeName,
          0
        );
      }

      if (!result.email) {
        result.email = findNestedValue(
          candidate,
          ['email', 'login', 'mail'],
          looksLikeEmail,
          0
        );
      }

      if (!result.phone) {
        result.phone = findNestedValue(
          candidate,
          ['phone', 'phonenumber', 'phone_number', 'tel', 'telephone', 'mobile'],
          looksLikePhone,
          0
        );
      }
    }

    return result;
  }

  function readProfileFromStorageArea(storage) {
    var keys = [];

    try {
      for (var i = 0; i < storage.length; i += 1) {
        var key = storage.key(i);

        if (key && /(member|profile|user|account|customer|cabinet|lk)/i.test(key)) {
          keys.push(key);
        }
      }
    } catch {
      keys = [];
    }

    var result = {
      name: '',
      email: '',
      phone: '',
    };

    for (var j = 0; j < keys.length; j += 1) {
      var rawValue = null;

      try {
        rawValue = storage.getItem(keys[j]);
      } catch {
        rawValue = null;
      }

      if (!rawValue) {
        continue;
      }

      var parsedValue = null;

      try {
        parsedValue = JSON.parse(rawValue);
      } catch {
        parsedValue = null;
      }

      if (!parsedValue || typeof parsedValue !== 'object') {
        continue;
      }

      if (!result.name) {
        result.name = findNestedValue(
          parsedValue,
          ['name', 'fullname', 'full_name', 'fio', 'username', 'displayname'],
          looksLikeName,
          0
        );
      }

      if (!result.email) {
        result.email = findNestedValue(
          parsedValue,
          ['email', 'login', 'mail'],
          looksLikeEmail,
          0
        );
      }

      if (!result.phone) {
        result.phone = findNestedValue(
          parsedValue,
          ['phone', 'phonenumber', 'phone_number', 'tel', 'telephone', 'mobile'],
          looksLikePhone,
          0
        );
      }
    }

    return result;
  }

  function readProfileFields() {
    var directFields = {
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
    };
    var domProfile = readProfileFromDom();
    var windowProfile = readProfileFromWindow();
    var storageProfile = readProfileFromStorageArea(window.localStorage);
    var sessionProfile = readProfileFromStorageArea(window.sessionStorage);

    return {
      name:
        directFields.name ||
        domProfile.name ||
        windowProfile.name ||
        storageProfile.name ||
        sessionProfile.name,
      phone:
        directFields.phone ||
        domProfile.phone ||
        windowProfile.phone ||
        storageProfile.phone ||
        sessionProfile.phone,
      email:
        directFields.email ||
        domProfile.email ||
        windowProfile.email ||
        storageProfile.email ||
        sessionProfile.email,
      comment: readField([
        'textarea[name="comment"]',
        'textarea[name="message"]',
      ]),
    };
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

    var fields = readProfileFields();

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

  function findCartActionNode(node) {
    if (!node || node.nodeType !== 1) {
      return null;
    }

    if (typeof node.closest === 'function') {
      return node.closest(CART_ACTION_SELECTOR);
    }

    return null;
  }

  function isCartButton(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }

    var text = ((node.textContent || node.value || '') + '').toLowerCase();
    var href = ((node.getAttribute && node.getAttribute('href')) || '').toLowerCase();
    var className =
      typeof node.className === 'string'
        ? node.className.toLowerCase()
        : '';
    var inCartPopup = !!node.closest(CART_ROOT_SELECTOR);
    var looksLikeCheckoutAction =
      /оформ|заказ|checkout|order/.test(text) ||
      /checkout|order|cart/.test(href) ||
      /order|checkout|cart|cartpage-open-form|sidebar-continue/.test(className);

    return inCartPopup && looksLikeCheckoutAction;
  }

  function bindCartButtons() {
    injectButtonStyles();

    var nodes = document.querySelectorAll(CART_ACTION_SELECTOR);

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

      applyButtonStyles(node);
      node.addEventListener('click', openCustomCheckout, true);
    });
  }

  function handleDocumentClick(event) {
    var actionNode = findCartActionNode(event.target);

    if (!isCartButton(actionNode)) {
      return;
    }

    openCustomCheckout(event);
  }

  function handleDocumentSubmit(event) {
    var form = event.target;

    if (!form || form.nodeType !== 1 || typeof form.closest !== 'function') {
      return;
    }

    if (!form.closest(CART_ROOT_SELECTOR)) {
      return;
    }

    openCustomCheckout(event);
  }

  bindCartButtons();
  document.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('submit', handleDocumentSubmit, true);

  var observer = new MutationObserver(function () {
    bindCartButtons();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
