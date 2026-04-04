/**
 * iOS 18.6 Comprehensive Crash Prevention Patch
 * This file contains essential fixes for iOS 18.6 crashes
 * (Sanitized to remove dangerous metro/require overrides)
 */

try {
  // Only import crypto polyfill if actually needed
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues === 'undefined') {
      try {
          require('react-native-get-random-values');
      } catch (e) {
          console.warn('[iOS 18.6 Patch] Crypto polyfill not available, continuing without it');
      }
  }

  // 1. Safe TextEncoder/TextDecoder polyfill (only if missing)
  if (typeof global.TextEncoder === 'undefined') {
      global.TextEncoder = class TextEncoder {
          encode(str) {
              const utf8 = unescape(encodeURIComponent(str));
              const result = new Uint8Array(utf8.length);
              for (let i = 0; i < utf8.length; i++) {
                  result[i] = utf8.charCodeAt(i);
              }
              return result;
          }
      };
  }

  if (typeof global.TextDecoder === 'undefined') {
      global.TextDecoder = class TextDecoder {
          decode(buffer) {
              let result = '';
              const bytes = new Uint8Array(buffer);
              for (let i = 0; i < bytes.length; i++) {
                  result += String.fromCharCode(bytes[i]);
              }
              try {
                  return decodeURIComponent(escape(result));
              } catch (e) {
                  return result;
              }
          }
      };
  }

  // 2. Only add Buffer if truly missing (should already be polyfilled by React Native)
  if (typeof global.Buffer === 'undefined') {
      try {
          global.Buffer = require('buffer').Buffer;
      } catch (e) {
          console.log('[iOS 18.6 Patch] Buffer polyfill skipped');
      }
  }

  // 3. Ensure Symbol.asyncIterator exists (required for async operations)
  if (typeof Symbol.asyncIterator === 'undefined') {
      Symbol.asyncIterator = Symbol.for('Symbol.asyncIterator');
  }

  // 4. Fix for missing global functions that iOS 18.6 expects
  if (typeof global.queueMicrotask === 'undefined') {
      global.queueMicrotask = (callback) => {
          Promise.resolve().then(callback).catch(e => {
              setTimeout(() => { throw e; }, 0);
          });
      };
  }

  // 5. Fix for setImmediate (used by some RN internals)
  if (typeof global.setImmediate === 'undefined') {
      global.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
      global.clearImmediate = clearTimeout;
  }

  // 6. Fix for performance.now() which may be missing on iOS 18.6
  if (typeof global.performance === 'undefined') {
      global.performance = {
          now: () => Date.now()
      };
  }

  // 7. Additional iOS 18.6 specific fixes
  if (typeof global.requestAnimationFrame === 'undefined') {
      global.requestAnimationFrame = (callback) => {
          return setTimeout(callback, 1000 / 60); // 60 FPS
      };
  }

  if (typeof global.cancelAnimationFrame === 'undefined') {
      global.cancelAnimationFrame = clearTimeout;
  }

  console.log('[iOS 18.6 Patch] Safe polyfills applied successfully');

} catch (patchError) {
  console.error('[iOS 18.6 Patch] Failed to apply safe polyfills:', patchError);
}
