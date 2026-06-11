/**
 * Cross-tenant subscription administration (super_admin).
 */

import type pg from 'pg';
import {
  AdminSubscriptionRepository,
  PaddleWebhookRepository,
  type AdminSubscriptionRow,
  type AdminWebhookDeliveryRow,
  type AdminSubscriptionStats,
} from '../../modules/billing/repositories/BillingSupportRepository.js';

export type { AdminSubscriptionRow, AdminWebhookDeliveryRow, AdminSubscriptionStats };

const adminRepo = new AdminSubscriptionRepository();
const webhookRepo = new PaddleWebhookRepository();

export async function listAdminSubscriptions(
  client: pg.PoolClient,
  options?: { limit?: number; status?: string }
): Promise<AdminSubscriptionRow[]> {
  return adminRepo.listSubscriptions(client, options);
}

export async function listAdminWebhookDeliveries(
  client: pg.PoolClient,
  options?: { limit?: number; status?: string }
): Promise<AdminWebhookDeliveryRow[]> {
  return webhookRepo.listDeliveries(client, options);
}

export async function getAdminSubscriptionStats(
  client: pg.PoolClient
): Promise<AdminSubscriptionStats> {
  return adminRepo.getStats(client);
}
