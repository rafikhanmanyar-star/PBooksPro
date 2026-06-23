/**
 * PERF-P3.1 — Deferred bundle 503 probe (browser console, evidence only).
 *
 * Usage:
 *   1. Open app (logged in)
 *   2. F12 → Console → paste entire file
 *   3. Navigate Accounting / Procurement / Project Construction / Project Selling
 *   4. copy(JSON.stringify(__PBOOKS_EXPORT_DEFERRED_BUNDLE_PROBE__(), null, 2))
 */
(function installDeferredBundleProbe() {
  if (window.__PBOOKS_DEFERRED_BUNDLE_PROBE__) {
    console.warn('[P3.1-PROBE] Already installed');
    return;
  }

  var TARGET = ['bills,vendors', 'invoices,bills'];
  var logs = [];
  var seq = 0;

  function iso() {
    return new Date().toISOString();
  }

  function parseEntities(path) {
    var m = path.match(/[?&]entities=([^&]+)/);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return m[1];
    }
  }

  function isTargetDeferredBulk(url) {
    if (url.indexOf('/state/bulk') === -1 || url.indexOf('/state/bulk-chunked') !== -1) return false;
    var path = parsePath(url);
    var entities = parseEntities(path);
    if (!entities) return false;
    return TARGET.indexOf(entities) !== -1;
  }

  function parsePath(url) {
    try {
      var u = new URL(url, window.location.origin);
      return u.pathname.replace(/^\/api\/v1/, '') + (u.search || '');
    } catch (e) {
      return String(url);
    }
  }

  function coordinatorSnapshot() {
    try {
      if (window.__PBOOKS_BOOTSTRAP_COORDINATOR_SNAPSHOT__) {
        return window.__PBOOKS_BOOTSTRAP_COORDINATOR_SNAPSHOT__();
      }
    } catch (e) {
      /* optional hook */
    }
    return null;
  }

  function log(event, extra) {
    var entry = {
      seq: ++seq,
      event: event,
      at: iso(),
      coordinator: coordinatorSnapshot(),
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) entry[k] = extra[k];
      }
    }
    logs.push(entry);
    console.log('[P3.1-PROBE]', event, entry);
    return entry;
  }

  var inflight = {};

  var origFetch = window.fetch;
  window.fetch = function () {
    var url = String(arguments[0] || '');
    var target = isTargetDeferredBulk(url);
    var path = parsePath(url);
    var entities = parseEntities(path);
    var dedupeKey = entities ? 'tenant|' + path : null;
    var start = performance.now();
    var reqId = 'def-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

    if (target) {
      var existing = dedupeKey && inflight[dedupeKey];
      log('deferred_bulk_start', {
        reqId: reqId,
        path: path,
        entities: entities,
        dedupeKey: dedupeKey,
        dedupeHit: !!existing,
        attachedTo: existing || null,
        source: 'network (initiator: Performance tab / stack)',
      });
      if (dedupeKey && !existing) inflight[dedupeKey] = reqId;
    }

    return origFetch.apply(this, arguments).then(function (res) {
      if (target) {
        var durationMs = Math.round(performance.now() - start);
        log('deferred_bulk_end', {
          reqId: reqId,
          path: path,
          entities: entities,
          status: res.status,
          durationMs: durationMs,
          retryAfter: res.headers.get('Retry-After'),
        });
        if (res.status === 503) {
          log('deferred_bulk_503', {
            reqId: reqId,
            entities: entities,
            path: path,
            code: 'POOL_SATURATED suspected',
            metrics: coordinatorSnapshot(),
          });
        }
        if (dedupeKey && inflight[dedupeKey] === reqId) delete inflight[dedupeKey];
      }
      return res;
    });
  };

  document.addEventListener(
    'click',
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest('aside button, aside a');
      if (!btn) return;
      log('nav_click', { label: (btn.textContent || '').trim().slice(0, 80) });
    },
    true
  );

  window.__PBOOKS_DEFERRED_BUNDLE_PROBE__ = true;
  window.__PBOOKS_EXPORT_DEFERRED_BUNDLE_PROBE__ = function () {
    return {
      program: 'PERF-P3.1-deferred-bundle-probe',
      capturedAt: iso(),
      targetBundles: TARGET,
      deferred503Count: logs.filter(function (l) {
        return l.event === 'deferred_bulk_503';
      }).length,
      dedupeHits: logs.filter(function (l) {
        return l.event === 'deferred_bulk_start' && l.dedupeHit;
      }).length,
      timeline: logs,
    };
  };

  log('probe_installed', {
    hint: 'Optional: expose getBootstrapCoordinator().getMetrics() as window.__PBOOKS_BOOTSTRAP_COORDINATOR_SNAPSHOT__',
  });
  console.log('[P3.1-PROBE] Export: copy(JSON.stringify(__PBOOKS_EXPORT_DEFERRED_BUNDLE_PROBE__(), null, 2))');
})();
