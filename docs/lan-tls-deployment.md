# LAN deployment with TLS termination

PBooksPro’s Node backend listens on **plain HTTP** (default port `3000`). For production LAN installs, terminate TLS at a reverse proxy and expose HTTPS to browsers and Electron clients.

## Architecture

```
[Browser / Electron] --HTTPS--> [nginx or Caddy :443]
                                      |
                                      +-- HTTP --> [PBooksPro backend :3000]
                                      +-- WS   --> [Socket.IO /socket.io]
```

The backend uses **JWT in the `Authorization` header** (not cookies), so CORS `origin: '*'` is acceptable behind TLS when combined with network isolation and strong auth.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_API_URL` | Frontend build / `.env` | Public HTTPS base, e.g. `https://pbooks.lan.local` |
| `TRUST_PROXY=true` | Backend `.env` | Trust `X-Forwarded-*` from reverse proxy (rate limits, discovery IP) |
| `DISCOVERY_TOKEN` | Backend `.env` | Optional token for `/api/discover` |
| `PORT` | Backend | Internal HTTP port (default `3000`) |

Rebuild or restart the frontend after changing `VITE_API_URL`.

## Caddy (recommended for small LAN)

Caddy obtains certificates automatically when using a public DNS name. For **internal-only** hostnames, use Caddy’s internal CA or provide your own cert files.

```caddyfile
pbooks.lan.local {
    tls internal

    reverse_proxy /socket.io/* localhost:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    reverse_proxy localhost:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Set backend `.env`:

```env
TRUST_PROXY=true
PORT=3000
```

## nginx

```nginx
upstream pbooks_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name pbooks.lan.local;

    ssl_certificate     /etc/ssl/pbooks/fullchain.pem;
    ssl_certificate_key /etc/ssl/pbooks/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /socket.io/ {
        proxy_pass http://pbooks_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://pbooks_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Certificate options

| Scenario | Approach |
|----------|----------|
| Public hostname on LAN | Let’s Encrypt (DNS-01 if HTTP-01 is blocked) |
| Windows AD domain | Enterprise CA or internal PKI; distribute root to clients |
| Single-site, no PKI | Caddy `tls internal` or self-signed + manual trust |
| Electron desktop | Ship custom CA or use cert pinning in update channel docs |

## Client configuration

1. Point `VITE_API_URL` at `https://your-host` (no trailing slash).
2. Ensure LAN DNS or hosts file resolves the name used in the certificate.
3. Discovery UDP still advertises HTTP IP/port; clients configured with HTTPS URL bypass discovery for API calls.

Health check (through proxy):

```bash
curl -k https://pbooks.lan.local/health
```

## Security checklist

- [ ] TLS 1.2+ only; disable weak ciphers at the proxy
- [ ] Backend bound to `127.0.0.1` or firewalled; only proxy exposed on LAN
- [ ] Strong admin passwords; rotate JWT secret (`JWT_SECRET`) per deployment
- [ ] Set `DISCOVERY_TOKEN` if discovery endpoint is reachable from untrusted VLANs
- [ ] Regular OS and dependency updates on the host running the proxy

## Backend behavior behind a proxy

When `TRUST_PROXY=true`, Express trusts the first proxy hop and applies baseline security headers. The Node process still serves HTTP locally; **do not** expose port 3000 directly to clients if TLS is required.

See `backend/src/middleware/trustProxyAndSecurity.ts` and `backend/src/index.ts`.
