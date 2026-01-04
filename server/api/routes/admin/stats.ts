import { Router } from 'express';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Get dashboard statistics
router.get('/dashboard', async (req: AdminRequest, res) => {
  try {
    console.log('📊 Dashboard stats requested by admin:', req.adminId);
    const db = getDb();
    
    // Execute all queries in parallel for better performance
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
      db.query('SELECT COUNT(*) as count FROM tenants').catch(err => {
        console.error('Error counting total tenants:', err);
        return [{ count: '0' }];
      }),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_status = 'active'").catch(err => {
        console.error('Error counting active tenants:', err);
        return [{ count: '0' }];
      }),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_status = 'expired'").catch(err => {
        console.error('Error counting expired tenants:', err);
        return [{ count: '0' }];
      }),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_type = 'trial'").catch(err => {
        console.error('Error counting trial tenants:', err);
        return [{ count: '0' }];
      }),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_type = 'monthly' AND license_status = 'active'").catch(err => {
        console.error('Error counting monthly licenses:', err);
        return [{ count: '0' }];
      }),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_type = 'yearly' AND license_status = 'active'").catch(err => {
        console.error('Error counting yearly licenses:', err);
        return [{ count: '0' }];
      }),
      db.query("SELECT COUNT(*) as count FROM tenants WHERE license_type = 'perpetual' AND license_status = 'active'").catch(err => {
        console.error('Error counting perpetual licenses:', err);
        return [{ count: '0' }];
      }),
      db.query('SELECT COUNT(*) as count FROM users').catch(err => {
        console.error('Error counting users:', err);
        return [{ count: '0' }];
      }),
      db.query('SELECT COUNT(*) as count FROM transactions').catch(err => {
        console.error('Error counting transactions:', err);
        return [{ count: '0' }];
      })
    ]);

    const stats = {
      tenants: {
        total: parseInt(totalTenants[0]?.count || '0', 10),
        active: parseInt(activeTenants[0]?.count || '0', 10),
        expired: parseInt(expiredTenants[0]?.count || '0', 10),
        trial: parseInt(trialTenants[0]?.count || '0', 10)
      },
      licenses: {
        monthly: parseInt(monthlyLicenses[0]?.count || '0', 10),
        yearly: parseInt(yearlyLicenses[0]?.count || '0', 10),
        perpetual: parseInt(perpetualLicenses[0]?.count || '0', 10)
      },
      usage: {
        totalUsers: parseInt(totalUsers[0]?.count || '0', 10),
        totalTransactions: parseInt(totalTransactions[0]?.count || '0', 10)
      }
    };

    console.log('✅ Dashboard stats generated:', stats);
    res.json(stats);
  } catch (error: any) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      message: error.message || 'Internal server error'
    });
  }
});

export default router;

