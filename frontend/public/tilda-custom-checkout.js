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
        node.getAttribute('data-product-article') ||
        node.getAttribute('data-product-articul') ||
        node.getAttribute('data-product-externalid') ||
        node.getAttribute('data-product-sku') ||
        node.getAttribute('data-sku') ||
        node.getAttribute('data-product-uid') ||
        node.getAttribute('data-product-lid') ||
        ('item-' + (index + 1));
      var quantity = toQuantity(
        textContent(node, ['.t706__product-quantity', '.t706__cartwin-prodquantity'])
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
