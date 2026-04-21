import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool } from '../db/pool.js';
import {
  listAllOwnerBalancesForTenant,
  listOwnerBalancesForOwner,
} from '../services/ownerRentalSummaryService.js';
import { memoryCacheGet, memoryCacheSet } from '../utils/memoryCache.js';

export const rentalOwnerSummariesRouter = Router();

const TTL_MS = 300_000;

/** Cached owner/property balances derived from transactions (see owner_balances). */
rentalOwnerSummariesRouter.get('/rental/owner-balances', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : '';
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId.trim() : '';
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
  const listLimit = Number.isFinite(limitRaw) ? limitRaw : undefined;

  const cacheKey = ownerId
    ? `rental_balances:${tenantId}:${ownerId}:${propertyId || 'all'}`
    : `rental_balances:${tenantId}:__all__:${propertyId || 'all'}:${listLimit ?? 'default'}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = ownerId
        ? await listOwnerBalancesForOwner(client, tenantId, ownerId, propertyId || null)
        : await listAllOwnerBalancesForTenant(client, tenantId, {
            propertyId: propertyId || null,
            limit: listLimit,
          });
      const payload = rows.map((r) => ({
        ownerId: r.owner_id,
        propertyId: r.property_id,
        balance: Number(r.balance),
        lastUpdated:
          r.last_updated instanceof Date ? r.last_updated.toISOString() : String(r.last_updated),
      }));
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

rentalOwnerSummariesRouter.get('/rental/monthly-owner-summary', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : '';
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId.trim() : '';
  const startMonth = typeof req.query.startMonth === 'string' ? req.query.startMonth.trim() : '';
  const endMonth = typeof req.query.endMonth === 'string' ? req.query.endMonth.trim() : '';

  const cacheKey = `rental_monthly:${tenantId}:${ownerId || 'all'}:${propertyId || 'all'}:${startMonth}:${endMonth}`;
  const cached = memoryCacheGet<unknown>(cacheKey);
  if (cached) {
    sendSuccess(res, cached);
    return;
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const params: unknown[] = [tenantId];
      let where = 'WHERE tenant_id = $1';
      if (ownerId) {
        params.push(ownerId);
        where += ` AND owner_id = $${params.length}`;
      }
      if (propertyId) {
        params.push(propertyId);
        where += ` AND property_id = $${params.length}`;
      }
      if (startMonth) {
        params.push(startMonth);
        where += ` AND month >= $${params.length}::date`;
      }
      if (endMonth) {
        params.push(endMonth);
        where += ` AND month <= $${params.length}::date`;
      }
      const lim = Math.min(
        Math.max(parseInt(String(req.query.limit ?? ''), 10) || 120, 1),
        500
      );
      params.push(lim);
      const r = await client.query<{
        owner_id: string;
        property_id: string;
        month: string;
        total_rent: string;
        total_expense: string;
        net_amount: string;
      }>(
        `SELECT owner_id, property_id, month::text AS month,
                total_rent::text AS total_rent, total_expense::text AS total_expense, net_amount::text AS net_amount
         FROM monthly_owner_summary
         ${where}
         ORDER BY month DESC, property_id ASC
         LIMIT $${params.length}`,
        params
      );
      const payload = r.rows.map((row) => ({
        ownerId: row.owner_id,
        propertyId: row.property_id,
        month: row.month,
        totalRent: Number(row.total_rent),
        totalExpense: Number(row.total_expense),
        netAmount: Number(row.net_amount),
      }));
      memoryCacheSet(cacheKey, payload, TTL_MS);
      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
