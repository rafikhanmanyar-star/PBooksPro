// @ts-nocheck
import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../../../db/pool.js';
import { AdminRequest } from '../../../adminPortal/middleware/adminAuthMiddleware.js';
import { ORGANIZATION_STATUSES } from '../../../constants/organizationStatus.js';
import {
  approveOrganization,
  activateOrganization,
  getOrganizationRequestDetail,
  listOrganizationRequests,
  rejectOrganization,
  suspendOrganization,
} from '../../../services/organization/organizationApprovalService.js';
import { AdminUserRepository } from '../repositories/AdminPortalRepository.js';
import { OrganizationRepository } from '../../organization/repositories/OrganizationRepository.js';

const router = Router();
const adminUserRepo = new AdminUserRepository();
const orgRepo = new OrganizationRepository();

const listQuerySchema = z.object({
  status: z.enum(ORGANIZATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const rejectBodySchema = z.object({
  reason: z.string().min(1).max(2000),
});

async function resolveAdminActor(adminId: string): Promise<{ id: string; email: string | null; name: string }> {
  const row = await adminUserRepo.getById(adminId);
  return { id: adminId, email: row?.email ?? null, name: row?.name ?? 'Platform Admin' };
}

router.get('/', async (req: AdminRequest, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await listOrganizationRequests(client, {
        status: parsed.data.status,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      res.json(result);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error listing organization requests:', error);
    res.status(500).json({ error: 'Failed to fetch organization requests' });
  }
});

router.get('/stats', async (_req: AdminRequest, res) => {
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const [pending, active, rejected, suspended] = await Promise.all([
        orgRepo.countTenantsByStatus(client, 'PENDING'),
        orgRepo.countTenantsByStatus(client, 'ACTIVE'),
        orgRepo.countTenantsByStatus(client, 'REJECTED'),
        orgRepo.countTenantsByStatus(client, 'SUSPENDED'),
      ]);
      res.json({ pending, active, rejected, suspended });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching organization request stats:', error);
    res.status(500).json({ error: 'Failed to fetch organization request stats' });
  }
});

router.get('/:id', async (req: AdminRequest, res) => {
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const detail = await getOrganizationRequestDetail(client, req.params.id);
      if (!detail) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      res.json(detail);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching organization request:', error);
    res.status(500).json({ error: 'Failed to fetch organization request' });
  }
});

router.post('/:id/approve', async (req: AdminRequest, res) => {
  try {
    const actor = await resolveAdminActor(req.adminId!);
    const detail = await withTransaction((client) =>
      approveOrganization(client, req.params.id, actor.id, actor.email)
    );
    res.json(detail);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Organization not found') {
      return res.status(404).json({ error: msg });
    }
    console.error('Error approving organization:', error);
    res.status(500).json({ error: 'Failed to approve organization' });
  }
});

router.post('/:id/reject', async (req: AdminRequest, res) => {
  const parsed = rejectBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }
  try {
    const actor = await resolveAdminActor(req.adminId!);
    const detail = await withTransaction((client) =>
      rejectOrganization(client, req.params.id, actor.id, parsed.data.reason, actor.email)
    );
    res.json(detail);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Organization not found') {
      return res.status(404).json({ error: msg });
    }
    if (msg === 'Rejection reason is required') {
      return res.status(400).json({ error: msg });
    }
    console.error('Error rejecting organization:', error);
    res.status(500).json({ error: 'Failed to reject organization' });
  }
});

router.post('/:id/suspend', async (req: AdminRequest, res) => {
  try {
    const actor = await resolveAdminActor(req.adminId!);
    const detail = await withTransaction((client) =>
      suspendOrganization(client, req.params.id, actor.id, actor.email)
    );
    res.json(detail);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Organization not found') {
      return res.status(404).json({ error: msg });
    }
    console.error('Error suspending organization:', error);
    res.status(500).json({ error: 'Failed to suspend organization' });
  }
});

router.post('/:id/activate', async (req: AdminRequest, res) => {
  try {
    const actor = await resolveAdminActor(req.adminId!);
    const detail = await withTransaction((client) =>
      activateOrganization(client, req.params.id, actor.id, actor.email)
    );
    res.json(detail);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Organization not found') {
      return res.status(404).json({ error: msg });
    }
    console.error('Error activating organization:', error);
    res.status(500).json({ error: 'Failed to activate organization' });
  }
});

export default router;
