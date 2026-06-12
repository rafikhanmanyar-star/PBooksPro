// @ts-nocheck
import { Router } from 'express';
import { AdminRequest } from '../../../adminPortal/middleware/adminAuthMiddleware.js';
import { withTransaction } from '../../../db/pool.js';
import { LicenseService } from '../../../adminPortal/licenseService.js';
import { syncManualLicenseToSubscription } from '../../../services/billing/subscriptionService.js';
import { AdminLicenseRepository } from '../repositories/AdminPortalRepository.js';

const router = Router();
const licenseRepo = new AdminLicenseRepository();

router.get('/', async (req: AdminRequest, res) => {
  try {
    const { status, licenseType, tenantId } = req.query;
    const licenses = await licenseRepo.listLicenseKeys({
      status: status as string | undefined,
      licenseType: licenseType as string | undefined,
      tenantId: tenantId as string | undefined,
    });
    res.json(licenses);
  } catch (error) {
    console.error('Error fetching licenses:', error);
    res.status(500).json({ error: 'Failed to fetch licenses' });
  }
});

router.get('/tenant/:tenantId/history', async (req: AdminRequest, res) => {
  try {
    const history = await licenseRepo.listLicenseHistory(req.params.tenantId);
    res.json(history);
  } catch (error) {
    console.error('Error fetching license history:', error);
    res.status(500).json({ error: 'Failed to fetch license history' });
  }
});

router.post('/:id/revoke', async (req: AdminRequest, res) => {
  try {
    await licenseRepo.revokeLicenseKey(req.params.id);
    res.json({ success: true, message: 'License revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke license' });
  }
});

router.post('/apply-manual', async (req: AdminRequest, res) => {
  try {
    const { tenantId, licenseType } = req.body;

    if (!tenantId || !['monthly', 'yearly'].includes(licenseType)) {
      return res.status(400).json({ error: 'Tenant ID and valid license type (monthly/yearly) are required' });
    }

    const licenseService = new LicenseService();

    if (!(await licenseRepo.tenantExists(tenantId))) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const now = new Date();
    let expiryDate = new Date(now);

    if (licenseType === 'monthly') {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }

    await withTransaction(async (pgClient) => {
      await licenseRepo.applyManualLicenseUpdate(pgClient, tenantId, licenseType, expiryDate, now);
      await syncManualLicenseToSubscription(pgClient, tenantId, licenseType, expiryDate);
    });

    const currentStatus = await licenseService.checkLicenseStatus(tenantId);

    const historyId = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await licenseRepo.insertManualLicenseHistory(
      historyId,
      tenantId,
      currentStatus.licenseStatus,
      currentStatus.licenseType,
      licenseType
    );

    res.json({ success: true, message: `Manual ${licenseType} license applied successfully`, expiryDate });
  } catch (error) {
    console.error('Error applying manual license:', error);
    res.status(500).json({ error: 'Failed to apply manual license' });
  }
});

export default router;
