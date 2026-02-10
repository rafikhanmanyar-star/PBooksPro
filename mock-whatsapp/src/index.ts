/**
 * Mock WhatsApp (Meta Cloud API–compatible) server for testing.
 * Use this as the API base URL for the main app when testing WhatsApp without Meta.
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { getConfig, updateConfig } from './config.js';
import { metaApiRouter } from './meta-api.js';
import { mockApiRouter } from './mock-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiVersion = process.env.MOCK_WHATSAPP_API_VERSION || 'v21.0';
const port = parseInt(process.env.MOCK_WHATSAPP_PORT || '9999', 10);
const phoneNumberId = process.env.MOCK_WHATSAPP_PHONE_NUMBER_ID || 'MOCK_PHONE_NUMBER_ID';
const displayPhoneNumber = process.env.MOCK_WHATSAPP_DISPLAY_NUMBER || '+15550000000';
const verifyToken = process.env.MOCK_WHATSAPP_VERIFY_TOKEN || 'mock-verify-token';
const webhookUrl = process.env.MOCK_WHATSAPP_WEBHOOK_URL || '';

updateConfig({
  port,
  apiVersion,
  phoneNumberId,
  displayPhoneNumber,
  verifyToken,
  webhookUrl,
  acceptAnyToken: true,
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'mock-whatsapp', time: new Date().toISOString() });
});

app.get('/api', (_req, res) => {
  const cfg = getConfig();
  res.json({
    name: 'Mock WhatsApp API',
    description: 'Meta WhatsApp Cloud API–compatible mock for testing',
    metaApiBase: `http://localhost:${cfg.port}/${cfg.apiVersion}`,
    usage: {
      mainAppBaseUrl: `http://localhost:${cfg.port}/${cfg.apiVersion}`,
      phoneNumberId: cfg.phoneNumberId,
      verifyToken: cfg.verifyToken,
      config: 'GET/POST http://localhost:' + cfg.port + '/mock/config',
      simulateIncoming: 'POST http://localhost:' + cfg.port + '/mock/simulate/incoming',
      messages: 'GET http://localhost:' + cfg.port + '/mock/messages',
    },
  });
});

app.use(`/${apiVersion}`, metaApiRouter);
app.use('/mock', mockApiRouter);

/** Dedicated config page (no JS required) so "Config" link always works */
app.get('/config', (_req, res) => {
  const cfg = getConfig();
  const saved = _req.query.saved === '1';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mock WhatsApp – Config</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 1.25rem; }
    label { display: block; margin-top: 12px; font-size: 14px; color: #555; }
    input { width: 100%; padding: 10px; margin-top: 4px; font-size: 14px; box-sizing: border-box; }
    button { margin-top: 16px; padding: 10px 20px; background: #25d366; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
    button:hover { background: #1a9f4d; }
    a { color: #25d366; }
    .msg { margin-top: 12px; padding: 10px; background: #e8f5e9; border-radius: 8px; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Mock WhatsApp – Settings</h1>
  ${saved ? '<p class="msg">Settings saved. <a href="/">Back to chat</a></p>' : ''}
  <form method="post" action="/config">
    <label>Main app webhook URL</label>
    <input type="url" name="webhookUrl" value="${escapeHtml(cfg.webhookUrl || '')}" placeholder="http://localhost:3000/api/whatsapp/webhook" />
    <label>Phone number ID</label>
    <input type="text" name="phoneNumberId" value="${escapeHtml(cfg.phoneNumberId || '')}" placeholder="MOCK_PHONE_NUMBER_ID" />
    <label>Your number (display)</label>
    <input type="text" name="displayPhoneNumber" value="${escapeHtml(cfg.displayPhoneNumber || '')}" placeholder="+15550000000" />
    <label>Verify token</label>
    <input type="text" name="verifyToken" value="${escapeHtml(cfg.verifyToken || '')}" placeholder="mock-verify-token" />
    <button type="submit">Save</button>
  </form>
  <p style="margin-top: 24px;"><a href="/">&larr; Back to chat</a></p>
</body>
</html>`;
  res.type('html').send(html);
});
app.post('/config', (req, res) => {
  const body = req.body as Record<string, string>;
  updateConfig({
    webhookUrl: body.webhookUrl?.trim() || undefined,
    phoneNumberId: body.phoneNumberId?.trim() || undefined,
    displayPhoneNumber: body.displayPhoneNumber?.trim() || undefined,
    verifyToken: body.verifyToken?.trim() || undefined,
  });
  res.redirect(302, '/config?saved=1');
});

/** New chat page: form submits to /?open=PHONE so main page opens that chat (no JS required for the link) */
app.get('/new-chat', (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mock WhatsApp – New chat</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 400px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 1.25rem; }
    label { display: block; margin-top: 12px; font-size: 14px; color: #555; }
    input { width: 100%; padding: 10px; margin-top: 4px; font-size: 14px; box-sizing: border-box; }
    button { margin-top: 16px; padding: 10px 20px; background: #25d366; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
    button:hover { background: #1a9f4d; }
    a { color: #25d366; }
  </style>
</head>
<body>
  <h1>New chat</h1>
  <p>Enter a phone number (e.g. 15551234567). You will open a chat to simulate messages from this contact to the main app.</p>
  <form method="get" action="/">
    <label for="open">Phone number</label>
    <input type="text" id="open" name="open" placeholder="15551234567" required />
    <button type="submit">Start chat</button>
  </form>
  <p style="margin-top: 24px;"><a href="/">&larr; Back to chat</a></p>
</body>
</html>`;
  res.type('html').send(html);
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const cfg = getConfig();
app.listen(cfg.port, () => {
  console.log(`[Mock WhatsApp] Server running at http://localhost:${cfg.port}`);
  console.log(`[Mock WhatsApp] Web UI:            http://localhost:${cfg.port}/`);
  console.log(`[Mock WhatsApp] Meta-compatible API: http://localhost:${cfg.port}/${cfg.apiVersion}`);
  console.log(`[Mock WhatsApp] Config & simulate:  http://localhost:${cfg.port}/mock`);
  console.log(`[Mock WhatsApp] phoneNumberId: ${cfg.phoneNumberId}, verifyToken: ${cfg.verifyToken}`);
  if (cfg.webhookUrl) {
    console.log(`[Mock WhatsApp] Webhook URL: ${cfg.webhookUrl}`);
  } else {
    console.log('[Mock WhatsApp] Set webhookUrl (POST /mock/config or MOCK_WHATSAPP_WEBHOOK_URL) to receive simulated events in your app.');
  }
});
