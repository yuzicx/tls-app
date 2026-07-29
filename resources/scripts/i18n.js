(function (window, document) {
  'use strict';

  var dataNode = document.getElementById('tls-i18n-catalog');
  var data = { language: 'en', messages: {}, sources: {} };
  var storageKey = 'tls.ui.language';

  if (dataNode) {
    try {
      data = JSON.parse(dataNode.textContent || '{}');
    } catch (error) {
      window.console.error('Could not parse the TLS interface catalogue.', error);
    }
  }

  function normalizeLanguage(language) {
    if (!language) return null;
    var normalized = String(language).trim().toLowerCase();
    if (normalized === 'en' || normalized.indexOf('en-') === 0) return 'en';
    if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-sg' ||
        normalized === 'zh-hans' || normalized.indexOf('zh-hans-') === 0) {
      return 'zh-Hans';
    }
    return null;
  }

  function storedLanguage() {
    try {
      return normalizeLanguage(window.localStorage.getItem(storageKey));
    } catch (error) {
      return null;
    }
  }

  function rememberLanguage(language) {
    try {
      window.localStorage.setItem(storageKey, language);
    } catch (error) {
      // Storage can be disabled without preventing server-side localization.
    }
  }

  var currentUrl = new URL(window.location.href);
  var requestedLanguage = normalizeLanguage(currentUrl.searchParams.get('lang'));
  var renderedLanguage = normalizeLanguage(data.language) || 'en';

  if (requestedLanguage) {
    rememberLanguage(requestedLanguage);
  } else {
    var preferredLanguage = storedLanguage();
    if (preferredLanguage && preferredLanguage !== renderedLanguage) {
      currentUrl.searchParams.set('lang', preferredLanguage);
      window.location.replace(currentUrl.toString());
      return;
    }
    rememberLanguage(renderedLanguage);
  }

  function interpolate(message, parameters) {
    if (!parameters) return message;

    return Object.keys(parameters).reduce(function (result, key) {
      return result.split('{' + key + '}').join(String(parameters[key]));
    }, message);
  }

  function translate(key, parameters, fallback) {
    var message = data.messages[key];
    if (typeof message !== 'string') message = fallback || key;
    return interpolate(message, parameters);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function sourcePattern(source) {
    var names = [];
    var expression = '';
    var cursor = 0;
    var placeholder = /\{([A-Za-z][A-Za-z0-9_-]*)\}/g;
    var match;

    while ((match = placeholder.exec(source)) !== null) {
      expression += escapeRegExp(source.slice(cursor, match.index));
      expression += '(.+?)';
      names.push(match[1]);
      cursor = match.index + match[0].length;
    }

    if (!names.length) return null;
    expression += escapeRegExp(source.slice(cursor));
    return { regex: new RegExp('^' + expression + '$'), names: names };
  }

  var sourcePatterns = Object.keys(data.sources || {}).reduce(function (patterns, source) {
    var pattern = sourcePattern(source);
    if (pattern) {
      pattern.source = source;
      pattern.translation = data.sources[source];
      patterns.push(pattern);
    }
    return patterns;
  }, []).sort(function (left, right) {
    return right.source.replace(/\{[^}]+\}/g, '').length -
      left.source.replace(/\{[^}]+\}/g, '').length;
  });

  function translateSource(source) {
    if (typeof source !== 'string') return source;
    var normalized = source.replace(/\s+/g, ' ').trim();
    if (data.sources[normalized]) return data.sources[normalized];

    for (var index = 0; index < sourcePatterns.length; index += 1) {
      var pattern = sourcePatterns[index];
      var match = normalized.match(pattern.regex);
      if (!match) continue;

      var parameters = {};
      pattern.names.forEach(function (name, parameterIndex) {
        parameters[name] = match[parameterIndex + 1];
      });
      return interpolate(pattern.translation, parameters);
    }

    return source;
  }

  function isInUiScope(element) {
    if (!element || !element.closest) return false;
    var boundary = element.closest('[data-i18n-scope]');
    return Boolean(boundary && boundary.getAttribute('data-i18n-scope') === 'ui');
  }

  function translateElement(element, scoped) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (/^(SCRIPT|STYLE)$/i.test(element.tagName)) return;

    var scope = element.getAttribute('data-i18n-scope');
    var inScope = scope === 'content' ? false : scoped || scope === 'ui';
    var key = element.getAttribute('data-i18n');

    if (key) {
      element.textContent = translate(key, null, element.textContent.trim());
    } else if (inScope) {
      Array.prototype.slice.call(element.childNodes).forEach(function (child) {
        if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()) {
          var translated = translateSource(child.nodeValue);
          if (translated !== child.nodeValue) child.nodeValue = translated;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          translateElement(child, true);
        }
      });
    }

    ['aria-label', 'placeholder', 'title', 'value'].forEach(function (name) {
      if (!element.hasAttribute(name)) return;
      var attributeKey = element.getAttribute('data-i18n-' + name);
      var value = element.getAttribute(name);
      var translatedValue = attributeKey
        ? translate(attributeKey, null, value)
        : (inScope ? translateSource(value) : value);
      if (translatedValue !== value) element.setAttribute(name, translatedValue);
    });
  }

  function localize(root) {
    if (!root) return;

    if (root.nodeType === Node.ELEMENT_NODE) {
      var scoped = isInUiScope(root);
      translateElement(root, scoped);
    }

    if (root.querySelectorAll) {
      root.querySelectorAll(
        '[data-i18n], [data-i18n-scope], [data-i18n-aria-label], ' +
        '[data-i18n-placeholder], [data-i18n-title], [data-i18n-value]'
      ).forEach(function (element) {
        var scoped = isInUiScope(element);
        translateElement(element, scoped);
      });
    }
  }

  window.tlsSetLanguage = function (language) {
    var normalizedLanguage = normalizeLanguage(language) || 'en';
    var url = new URL(window.location.href);
    rememberLanguage(normalizedLanguage);
    url.searchParams.set('lang', normalizedLanguage);
    window.location.assign(url.toString());
  };

  window.TLSI18n = {
    language: data.language || 'en',
    t: translate,
    fromSource: translateSource,
    localize: localize
  };

  var nativeAlert = window.alert.bind(window);
  var nativeConfirm = window.confirm.bind(window);
  var nativePrompt = window.prompt.bind(window);

  window.alert = function (message) {
    return nativeAlert(translateSource(message));
  };
  window.confirm = function (message) {
    return nativeConfirm(translateSource(message));
  };
  window.prompt = function (message, defaultValue) {
    return nativePrompt(translateSource(message), defaultValue);
  };

  if (window.toastr) {
    ['success', 'info', 'warning', 'error'].forEach(function (type) {
      var original = window.toastr[type];
      if (typeof original !== 'function') return;
      window.toastr[type] = function (message, title, options) {
        return original.call(window.toastr, translateSource(message), translateSource(title), options);
      };
    });
  }

  document.documentElement.setAttribute('lang', data.language || 'en');
  localize(document);

  if (document.body && window.MutationObserver) {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.slice.call(mutation.addedNodes).forEach(function (node) {
          if (node.nodeType === Node.ELEMENT_NODE) localize(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})(window, document);
