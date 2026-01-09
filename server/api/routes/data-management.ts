import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { adminOnlyMiddleware } from '../../middleware/adminOnlyMiddleware.js';

const router = Router();
const getDb = () => getDatabaseService();

// Apply admin-only middleware to all data management routes
// Only organization admins (role='Admin') can perform these operations
router.use(adminOnlyMiddleware());

/**
 * DELETE /api/data-management/clear-transactions
 * Clear all transactions, bills, invoices, contracts, agreements, sales returns, payslips
 * Preserves: Accounts, contacts, categories, projects, buildings, properties, units, settings
 * Requires: Admin role
 */
router.delete('/clear-transactions', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.user?.userId || 'unknown';
    const username = req.user?.username || 'Unknown User';

    console.log(`🗑️ Admin ${username} (${userId}) is clearing all transactions for tenant ${tenantId}`);

    // Execute deletion in a transaction
    const result = await db.transaction(async (client) => {
      // Tables to clear (transaction-related data only)
      const tablesToClear = [
        'transactions',
        'invoices',
        'bills',
        'contracts',
        'rental_agreements',
        'project_agreements',
        'sales_returns',
        'payslips',
        'legacy_payslips',
        'quotations',
        'recurring_invoice_templates'
      ];

      let totalDeleted = 0;

      // Delete from each table
      for (const table of tablesToClear) {
        const deleteResult = await client.query(
          `DELETE FROM ${table} WHERE tenant_id = $1`,
          [tenantId]
        );
        const deletedCount = deleteResult.rowCount || 0;
        console.log(`   ✓ Deleted ${deletedCount} records from ${table}`);
        totalDeleted += deletedCount;
      }

      // Reset account balances to 0 (preserve accounts but reset balances)
      const accountsResult = await client.query(
        `UPDATE accounts SET balance = 0, updated_at = NOW() WHERE tenant_id = $1`,
        [tenantId]
      );
      console.log(`   ✓ Reset ${accountsResult.rowCount} account balances to 0`);

      // Log this action in transaction_log (if the table exists)
      try {
        await client.query(
          `INSERT INTO transaction_log (
            id, tenant_id, action_type, entity_type, entity_id, description,
            user_id, user_name, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, NULL, $4, $5, $6, NOW()
          )`,
          [
            tenantId,
            'CLEAR_ALL',
            'Transactions',
            `Admin cleared all transaction-related data. Total ${totalDeleted} records deleted.`,
            userId,
            username
          ]
        );
      } catch (logError) {
        console.warn('Failed to log transaction clear action:', logError);
        // Don't fail the operation if logging fails
      }

      return {
        success: true,
        recordsDeleted: totalDeleted,
        tablesCleared: tablesToClear.length,
        accountsReset: accountsResult.rowCount || 0
      };
    });

    console.log(`✅ Successfully cleared all transactions for tenant ${tenantId}`);
    console.log(`   Total records deleted: ${result.recordsDeleted}`);

    res.json({
      success: true,
      message: 'All transaction-related data has been cleared',
      details: result
    });

  } catch (error: any) {
    console.error('❌ Error clearing transactions:', error);
    res.status(500).json({
      error: 'Failed to clear transactions',
      message: error.message || 'Internal server error'
    });
  }
});

export default router;

