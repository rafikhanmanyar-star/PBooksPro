import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all accounts
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();

    // Ensure system accounts exist before fetching
    try {
      const { TenantInitializationService } = await import('../../services/tenantInitializationService.js');
      const initService = new TenantInitializationService(db);
      await initService.ensureSystemAccounts(req.tenantId!);
    } catch (initError) {
      // Log but don't fail - accounts will still be returned
      console.warn('Warning: Failed to ensure system accounts:', initError);
    }

    const { limit, offset } = req.query;
    const effectiveLimit = Math.min(parseInt(limit as string) || 10000, 10000);
    let accountQuery = 'SELECT * FROM accounts WHERE (tenant_id = $1 OR tenant_id IS NULL) AND deleted_at IS NULL ORDER BY name LIMIT $2';
    const accountParams: any[] = [req.tenantId, effectiveLimit];
    if (offset) {
      accountQuery += ' OFFSET $3';
      accountParams.push(parseInt(offset as string) || 0);
    }
    const accounts = await db.query(accountQuery, accountParams);

    // Transform snake_case column names to camelCase and ensure balance is a number
    const transformedAccounts = accounts.map((account: any) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: parseFloat(account.balance) || 0,
      isPermanent: account.is_permanent || false,
      description: account.description || null,
      parentAccountId: account.parent_account_id || null,
      createdAt: account.created_at,
      updatedAt: account.updated_at
    }));

    res.json(transformedAccounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// POST create/update account (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    console.log('📥 POST /accounts - Request received:', {
      tenantId: req.tenantId,
      accountData: {
        id: req.body.id,
        name: req.body.name,
        type: req.body.type
      }
    });

    const db = getDb();
    const account = req.body;

    // Generate ID if not provided
    const accountId = account.id || `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /accounts - Using account ID:', accountId);

    // Track if this is an update operation
    let isUpdate = false;

    // Use transaction for data integrity (upsert behavior)
    const result = await db.transaction(async (client) => {
      // Check if account with this ID already exists
      const existing = await client.query(
        'SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2',
        [accountId, req.tenantId]
      );

      if (existing.rows.length > 0) {
        // If the account was soft-deleted, don't resurrect it via sync/upsert.
        // Return success so the sync client marks the operation as completed.
        if (existing.rows[0].deleted_at) {
          console.log('⏭️ POST /accounts - Account is soft-deleted, skipping upsert:', accountId);
          return { ...existing.rows[0], _softDeleted: true };
        }

        // Update existing account
        console.log('🔄 POST /accounts - Updating existing account:', accountId);
        isUpdate = true;
        // Optimistic locking check for POST update
        const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
        const serverVersion = existing.rows[0].version;
        if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
          throw {
            code: 'VERSION_CONFLICT',
            message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
            status: 409
          };
        }

        const updateResult = await client.query(
          `UPDATE accounts 
           SET name = $1, type = $2, balance = $3, description = $4, 
               parent_account_id = $5, user_id = $6, updated_at = NOW(),
               version = COALESCE(version, 1) + 1
           WHERE id = $7 AND tenant_id = $8 AND (version = $9 OR version IS NULL)
           RETURNING *`,
          [
            account.name,
            account.type,
            account.balance || 0,
            account.description || null,
            account.parentAccountId || null,
            req.user?.userId || null,
            accountId,
            req.tenantId,
            serverVersion
          ]
        );
        return updateResult.rows[0];
      } else {
        // Create new account
        console.log('➕ POST /accounts - Creating new account:', accountId);
        const insertResult = await client.query(
          `INSERT INTO accounts (
            id, tenant_id, name, type, balance, description, parent_account_id, user_id, 
            created_at, updated_at, version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), 1)
          RETURNING *`,
          [
            accountId,
            req.tenantId,
            account.name,
            account.type,
            account.balance || 0,
            account.description || null,
            account.parentAccountId || null,
            req.user?.userId || null
          ]
        );
        return insertResult.rows[0];
      }
    });

    if (!result) {
      console.error('❌ POST /accounts - Transaction returned no result');
      return res.status(500).json({ error: 'Failed to create/update account' });
    }

    // Transform snake_case to camelCase for response
    const transformedResult = {
      id: result.id,
      name: result.name,
      type: result.type,
      balance: parseFloat(result.balance) || 0,
      isPermanent: result.is_permanent || false,
      description: result.description || null,
      parentAccountId: result.parent_account_id || null,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };

    console.log('✅ POST /accounts - Account saved successfully:', {
      id: transformedResult.id,
      name: transformedResult.name,
      balance: transformedResult.balance,
      tenantId: req.tenantId
    });

    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.ACCOUNT_UPDATED : WS_EVENTS.ACCOUNT_CREATED, {
      account: transformedResult,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json(transformedResult);
  } catch (error: any) {
    console.error('❌ POST /accounts - Error:', {
      error: error,
      errorMessage: error.message,
      errorCode: error.code,
      tenantId: req.tenantId,
      accountId: req.body?.id
    });

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        error: 'Duplicate account',
        message: 'An account with this ID already exists'
      });
    }

    res.status(500).json({
      error: 'Failed to create/update account',
      message: error.message || 'Internal server error'
    });
  }
});

// PUT update account
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const account = req.body;
    // For simple PUT, we still want optimistic locking if version is provided
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE accounts 
      SET name = $1, type = $2, balance = $3, description = $4, 
          parent_account_id = $5, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $6 AND tenant_id = $7
    `;
    const queryParams: any[] = [
      account.name,
      account.type,
      account.balance,
      account.description,
      account.parentAccountId,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $8`;
      queryParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;

    const result = await db.query(updateQuery, queryParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Transform snake_case to camelCase for response
    const transformedResult = {
      id: result[0].id,
      name: result[0].name,
      type: result[0].type,
      balance: parseFloat(result[0].balance) || 0,
      isPermanent: result[0].is_permanent || false,
      description: result[0].description || null,
      parentAccountId: result[0].parent_account_id || null,
      createdAt: result[0].created_at,
      updatedAt: result[0].updated_at
    };

    emitToTenant(req.tenantId!, WS_EVENTS.ACCOUNT_UPDATED, {
      account: transformedResult,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(transformedResult);
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE account
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE accounts SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.ACCOUNT_DELETED, {
      accountId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;

