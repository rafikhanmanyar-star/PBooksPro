/**
 * Mock WhatsApp configuration (in-memory, optionally persisted to config.json)
 */

export interface MockWhatsAppConfig {
  /** Port for the mock server */
  port: number;
  /** API version path (e.g. v21.0) to mimic Meta */
  apiVersion: string;
  /** Phone number ID used as "sender" - must match what main app config uses */
  phoneNumberId: string;
  /** Display phone number (e.g. +15551234567) for webhook payloads */
  displayPhoneNumber: string;
  /** Verify token for webhook verification (main app uses this when registering webhook) */
  verifyToken: string;
  /** Main app webhook URL - we POST incoming messages and status updates here */
  webhookUrl: string;
  /** Accept any Bearer token when set to true (for easier testing) */
  acceptAnyToken: boolean;
}

const defaultConfig: MockWhatsAppConfig = {
  port: 9999,
  apiVersion: 'v21.0',
  phoneNumberId: 'MOCK_PHONE_NUMBER_ID',
  displayPhoneNumber: '+15550000000',
  verifyToken: 'mock-verify-token',
  webhookUrl: '',
  acceptAnyToken: true,
};

let config: MockWhatsAppConfig = { ...defaultConfig };

export function getConfig(): MockWhatsAppConfig {
  return { ...config };
}

export function updateConfig(updates: Partial<MockWhatsAppConfig>): MockWhatsAppConfig {
  config = { ...config, ...updates };
  return getConfig();
}

export function setConfig(newConfig: MockWhatsAppConfig): void {
  config = { ...newConfig };
}

export function getDefaultConfig(): MockWhatsAppConfig {
  return { ...defaultConfig };
}
