// Factory to create payment gateway instances based on configuration

import { BaseGateway } from './baseGateway.js';
import { PayFastGateway } from './payfastGateway.js';
import { PaymobGateway } from './paymobGateway.js';

export function createGateway(): BaseGateway {
  const gatewayType = (process.env.PAYMENT_GATEWAY || 'payfast').toLowerCase();
  const sandbox = process.env.PAYMENT_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';

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

    default:
      throw new Error(`Unsupported payment gateway: ${gatewayType}. Supported: payfast, paymob`);
  }
}

