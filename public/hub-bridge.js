// Dev-only localStorage bridge for the worker preview hub.
// Injected into every vite dev page served inside a hub iframe (see
// vite.config.ts transformIndexHtml). Reads fall through to the frame's
// NATIVE localStorage (so the main tab is instant), writes for lemon_schedule_*
// keys are forwarded to the hub page, which mirrors them to all worker tabs.
// Runs only inside iframes — direct tabs keep native behavior.
(function () {
  if (window.top === window.self) return;
  var PREFIX = 'lemon_schedule_';
  var target = window.parent;
  var cache = new Map();
  var real = window.localStorage;
  var ready = false;

  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.hubBridge !== 'store') return;
    if (d.type === 'snapshot') {
      cache.clear();
      for (var k in d.data || {}) cache.set(k, d.data[k]);
      ready = true;
    } else if (d.type === 'set' && d.key && d.key.indexOf(PREFIX) === 0) {
      cache.set(d.key, d.value);
    } else if (d.type === 'remove' && d.key && d.key.indexOf(PREFIX) === 0) {
      cache.delete(d.key);
    } else if (d.type === 'clear') {
      cache.clear();
    }
  });

  var proxied = {
    getItem: function (k) {
      if (cache.has(k)) return cache.get(k);
      try { var v = real.getItem(k); if (k.indexOf(PREFIX) === 0 && v != null) return v; return v; } catch (err) { return null; }
    },
    setItem: function (k, v) {
      var s = String(v);
      if (k.indexOf(PREFIX) === 0) {
        cache.set(k, s);
        try { real.setItem(k, s); } catch (err) {}   // own-origin copy (workers are read-only in the shared store)
        try { target.postMessage({ hubBridge: 'set', key: k, value: s }, '*'); } catch (err) {}
      } else {
        try { real.setItem(k, s); } catch (err) {}
      }
    },
    removeItem: function (k) {
      if (k.indexOf(PREFIX) === 0) {
        cache.delete(k);
        try { real.removeItem(k); } catch (err) {}
        try { target.postMessage({ hubBridge: 'remove', key: k }, '*'); } catch (err) {}
      } else {
        try { real.removeItem(k); } catch (err) {}
      }
    },
    clear: function () {
      cache.clear();
      try {
        var doomed = [];
        for (var i = 0; i < real.length; i++) { var k = real.key(i); if (k && k.indexOf(PREFIX) === 0) doomed.push(k); }
        for (var j = 0; j < doomed.length; j++) real.removeItem(doomed[j]);
      } catch (err) {}
      try { target.postMessage({ hubBridge: 'clear' }, '*'); } catch (err) {}
    },
    key: function (i) { return Array.from(cache.keys())[i] ?? null; },
    get length() { return cache.size; },
  };

  try {
    Object.defineProperty(window, 'localStorage', { value: proxied, configurable: true });
  } catch (err) { return; }

  // Tell the hub we're alive and push our native data so workers can see it.
  var seed = {};
  try {
    for (var i = 0; i < real.length; i++) {
      var k = real.key(i);
      if (k && k.indexOf(PREFIX) === 0) seed[k] = real.getItem(k);
    }
  } catch (err) {}
  try { target.postMessage({ hubBridge: 'hello', native: seed }, '*'); } catch (err) {}
})();
