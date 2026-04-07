/**
 * LAN: discover PBooks API server, manual IP fallback, persist via apiClient.setBaseUrl.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Server, Radio, Wifi, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../../services/api/client';
import {
  scanLanSubnet,
  resolveSubnetBaseForScan,
  probeDiscoverRoot,
  type DiscoverPayload,
  rootUrlFromParts,
  parseManualConnection,
} from '../../services/lanDiscovery';

type Props = {
  onConnected: () => void;
  variant?: 'initial' | 'lost';
};

const ConnectServerScreen: React.FC<Props> = ({ onConnected, variant = 'initial' }) => {
  const [scanning, setScanning] = useState(false);
  const [scanningFull, setScanningFull] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoverPayload[]>([]);
  const [subnetOverride, setSubnetOverride] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState('');

  const connectRoot = useCallback(
    (root: string) => {
      apiClient.setBaseUrl(root);
      onConnected();
    },
    [onConnected]
  );

  const handleConnectPayload = useCallback(
    async (p: DiscoverPayload) => {
      setError(null);
      const root = rootUrlFromParts(p.ip, p.port);
      const pr = await probeDiscoverRoot(root, 800);
      if (!pr) {
        setError('Server not reachable');
        return;
      }
      connectRoot(root);
    },
    [connectRoot]
  );

  const runQuickScan = useCallback(async () => {
    setError(null);
    setScanning(true);
    setDiscovered([]);
    setStatusLine('Detecting network…');
    try {
      const base = await resolveSubnetBaseForScan(subnetOverride.trim() || undefined);
      if (!base) {
        setError('Could not determine subnet. Enter a subnet like 192.168.1 (or 192.168.1.0) above.');
        return;
      }
      setStatusLine(`Scanning ${base}.x …`);
      const res = await scanLanSubnet(base, {
        stopAfterFirst: true,
        tryStoredFirst: true,
        timeoutMs: 500,
        parallel: 20,
      });
      setDiscovered(res);
      if (res.length === 0) {
        setError(
          'No PBooks server found. Try a full scan, manual IP, or confirm the PBooks API is running on this LAN.'
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
      setStatusLine('');
    }
  }, [subnetOverride]);

  const runFullScan = useCallback(async () => {
    setError(null);
    setScanningFull(true);
    setDiscovered([]);
    setStatusLine('Scanning entire subnet (may take a few seconds)…');
    try {
      const base = await resolveSubnetBaseForScan(subnetOverride.trim() || undefined);
      if (!base) {
        setError('Could not determine subnet. Enter e.g. 192.168.1 above.');
        return;
      }
      const res = await scanLanSubnet(base, {
        stopAfterFirst: false,
        tryStoredFirst: true,
        timeoutMs: 450,
        parallel: 20,
      });
      setDiscovered(res);
      if (res.length === 0) {
        setError('No PBooks server found on this subnet.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanningFull(false);
      setStatusLine('');
    }
  }, [subnetOverride]);

  const runQuickScanRef = useRef(runQuickScan);
  runQuickScanRef.current = runQuickScan;

  /** One-time quick scan when this screen opens (last-known IP is tried first inside scanLanSubnet). */
  useEffect(() => {
    const t = window.setTimeout(() => {
      void runQuickScanRef.current();
    }, 200);
    return () => clearTimeout(t);
  }, []);

  const manualConnect = async () => {
    setError(null);
    const parsed = parseManualConnection(manualIp);
    if (!parsed) {
      setError('Enter a valid IP or hostname (optional :port, default 3000).');
      return;
    }
    const root = rootUrlFromParts(parsed.host, parsed.port);
    const pr = await probeDiscoverRoot(root, 8000);
    if (!pr) {
      setError('Server not reachable');
      return;
    }
    connectRoot(root);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600 text-white mb-4 shadow-lg">
            <Wifi className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Connect to Server</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {variant === 'lost'
              ? 'The connection to your PBooks server was lost. Choose the server again or enter its address.'
              : 'Find the PBooks API on your network, or connect manually.'}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {(scanning || scanningFull) && statusLine && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin text-green-600" />
              {statusLine}
            </div>
          )}

          <div>
            <label htmlFor="subnet-override" className="block text-sm font-medium text-gray-700 mb-1">
              Subnet for scan <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="subnet-override"
              type="text"
              value={subnetOverride}
              onChange={(e) => setSubnetOverride(e.target.value)}
              placeholder="e.g. 192.168.1 or 10.0.0"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900 font-mono text-sm"
              disabled={scanning || scanningFull}
            />
            <p className="text-xs text-gray-500 mt-1">
              If auto-detection fails, set the first three octets of your LAN (same as your PC).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runQuickScan()}
              disabled={scanning || scanningFull}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              Quick scan
            </button>
            <button
              type="button"
              onClick={() => void runFullScan()}
              disabled={scanning || scanningFull}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-800 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              {scanningFull ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              Scan entire subnet
            </button>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-gray-500" aria-hidden />
              Auto-discovered servers
            </p>
            {discovered.length === 0 && !scanning && !scanningFull && (
              <p className="text-xs text-gray-500">None yet — run a scan or use manual connection.</p>
            )}
            <ul className="space-y-2">
              {discovered.map((d) => (
                <li
                  key={`${d.ip}:${d.port}`}
                  className="flex items-center justify-between gap-2 p-3 rounded-lg border border-gray-100 bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{d.name}</p>
                    <p className="text-xs text-gray-600 font-mono">
                      {d.ip}:{d.port} · v{d.version}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleConnectPayload(d)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
                  >
                    Connect
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-gray-500" aria-hidden />
              Manual connection
            </p>
            <input
              type="text"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              placeholder="e.g. 192.168.1.10 or 192.168.1.10:3000"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900 font-mono text-sm"
              disabled={scanning || scanningFull}
            />
            <button
              type="button"
              onClick={() => void manualConnect()}
              disabled={scanning || scanningFull}
              className="mt-2 w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectServerScreen;
