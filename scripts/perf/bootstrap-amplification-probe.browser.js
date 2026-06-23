/**
 * PERF-P2-D — Bootstrap amplification probe (browser console, measurement only).
 *
 * Usage:
 *   1. Open https://app.pbookspro.com (logged in)
 *   2. F12 → Console → paste entire file
 *   3. Login / navigate modules
 *   4. copy(JSON.stringify(__PBOOKS_EXPORT_BOOTSTRAP_AMP_PROBE__(), null, 2))
 */
(function installBootstrapAmplificationProbe() {
  if (window.__PBOOKS_BOOTSTRAP_AMP_PROBE__) {
    console.warn('[AMP-PROBE] Already installed');
    return;
  }

  var logs = [];
  var seq = 0;
  var activeBulk = 0;
  var peakActiveBulk = 0;
  var currentNav = null;

  function iso() {
    return new Date().toISOString();
  }

  function log(event, extra) {
    var entry = { seq: ++seq, event: event, at: iso(), activeBulk: activeBulk, peakActiveBulk: peakActiveBulk };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) entry[k] = extra[k];
      }
    }
    logs.push(entry);
    console.log('[AMP-PROBE]', event, entry);
    return entry;
  }

  function isBulkUrl(url) {
    return (
      url.indexOf('/state/bulk-chunked') !== -1 ||
      url.indexOf('/state/bulk') !== -1 ||
      url.indexOf('/state/changes') !== -1
    );
  }

  function parsePath(url) {
    try {
      return new URL(url).pathname.replace(/^\/api\/v1/, '') + (new URL(url).search || '');
    } catch (e) {
      return String(url);
    }
  }

  var origFetch = window.fetch;
  window.fetch = function () {
    var url = String(arguments[0] || '');
    var isBulk = isBulkUrl(url);
    var start = performance.now();
    var bulkId = isBulk ? 'bulk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) : null;

    if (isBulk) {
      activeBulk += 1;
      peakActiveBulk = Math.max(peakActiveBulk, activeBulk);
      log('bulk_start', {
        bulkId: bulkId,
        path: parsePath(url),
        navId: currentNav ? currentNav.id : null,
        stackHint: 'see Performance tab initiator',
      });
    }

    return origFetch.apply(this, arguments).then(function (res) {
      var durationMs = Math.round(performance.now() - start);
      if (isBulk) {
        activeBulk = Math.max(0, activeBulk - 1);
        var retryAfter = res.headers.get('Retry-After');
        log('bulk_end', {
          bulkId: bulkId,
          path: parsePath(url),
          status: res.status,
          durationMs: durationMs,
          retryAfter: retryAfter,
          navId: currentNav ? currentNav.id : null,
        });
        if (res.status === 503) {
          log('bulk_503', {
            bulkId: bulkId,
            path: parsePath(url),
            retryAfter: retryAfter,
            code: 'POOL_SATURATED suspected',
          });
        }
      }
      return res;
    });
  };

  function findOverlay() {
    var alerts = document.querySelectorAll('[role="alert"][aria-busy="true"]');
    for (var i = 0; i < alerts.length; i++) {
      if (alerts[i].textContent && alerts[i].textContent.indexOf('Loading data') !== -1) return alerts[i];
    }
    return null;
  }

  var overlayVisible = false;
  var overlayShownAt = 0;
  var observer = new MutationObserver(function () {
    var o = findOverlay();
    if (o && !overlayVisible) {
      overlayVisible = true;
      overlayShownAt = performance.now();
      log('overlay_show', { navId: currentNav ? currentNav.id : null });
    }
    if (!o && overlayVisible) {
      overlayVisible = false;
      log('overlay_hide', { durationMs: Math.round(performance.now() - overlayShownAt) });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });

  document.addEventListener(
    'click',
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest('aside button, aside a');
      if (!btn) return;
      currentNav = { id: 'nav-' + Date.now(), label: (btn.textContent || '').trim().slice(0, 60) };
      log('nav_click', currentNav);
    },
    true
  );

  window.__PBOOKS_BOOTSTRAP_AMP_PROBE__ = true;
  window.__PBOOKS_EXPORT_BOOTSTRAP_AMP_PROBE__ = function () {
    return {
      program: 'bootstrap-amplification-probe',
      capturedAt: iso(),
      peakActiveBulk: peakActiveBulk,
      totalEvents: logs.length,
      bulk503Count: logs.filter(function (l) {
        return l.event === 'bulk_503';
      }).length,
      timeline: logs,
    };
  };

  log('probe_installed', { ok: true });
  console.log('[AMP-PROBE] Export: copy(JSON.stringify(__PBOOKS_EXPORT_BOOTSTRAP_AMP_PROBE__(), null, 2))');
})();
