/**

 * Paddle webhook → subscription state updates (legacy exports).

 */



import type pg from 'pg';

import { getBillingPlanByCode } from './billingPlanService.js';

import { activatePaidSubscription } from './subscriptionService.js';



/** Mock payment confirmation (dev / mock gateway). */

export async function confirmMockPayment(

  client: pg.PoolClient,

  input: {

    tenantId: string;

    transactionId: string;

    planCode: string;

    billingCycle: 'monthly' | 'annual';

    amount: number;

    currency?: string;

  }

): Promise<void> {

  const plan = await getBillingPlanByCode(client, input.planCode);

  if (!plan) throw new Error('Plan not found.');



  await activatePaidSubscription(client, {

    tenantId: input.tenantId,

    planId: plan.id,

    billingCycle: input.billingCycle,

    amount: input.amount,

    currency: input.currency ?? 'USD',

    paddleTransactionId: input.transactionId,

  });

}



export {

  processPaddleWebhookPayload,

  handlePaddleWebhookEvent,

  retryFailedWebhookDeliveries,

} from './paddleWebhookProcessor.js';


