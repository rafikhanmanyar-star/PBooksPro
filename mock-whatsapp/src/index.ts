/**
 * Mock WhatsApp (Meta Cloud API–compatible) server for testing.
 * Use this as the API base URL for the main app when testing WhatsApp without Meta.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getConfig, updateConfig } from './config.js';
import { metaApiRouter } from './meta-api.js';
import { mockApiRouter } from './mock-api.js';

const app = express();
app.use(cors());
app.use(express.json());

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

app.use(`/${apiVersion}`, metaApiRouter);
app.use('/mock', mockApiRouter);

app.get('/', (_req, res) => {
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

const cfg = getConfig();
app.listen(cfg.port, () => {
  console.log(`[Mock WhatsApp] Server running at http://localhost:${cfg.port}`);
  console.log(`[Mock WhatsApp] Meta-compatible API: http://localhost:${cfg.port}/${cfg.apiVersion}`);
  console.log(`[Mock WhatsApp] Config & simulate:  http://localhost:${cfg.port}/mock`);
  console.log(`[Mock WhatsApp] phoneNumberId: ${cfg.phoneNumberId}, verifyToken: ${cfg.verifyToken}`);
  if (cfg.webhookUrl) {
    console.log(`[Mock WhatsApp] Webhook URL: ${cfg.webhookUrl}`);
  } else {
    console.log('[Mock WhatsApp] Set webhookUrl (POST /mock/config or MOCK_WHATSAPP_WEBHOOK_URL) to receive simulated events in your app.');
  }
});
