/**
 * LAN discovery: parallel subnet scan, last-known-server probe, WebRTC local IP hint.
 */

import {
  DEFAULT_LAN_API_PORT,
  getApiBaseUrl,
  PBOOKS_API_BASE_STORAGE_KEY,
} from '../config/apiUrl';

export const PBOOKS_DISCOVER_PATH = '/api/discover';

export type DiscoverPayload = {
  name: string;
  version: string;
  ip: string;
  port: number;
  status: string;
};

const PBOOKS_NAME = 'PBooksPro Server';

export function isValidDiscoverPayload(j: unknown): j is DiscoverPayload {
  if (!j || typeof j !== 'object') return false;
  const o = j as Record<string, unknown>;
  return (
    o.name === PBOOKS_NAME &&
    typeof o.version === 'string' &&
    typeof o.ip === 'string' &&
    typeof o.port === 'number' &&
    o.status === 'online'
  );
}

export function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<Response> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' }).finally(() =>
    clearTimeout(t)
  );
}

export function rootUrlFromParts(host: string, port: number): string {
  return `http://${host}:${port}`;
}

export function discoverUrlForRoot(rootUrl: string): string {
  const r = rootUrl.replace(/\/+$/, '');
  return `${r}${PBOOKS_DISCOVER_PATH}`;
}

/** GET /api/discover on a server root (no /api suffix). */
export async function probeDiscover(
  host: string,
  port: number = DEFAULT_LAN_API_PORT,
  timeoutMs = 500
): Promise<DiscoverPayload | null> {
  const url = discoverUrlForRoot(rootUrlFromParts(host, port));
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) return null;
    const j: unknown = await res.json();
    return isValidDiscoverPayload(j) ? j : null;
  } catch {
    return null;
  }
}

/** Full URL probe e.g. http://192.168.1.10:3000 */
export async function probeDiscoverRoot(rootUrl: string, timeoutMs = 500): Promise<DiscoverPayload | null> {
  const url = discoverUrlForRoot(rootUrl.replace(/\/+$/, ''));
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) return null;
    const j: unknown = await res.json();
    return isValidDiscoverPayload(j) ? j : null;
  } catch {
    return null;
  }
}

export async function verifyServerReachable(
  apiBaseUrl: string,
  timeoutMs = 2500
): Promise<boolean> {
  const root = apiBaseUrl.replace(/\/api\/?$/i, '');
  const p = await probeDiscoverRoot(root, timeoutMs);
  return p !== null;
}

/** e.g. 192.168.1.25 → 192.168.1 */
export function ipv4ToSubnetBase(ip: string): string | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function getLocalIPv4ViaWebRTC(): Promise<string | null> {
  return new Promise((resolve) => {
    const RTCPC =
      typeof window !== 'undefined' &&
      (window.RTCPeerConnection || (window as unknown as { webkitRTCPeerConnection?: typeof RTCPeerConnection }).webkitRTCPeerConnection);
    if (!RTCPC) {
      resolve(null);
      return;
    }
    const pc = new RTCPC({ iceServers: [] });
    const seen = new Set<string>();
    pc.createDataChannel('');
    pc.onicecandidate = (e) => {
      if (!e.candidate?.candidate) return;
      const m = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(e.candidate.candidate);
      if (!m) return;
      const ip = m[1];
      if (ip.startsWith('127.') || ip === '0.0.0.0') return;
      if (seen.has(ip)) return;
      seen.add(ip);
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(ip)) {
        try {
          pc.close();
        } catch {
          /* ignore */
        }
        resolve(ip);
      }
    };
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => resolve(null));
    setTimeout(() => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve(null);
    }, 2200);
  });
}

function parseStoredRoot(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PBOOKS_API_BASE_STORAGE_KEY);
    if (!raw?.trim()) return null;
    return raw.replace(/\/api\/?$/i, '').trim();
  } catch {
    return null;
  }
}

/**
 * Try last successful server from localStorage, then optional first match in /24 scan.
 * @param stopAfterFirst - if true, cancel remaining work after first valid server (fast).
 */
export async function scanLanSubnet(
  subnetBase: string,
  options: {
    port?: number;
    timeoutMs?: number;
    parallel?: number;
    stopAfterFirst?: boolean;
    tryStoredFirst?: boolean;
    signal?: AbortSignal;
  } = {}
): Promise<DiscoverPayload[]> {
  const port = options.port ?? DEFAULT_LAN_API_PORT;
  const timeoutMs = options.timeoutMs ?? 500;
  const parallel = options.parallel ?? 20;
  const stopAfterFirst = options.stopAfterFirst ?? true;
  const tryStoredFirst = options.tryStoredFirst ?? true;
  const found: DiscoverPayload[] = [];
  const seenIp = new Set<string>();

  const pushIfNew = (p: DiscoverPayload | null) => {
    if (!p) return;
    const key = `${p.ip}:${p.port}`;
    if (seenIp.has(key)) return;
    seenIp.add(key);
    found.push(p);
  };

  if (tryStoredFirst) {
    const stored = parseStoredRoot();
    if (stored) {
      try {
        const u = new URL(stored.includes('://') ? stored : `http://${stored}`);
        const h = u.hostname;
        const p = u.port ? parseInt(u.port, 10) : port;
        const pr = await probeDiscover(h, p, Math.min(timeoutMs + 200, 800));
        pushIfNew(pr);
        if (stopAfterFirst && found.length > 0) return found;
      } catch {
        /* ignore */
      }
    }
  }

  const parts = subnetBase.split('.');
  if (parts.length !== 3) return found;

  const ips: string[] = [];
  for (let i = 1; i <= 255; i++) {
    ips.push(`${subnetBase}.${i}`);
  }

  for (let start = 0; start < ips.length && !options.signal?.aborted; start += parallel) {
    if (stopAfterFirst && found.length > 0) break;
    const slice = ips.slice(start, start + parallel);
    const batch = slice.map((host) =>
      probeDiscover(host, port, timeoutMs).then((r) => {
        if (r) pushIfNew(r);
        return r;
      })
    );
    await Promise.all(batch);
    if (stopAfterFirst && found.length > 0) break;
  }

  return found;
}

/** Parse user input such as `192.168.1.10` or `http://10.0.0.5:3000`. */
export function parseManualConnection(input: string): { host: string; port: number } | null {
  const s = input.trim();
  if (!s) return null;
  const withProto = s.includes('://') ? s : `http://${s}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname) return null;
    const port = u.port ? parseInt(u.port, 10) : DEFAULT_LAN_API_PORT;
    return { host: u.hostname, port };
  } catch {
    return null;
  }
}

/** Read current configured API base and return subnet for scanning (WebRTC or override). */
export async function resolveSubnetBaseForScan(manualSubnet?: string): Promise<string | null> {
  if (manualSubnet?.trim()) {
    const t = manualSubnet.trim();
    const p = t.split('.');
    if (p.length === 3) return t;
    if (p.length === 4) return ipv4ToSubnetBase(t);
    return null;
  }
  const local = await getLocalIPv4ViaWebRTC();
  if (local) return ipv4ToSubnetBase(local);
  const base = getApiBaseUrl().replace(/\/api\/?$/i, '');
  try {
    const u = new URL(base.includes('://') ? base : `http://${base}`);
    const h = u.hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return ipv4ToSubnetBase(h);
  } catch {
    /* ignore */
  }
  return '192.168.1';
}
