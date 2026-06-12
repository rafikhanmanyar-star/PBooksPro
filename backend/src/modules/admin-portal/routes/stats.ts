// @ts-nocheck
import { Router } from 'express';
import { AdminRequest } from '../../../adminPortal/middleware/adminAuthMiddleware.js';
import { AdminStatsRepository } from '../repositories/AdminTenantRepository.js';

const router = Router();
const statsRepo = new AdminStatsRepository();

router.get('/dashboard', async (req: AdminRequest, res) => {
  try {
    console.log('📊 Dashboard stats requested by admin:', req.adminId);
    const stats = await statsRepo.getDashboardStats();
    console.log('✅ Dashboard stats generated:', stats);
    res.json(stats);
  } catch (error: any) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error.message || 'Internal server error',
    });
  }
});

export default router;
