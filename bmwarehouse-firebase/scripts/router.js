// /scripts/router.js

/**
 * Parse query string from current URL
 * @returns {Object} Key-value pairs from query string
 */
export function parseQuery() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  
  return result;
}

/**
 * Navigate to a new URL
 * @param {string} url - Relative or absolute URL
 * @param {boolean} replace - Use replaceState instead of pushState
 */
export function navigate(url, replace = false) {
  if (replace) {
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
}

/**
 * Build a URL with query parameters
 * @param {string} base - Base URL
 * @param {Object} params - Query parameters
 * @returns {string} Complete URL
 */
export function buildUrl(base, params = {}) {
  const url = new URL(base, window.location.origin);
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  
  return url.toString();
}

/**
 * Register callback for when guardRoute completes successfully
 * This fires when [data-app-ready] is set on body
 * @param {Function} callback 
 */
export function onGuardReady(callback) {
  // Check if already ready
  if (document.body.hasAttribute('data-app-ready')) {
    callback();
    return;
  }
  
  // Wait for attribute to be set
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && 
          mutation.attributeName === 'data-app-ready' &&
          document.body.hasAttribute('data-app-ready')) {
        observer.disconnect();
        callback();
        break;
      }
    }
  });
  
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-app-ready']
  });
}

/**
 * Get current path without query string
 * @returns {string}
 */
export function getCurrentPath() {
  return window.location.pathname;
}

/**
 * Check if current path matches a pattern
 * @param {string} pattern - Path pattern (supports * wildcard)
 * @returns {boolean}
 */
export function matchPath(pattern) {
  const currentPath = getCurrentPath();
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(currentPath);
}