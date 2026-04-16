import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  createRentalAgreement,
  getRentalAgreementById,
  listRentalAgreements,
  repairMissingContactIdsFromPreviousAgreement,
  rowToRentalAgreementApi,
  softDeleteRentalAgreement,
  syncReconcileRentalAgreementsForTenant,
  updateRentalAgreement,
} from '../services/rentalAgreementsService.js';
import { listInvoices, rowToInvoiceApi } from '../services/invoicesService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const rentalAgreementsRouter = Router();

rentalAgreementsRouter.get('/rental-agreements', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listRentalAgreements(client, tenantId, { status, propertyId });
      sendSuccess(res, rows.map((r) => rowToRentalAgreementApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

/** Must be registered before `/rental-agreements/:id` so `repair-...` is not parsed as an id. */
rentalAgreementsRouter.post(
  '/rental-agreements/repair-missing-contact-from-previous',
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const result = await withTransaction(async (client) => {
        const { updated, ids } = await repairMissingContactIdsFromPreviousAgreement(client, tenantId);
        await syncReconcileRentalAgreementsForTenant(client, tenantId);
        const agreements: Record<string, unknown>[] = [];
        for (const id of ids) {
          const row = await getRentalAgreementById(client, tenantId, id);
          if (row) agreements.push(rowToRentalAgreementApi(row));
        }
        return { updated, agreements };
      });
      sendSuccess(res, result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendFailure(res, 400, 'VALIDATION_ERROR', msg);
    }
  }
);

/** Sub-resource: invoices linked to agreement (rental / service charge / deposit lines with this agreement_id) */
rentalAgreementsRouter.get('/rental-agreements/:id/invoices', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getRentalAgreementById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Agreement not found');
        return;
      }
      const invRows = await listInvoices(client, tenantId, { agreementId: id });
      sendSuccess(res, invRows.map((r) => rowToInvoiceApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

rentalAgreementsRouter.get('/rental-agreements/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getRentalAgreementById(client, tenantId, id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Agreement not found');
        return;
      }
      sendSuccess(res, rowToRentalAgreementApi(row));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

rentalAgreementsRouter.post('/rental-agreements', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction(async (client) => {
      const created = await createRentalAgreement(client, tenantId, req.body as Record<string, unknown>);
      await syncReconcileRentalAgreementsForTenant(client, tenantId);
      return (await getRentalAgreementById(client, tenantId, created.id)) ?? created;
    });
    const apiRow = rowToRentalAgreementApi(row);
    emitEntityEvent(tenantId, 'created', 'rental_agreement', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

rentalAgreementsRouter.put('/rental-agreements/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  try {
    const result = await withTransaction(async (client) => {
      const u = await updateRentalAgreement(client, tenantId, id, req.body as Record<string, unknown>);
      if (u.conflict || !u.row) return u;
      await syncReconcileRentalAgreementsForTenant(client, tenantId);
      const refreshed = await getRentalAgreementById(client, tenantId, id);
      return { row: refreshed ?? u.row, conflict: false };
    });
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.row) {
      sendFailure(res, 404, 'NOT_FOUND', 'Agreement not found');
      return;
    }
    const apiRow = rowToRentalAgreementApi(result.row);
    emitEntityEvent(tenantId, 'updated', 'rental_agreement', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

rentalAgreementsRouter.delete('/rental-agreements/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { id } = req.params;
  const versionRaw = req.query.version;
  const expectedVersion =
    typeof versionRaw === 'string' && versionRaw !== '' ? Number(versionRaw) : undefined;

  try {
    const result = await withTransaction(async (client) => {
      const del = await softDeleteRentalAgreement(
        client,
        tenantId,
        id,
        Number.isFinite(expectedVersion) ? expectedVersion : undefined
      );
      if (del.ok && !del.conflict) await syncReconcileRentalAgreementsForTenant(client, tenantId);
      return del;
    });
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');
      return;
    }
    if (!result.ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Agreement not found');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'rental_agreement', { id, sourceUserId: req.userId });
    sendSuccess(res, { id });
  } catch (e) {
    handleRouteError(res, e);
  }
});
