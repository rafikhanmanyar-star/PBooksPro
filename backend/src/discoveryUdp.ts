import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';

const BROADCAST_MS = 3000;

/** First non-internal IPv4 (for discovery payload when request is loopback). */
export function getLanIPv4(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Broadcast UDP beacon so LAN clients with a UDP listener can find the server instantly.
 * Payload: PBOOKS_SERVER:<ip>:<httpPort>
 * Default UDP port 40000 (override with PBOOKS_DISCOVERY_UDP_PORT).
 */
export function startDiscoveryUdpBroadcast(httpPort: number): void {
  const discoveryPort = Number(process.env.PBOOKS_DISCOVERY_UDP_PORT) || 40000;
  let sock: Socket;
  try {
    sock = createSocket('udp4');
  } catch (e) {
    console.warn('[discovery] UDP broadcast disabled:', e);
    return;
  }

  sock.on('error', (err) => {
    console.warn('[discovery] UDP socket error:', err.message);
  });

  sock.bind(0, () => {
    try {
      sock.setBroadcast(true);
    } catch {
      /* ignore */
    }
  });

  const tick = () => {
    const ip = getLanIPv4();
    const msg = Buffer.from(`PBOOKS_SERVER:${ip}:${httpPort}`, 'utf8');
    sock.send(msg, 0, msg.length, discoveryPort, '255.255.255.255', (err) => {
      if (err && process.env.NODE_ENV === 'development') {
        console.warn('[discovery] UDP send:', err.message);
      }
    });
  };

  tick();
  setInterval(tick, BROADCAST_MS);
  console.log(
    `[discovery] UDP beacon every ${BROADCAST_MS}ms → :${discoveryPort} (PBOOKS_SERVER:<ip>:${httpPort})`
  );
}
