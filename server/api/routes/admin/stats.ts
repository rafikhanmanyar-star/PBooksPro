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
      totalTransactions,
      renewalsDue30,
      renewalsDue7,
      paymentsTotals,
      paymentsLast30
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
      }),
      db.query(
        `SELECT COUNT(*) as count 
         FROM tenants 
         WHERE license_status = 'active' 
           AND license_expiry_date IS NOT NULL 
           AND license_expiry_date <= NOW() + INTERVAL '30 days'`
      ).catch(err => {
        console.error('Error counting renewals due in 30 days:', err);
        return [{ count: '0' }];
      }),
      db.query(
        `SELECT COUNT(*) as count 
         FROM tenants 
         WHERE license_status = 'active' 
           AND license_expiry_date IS NOT NULL 
           AND license_expiry_date <= NOW() + INTERVAL '7 days'`
      ).catch(err => {
        console.error('Error counting renewals due in 7 days:', err);
        return [{ count: '0' }];
      }),
      db.query(
        `SELECT currency, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
         FROM payments
         WHERE status = 'completed'
         GROUP BY currency`
      ).catch(err => {
        console.error('Error aggregating payment totals:', err);
        return [];
      }),
      db.query(
        `SELECT currency, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
         FROM payments
         WHERE status = 'completed' AND paid_at >= NOW() - INTERVAL '30 days'
         GROUP BY currency`
      ).catch(err => {
        console.error('Error aggregating payment totals (30 days):', err);
        return [];
      })
    ]);

    const toCurrencyMap = (rows: any[]) =>
      rows.reduce((acc: Record<string, { count: number; total: number }>, row: any) => {
        const currency = row.currency || 'UNKNOWN';
        acc[currency] = {
          count: parseInt(row.count || '0', 10),
          total: parseFloat(row.total || '0')
        };
        return acc;
      }, {});

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
      licenseReport: {
        renewalsDueIn30Days: parseInt(renewalsDue30[0]?.count || '0', 10),
        renewalsDueIn7Days: parseInt(renewalsDue7[0]?.count || '0', 10),
        paymentsTotalByCurrency: toCurrencyMap(paymentsTotals),
        paymentsLast30DaysByCurrency: toCurrencyMap(paymentsLast30)
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

