(function () {
  const ui = window.apiServerUI;
  const $ = (id) => document.getElementById(id);

  let pendingUpdate = null;

  function formatBytes(n) {
    if (n == null || n < 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function hideDownloadProgress() {
    const wrap = $('downloadProgressWrap');
    if (wrap) wrap.style.display = 'none';
  }

  function setupDownloadProgress() {
    if (!ui.onDownloadProgress) return;
    ui.onDownloadProgress((p) => {
      const wrap = $('downloadProgressWrap');
      const fill = $('downloadProgressFill');
      const track = $('downloadProgressTrack');
      const bytesEl = $('downloadProgressBytes');
      const label = $('downloadProgressLabel');
      if (!wrap || !fill || !track || !bytesEl) return;

      if (!p || p.phase === 'start') {
        wrap.style.display = 'block';
        fill.style.width = '0%';
        fill.style.animation = '';
        fill.style.marginLeft = '0';
        track.classList.remove('indeterminate');
        label.textContent = 'Downloading installer…';
        bytesEl.textContent = '';
        return;
      }
      if (p.phase === 'progress') {
        wrap.style.display = 'block';
        if (p.indeterminate) {
          track.classList.add('indeterminate');
          fill.style.width = '';
          fill.style.animation = '';
          bytesEl.textContent = formatBytes(p.received) + ' downloaded';
        } else {
          track.classList.remove('indeterminate');
          fill.style.animation = 'none';
          fill.style.marginLeft = '0';
          const pct = Math.min(100, typeof p.percent === 'number' ? p.percent : 0);
          fill.style.width = pct + '%';
          bytesEl.textContent =
            formatBytes(p.received) +
            ' / ' +
            formatBytes(p.total) +
            ' (' +
            pct.toFixed(1) +
            '%)';
        }
        return;
      }
      if (p.phase === 'done' || p.phase === 'error') {
        hideDownloadProgress();
        if (p.phase === 'error' && p.message) {
          const msg = $('updateMsg');
          if (msg) msg.textContent = 'Download failed: ' + p.message;
        }
      }
    });
  }

  function renderAddressList(st) {
    const list = $('addressList');
    if (!list) return;
    list.textContent = '';
    const port = st.port || 3000;
    const addrs =
      Array.isArray(st.addresses) && st.addresses.length
        ? st.addresses
        : [
            {
              kind: 'localhost',
              interfaceName: 'localhost',
              ip: '127.0.0.1',
              apiUrl: 'http://127.0.0.1:' + port + '/api',
              healthUrl: 'http://127.0.0.1:' + port + '/health',
            },
          ];
    for (const a of addrs) {
      const row = document.createElement('div');
      row.className = 'addr-line';
      const code = document.createElement('code');
      code.textContent = a.apiUrl || '';
      const tag = document.createElement('span');
      tag.className = 'addr-tag';
      tag.textContent =
        a.kind === 'localhost' ? 'localhost (this PC)' : String(a.interfaceName || 'network');
      row.appendChild(code);
      row.appendChild(tag);
      list.appendChild(row);
    }
  }

  function shortTenant(tid) {
    if (!tid) return '—';
    if (tid.length <= 16) return tid;
    return tid.slice(0, 14) + '…';
  }

  async function updateClientsPanel(port, running) {
    const panel = $('clientsPanel');
    const summary = $('clientsSummary');
    const list = $('clientsList');
    if (!panel || !summary || !list) return;
    if (!running) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/api/server/connected-clients', {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        summary.textContent = json.message || 'Could not load connection list.';
        list.textContent = '';
        const err = document.createElement('p');
        err.className = 'clients-err';
        err.textContent = 'Ensure the API is running and DATABASE_URL is set.';
        list.appendChild(err);
        return;
      }
      const data = json.data || { total: 0, connections: [] };
      summary.textContent =
        data.total === 0
          ? '0 connections — no Socket.IO clients yet.'
          : data.total + ' active connection' + (data.total === 1 ? '' : 's');
      list.textContent = '';
      if (!data.connections || data.connections.length === 0) {
        const p = document.createElement('p');
        p.className = 'clients-empty';
        p.textContent =
          'When users open the app (browser or Electron) and stay logged in, they appear here.';
        list.appendChild(p);
        return;
      }
      for (const c of data.connections) {
        const row = document.createElement('div');
        row.className = 'clients-row';
        const name = document.createElement('div');
        name.className = 'name';
        const display = c.userName || c.userId;
        const un = c.username ? ' · @' + c.username : '';
        name.textContent = display + un;
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent =
          'Tenant ' +
          shortTenant(c.tenantId) +
          (c.connectedAt ? ' · since ' + new Date(c.connectedAt).toLocaleString() : '');
        row.appendChild(name);
        row.appendChild(meta);
        list.appendChild(row);
      }
    } catch (e) {
      summary.textContent = 'Could not reach the API on this port.';
      list.textContent = '';
      const err = document.createElement('p');
      err.className = 'clients-err';
      err.textContent = e && e.message ? e.message : String(e);
      list.appendChild(err);
    }
  }

  async function refresh() {
    const st = await ui.getState();
    $('appVer').textContent = st.appVersion || '—';
    const running = st.running;
    $('statusBadge').textContent = running ? 'Running' : 'Stopped';
    $('statusBadge').className = 'badge ' + (running ? 'badge-ok' : 'badge-warn');
    $('listenUrl').textContent = st.listenUrl || '—';
    renderAddressList(st);
    $('btnStart').disabled = running;
    $('btnStop').disabled = !running;
    const port = st.port || 3000;
    const healthUrl = 'http://127.0.0.1:' + port + '/health';
    const hl = $('healthLink');
    hl.href = healthUrl;
    hl.textContent = healthUrl;
    $('logs').textContent = (await ui.getLogs()) || '';
    if (st.userEnvDir) {
      $('envPathHint').textContent =
        'Config folder (copy your repo backend/.env here as .env): ' + st.userEnvDir;
    }
    await updateClientsPanel(port, running);
  }

  $('btnStart').onclick = () => ui.startServer().then(refresh);
  $('btnStop').onclick = () => ui.stopServer().then(refresh);
  $('btnEnv').onclick = () => ui.openEnvFolder();
  $('btnCheckUp').onclick = async () => {
    $('updatePanel').style.display = 'block';
    $('updateMsg').textContent = 'Checking GitHub…';
    $('btnDl').style.display = 'none';
    const r = await ui.checkForUpdate();
    if (r.ok && r.upToDate) {
      $('updateMsg').textContent = 'You are on the latest API server release (' + r.currentVersion + ').';
      pendingUpdate = null;
    } else if (r.ok && r.latestVersion) {
      $('updateMsg').textContent =
        'New version ' + r.latestVersion + ' is available (you have ' + r.currentVersion + ').';
      pendingUpdate = true;
      $('btnDl').style.display = 'inline-block';
    } else {
      const msg = r.message || 'Unknown error';
      $('updateMsg').textContent = r.isReleasePending ? msg : 'Update check failed: ' + msg;
      pendingUpdate = null;
    }
  };
  $('btnDl').onclick = async () => {
    if (!pendingUpdate) return;
    $('btnDl').disabled = true;
    hideDownloadProgress();
    try {
      await ui.downloadAndInstall();
    } finally {
      $('btnDl').disabled = false;
    }
  };

  setupDownloadProgress();
  ui.onServerEvent(() => refresh());
  refresh();
  setInterval(refresh, 4000);
})();
