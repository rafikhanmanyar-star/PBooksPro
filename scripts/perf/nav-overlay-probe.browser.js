/**
 * PBooks Pro — Navigation "Loading data" overlay probe.
 *
 * Usage (production cloud, logged in):
 *   1. Open https://app.pbookspro.com
 *   2. F12 → Console → paste entire file contents → Enter
 *   3. Navigate between modules
 *   4. Run: copy(JSON.stringify(__PBOOKS_EXPORT_NAV_PROBE__(), null, 2))
 *
 * Remove: refresh the page.
 */
(function installNavOverlayProbe() {
  if (window.__PBOOKS_NAV_PROBE__) {
    console.warn('[NAV-PROBE] Already installed. Export: __PBOOKS_EXPORT_NAV_PROBE__()');
    return;
  }

  var logs = [];
  var overlayVisible = false;
  var overlayShownAt = 0;
  var navSeq = 0;
  var currentNav = null;

  function perfMs() {
    return Math.round(performance.now());
  }

  function iso() {
    return new Date().toISOString();
  }

  function log(event, extra) {
    var entry = { seq: ++navSeq, event: event, at: iso(), perfMs: perfMs() };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) entry[k] = extra[k];
      }
    }
    logs.push(entry);
    console.log('[NAV-PROBE] ' + event, entry);
    return entry;
  }

  function findOverlay() {
    var alerts = document.querySelectorAll('[role="alert"][aria-busy="true"]');
    for (var i = 0; i < alerts.length; i++) {
      var el = alerts[i];
      if (el.textContent && el.textContent.indexOf('Loading data') !== -1) return el;
    }
    return null;
  }

  function onOverlayShow() {
    if (overlayVisible) return;
    overlayVisible = true;
    overlayShownAt = performance.now();
    var titleEl = document.querySelector('[role="alert"] p.text-gray-500');
    log('overlay_show', {
      pageTitle: titleEl ? titleEl.textContent.trim() : null,
      navId: currentNav ? currentNav.id : null,
    });
  }

  function onOverlayHide() {
    if (!overlayVisible) return;
    var durationMs = Math.round(performance.now() - overlayShownAt);
    overlayVisible = false;
    log('overlay_hide', {
      durationMs: durationMs,
      navId: currentNav ? currentNav.id : null,
    });
    if (currentNav && !currentNav.overlayEndedAt) {
      currentNav.overlayEndedAt = iso();
      currentNav.overlayDurationMs = durationMs;
    }
  }

  var observer = new MutationObserver(function () {
    var overlay = findOverlay();
    if (overlay && !overlayVisible) onOverlayShow();
    if (!overlay && overlayVisible) onOverlayHide();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-busy'],
  });

  if (findOverlay()) onOverlayShow();

  var origFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url = String(args[0] || '');
    var isApi = url.indexOf('api.pbookspro.com') !== -1;
    return origFetch.apply(this, args).then(function (res) {
      if (isApi && !res.ok) {
        log('api_error', {
          url: url.split('?')[0],
          status: res.status,
          navId: currentNav ? currentNav.id : null,
        });
      }
      return res;
    });
  };

  function readVisiblePageGroup() {
    try {
      var main = document.querySelector('main#main-container');
      if (!main) return null;
      var pages = main.querySelectorAll('[id^="page-"]');
      for (var i = 0; i < pages.length; i++) {
        var el = pages[i];
        if (el.classList.contains('opacity-100') && el.classList.contains('pointer-events-auto')) {
          return el.id.replace(/^page-/, '');
        }
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  document.addEventListener(
    'click',
    function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      var btn = target.closest('button, a');
      if (!btn) return;
      var sidebar = btn.closest('aside');
      var footerNav = btn.closest('[class*="md:hidden"]');
      if (!sidebar && !footerNav) return;

      var label = (btn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      currentNav = {
        id: 'nav-' + Date.now(),
        clickedLabel: label,
        fromPage: readVisiblePageGroup(),
        startedAt: iso(),
        overlayEndedAt: null,
        overlayDurationMs: null,
      };
      log('nav_click', currentNav);

      setTimeout(function () {
        if (!currentNav) return;
        currentNav.toPage = readVisiblePageGroup();
        log('nav_settled', {
          navId: currentNav.id,
          toPage: currentNav.toPage,
          clickedLabel: currentNav.clickedLabel,
        });
      }, 2500);
    },
    true
  );

  try {
    localStorage.setItem('NAV_PERF_LOG', '1');
  } catch (e) {
    /* ignore */
  }

  window.__PBOOKS_NAV_PROBE__ = true;
  window.__PBOOKS_EXPORT_NAV_PROBE__ = function () {
    var hides = logs.filter(function (l) {
      return l.event === 'overlay_hide';
    });
    var summary = {
      program: 'nav-overlay-probe',
      capturedAt: iso(),
      totalEvents: logs.length,
      overlayDurationsMs: hides.map(function (l) {
        return { durationMs: l.durationMs, navId: l.navId };
      }),
      apiErrors: logs.filter(function (l) {
        return l.event === 'api_error';
      }),
      allLogs: logs,
    };
    console.table(summary.overlayDurationsMs);
    console.log('[NAV-PROBE] export', summary);
    return summary;
  };

  window.__PBOOKS_CLEAR_NAV_PROBE__ = function () {
    logs.length = 0;
    navSeq = 0;
    console.log('[NAV-PROBE] cleared');
  };

  console.log('[NAV-PROBE] Installed OK. Navigate, then:');
  console.log('  copy(JSON.stringify(__PBOOKS_EXPORT_NAV_PROBE__(), null, 2))');
  log('probe_installed', { ok: true });
})();
