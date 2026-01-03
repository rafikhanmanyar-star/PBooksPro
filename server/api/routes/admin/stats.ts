import { Router } from 'express';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Get dashboard statistics
router.get('/dashboard', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const [
      totalTenants,
      activeTenants,
      expiredTenants,
      trialTenants,
      monthlyLicenses,
      yearlyLicenses,
      perpetualLicenses,
      totalUsers,
      totalTransactions
    ] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM tenants'),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_status = 'active'"),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_status = 'expired'"),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_type = 'trial'"),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_type = 'monthly' AND license_status = 'active'"),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_type = 'yearly' AND license_status = 'active'"),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_type = 'perpetual' AND license_status = 'active'"),
      db.query('SELECT COUNT(*) as count FROM users'),
      db.query('SELECT COUNT(*) as count FROM transactions')
    ]);

    res.json({
      tenants: {
        total: parseInt(totalTenants[0].count),
        active: parseInt(activeTenants[0].count),
        expired: parseInt(expiredTenants[0].count),
        trial: parseInt(trialTenants[0].count)
      },
      licenses: {
        monthly: parseInt(monthlyLicenses[0].count),
        yearly: parseInt(yearlyLicenses[0].count),
        perpetual: parseInt(perpetualLicenses[0].count)
      },
      usage: {
        totalUsers: parseInt(totalUsers[0].count),
        totalTransactions: parseInt(totalTransactions[0].count)
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;

