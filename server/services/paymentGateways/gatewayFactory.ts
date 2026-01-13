// Factory to create payment gateway instances based on configuration

import { BaseGateway } from './baseGateway.js';
import { PayFastGateway } from './payfastGateway.js';
import { PaymobGateway } from './paymobGateway.js';
import { PaddleGateway } from './paddleGateway.js';
import { MockGateway } from './mockGateway.js';

// Re-export BaseGateway for use in other modules
export { BaseGateway } from './baseGateway.js';

export function createGateway(): BaseGateway {
  const gatewayType = (process.env.PAYMENT_GATEWAY || 'mock').toLowerCase();
  const sandbox = process.env.PAYMENT_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';

  // Use mock gateway if explicitly set, or if no real gateway credentials are provided
  const useMock = gatewayType === 'mock' || 
                  (gatewayType !== 'mock' && 
                   !process.env.PAYFAST_MERCHANT_ID && 
                   !process.env.PAYMOB_API_KEY &&
                   !process.env.PADDLE_API_KEY &&
                   process.env.NODE_ENV !== 'production');

  if (useMock || gatewayType === 'mock') {
    const autoCompleteDelay = parseInt(process.env.MOCK_PAYMENT_DELAY || '3000', 10);
    const successRate = parseFloat(process.env.MOCK_PAYMENT_SUCCESS_RATE || '1.0');
    
    console.log('💰 Using MOCK payment gateway for testing');
    console.log(`   Auto-complete delay: ${autoCompleteDelay}ms`);
    console.log(`   Success rate: ${(successRate * 100).toFixed(0)}%`);
    
    return new MockGateway(autoCompleteDelay, successRate);
  }

  switch (gatewayType) {
    case 'payfast':
      const payfastMerchantId = process.env.PAYFAST_MERCHANT_ID;
      const payfastMerchantKey = process.env.PAYFAST_MERCHANT_KEY;
      const payfastPassphrase = process.env.PAYFAST_PASSPHRASE || '';

      if (!payfastMerchantId || !payfastMerchantKey) {
        throw new Error('PayFast configuration missing: PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY are required');
      }

      return new PayFastGateway({
        merchantId: payfastMerchantId,
        merchantKey: payfastMerchantKey,
        passphrase: payfastPassphrase,
        sandbox,
      });

    case 'paymob':
      const paymobApiKey = process.env.PAYMOB_API_KEY;
      const paymobIntegrationId = process.env.PAYMOB_INTEGRATION_ID;

      if (!paymobApiKey || !paymobIntegrationId) {
        throw new Error('Paymob configuration missing: PAYMOB_API_KEY and PAYMOB_INTEGRATION_ID are required');
      }

      return new PaymobGateway({
        apiKey: paymobApiKey,
        integrationId: paymobIntegrationId,
        sandbox,
      });

    case 'paddle':
      const paddleVendorId = process.env.PADDLE_VENDOR_ID;
      const paddleApiKey = process.env.PADDLE_API_KEY;
      const paddlePublicKey = process.env.PADDLE_PUBLIC_KEY;
      const paddleWebhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

      if (!paddleVendorId || !paddleApiKey || !paddlePublicKey || !paddleWebhookSecret) {
        throw new Error('Paddle configuration missing: PADDLE_VENDOR_ID, PADDLE_API_KEY, PADDLE_PUBLIC_KEY, and PADDLE_WEBHOOK_SECRET are required');
      }

      // Use PADDLE_ENVIRONMENT or fallback to NODE_ENV
      const paddleSandbox = process.env.PADDLE_ENVIRONMENT === 'sandbox' || 
                           (process.env.PADDLE_ENVIRONMENT !== 'live' && sandbox);

      return new PaddleGateway({
        vendorId: paddleVendorId,
        apiKey: paddleApiKey,
        publicKey: paddlePublicKey,
        webhookSecret: paddleWebhookSecret,
        sandbox: paddleSandbox,
      });

    default:
      throw new Error(`Unsupported payment gateway: ${gatewayType}. Supported: payfast, paymob, paddle`);
  }
}

