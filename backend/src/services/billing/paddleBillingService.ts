/**

 * Paddle Billing API integration (checkout + webhook helpers).

 * Thin DB-aware wrapper around paddleService.

 */



import type pg from 'pg';

import { getBillingPlanByCode } from './billingPlanService.js';

import { getBillingCustomerByTenant } from './paddleCustomerService.js';

import {

  createPaddleCheckout as createCheckoutCore,

  isPaddleConfigured,

  mapLicenseTypeToBillingCycle,

  mapLicenseTypeToPlanCode,

  parsePaddleWebhook,

  resolvePlanPrice,

  verifyPaddleWebhookSignature,

  type PaddleCheckoutResult,

  type PaddleWebhookEvent,

} from './paddleService.js';



export {

  isPaddleConfigured,

  mapLicenseTypeToBillingCycle,

  mapLicenseTypeToPlanCode,

  parsePaddleWebhook,

  resolvePlanPrice,

  verifyPaddleWebhookSignature,

  type PaddleCheckoutResult,

  type PaddleWebhookEvent,

};



export async function createPaddleCheckout(

  client: pg.PoolClient,

  input: {

    tenantId: string;

    planCode: string;

    billingCycle: 'monthly' | 'annual';

    customerEmail?: string;

    currency?: string;

  }

): Promise<PaddleCheckoutResult> {

  const plan = await getBillingPlanByCode(client, input.planCode);

  if (!plan) throw new Error(`Plan "${input.planCode}" not found.`);

  if (plan.plan_code === 'trial') throw new Error('Cannot checkout trial plan.');



  const customer = await getBillingCustomerByTenant(client, input.tenantId);



  return createCheckoutCore({

    tenantId: input.tenantId,

    plan,

    billingCycle: input.billingCycle,

    customerEmail: input.customerEmail ?? customer?.email,

    paddleCustomerId: customer?.paddle_customer_id,

    currency: input.currency,

  });

}


