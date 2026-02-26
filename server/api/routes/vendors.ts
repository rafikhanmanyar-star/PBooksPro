import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all vendors
router.get('/', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const { limit, offset } = req.query;
        const effectiveLimit = Math.min(parseInt(limit as string) || 10000, 50000);
        let query = 'SELECT * FROM vendors WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name LIMIT $2';
        const params: any[] = [req.tenantId, effectiveLimit];
        if (offset) {
            query += ' OFFSET $3';
            params.push(parseInt(offset as string));
        }
        const vendors = await db.query(query, params);
        res.json(vendors);
    } catch (error) {
        console.error('Error fetching vendors:', error);
        res.status(500).json({ error: 'Failed to fetch vendors' });
    }
});

// POST create vendor
router.post('/', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const vendor = req.body;

        // Validate required fields
        if (!vendor.name) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Name is required'
            });
        }

        // Generate ID if not provided
        const vendorId = vendor.id || `vendor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Check for duplicate vendor name, excluding the current vendor ID if it already exists
        const trimmedName = vendor.name.trim();
        const existingVendorByName = await db.query(
            'SELECT id, name, version FROM vendors WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND id != $3 AND deleted_at IS NULL',
            [req.tenantId, trimmedName, vendorId]
        );

        if (existingVendorByName.length > 0) {
            return res.status(409).json({
                error: 'Duplicate vendor name',
                message: `A vendor with the name "${trimmedName}" already exists.`
            });
        }

        const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

        // Check if vendor exists to determine if this is a create or update
        const existing = await db.query(
            'SELECT id, version FROM vendors WHERE id = $1 AND tenant_id = $2',
            [vendorId, req.tenantId]
        );
        const isUpdate = existing.length > 0;

        // Optimistic locking check for POST update
        const serverVersion = isUpdate ? existing[0].version : null;
        if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
            return res.status(409).json({
                error: 'Version conflict',
                message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
                serverVersion,
            });
        }

        const result = await db.query(
            `INSERT INTO vendors (
        id, tenant_id, name, description, contact_no, company_name, address, is_active, user_id, 
        created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        contact_no = EXCLUDED.contact_no,
        company_name = EXCLUDED.company_name,
        address = EXCLUDED.address,
        is_active = EXCLUDED.is_active,
        user_id = EXCLUDED.user_id,
        updated_at = NOW(),
        version = COALESCE(vendors.version, 1) + 1,
        deleted_at = NULL
      WHERE vendors.tenant_id = $2 AND (vendors.version = $10 OR vendors.version IS NULL)
      RETURNING *`,
            [
                vendorId,
                req.tenantId,
                vendor.name,
                vendor.description || null,
                vendor.contactNo || null,
                vendor.companyName || null,
                vendor.address || null,
                vendor.isActive !== undefined ? vendor.isActive : true,
                req.user?.userId || null,
                serverVersion
            ]
        );

        if (!result || result.length === 0) {
            return res.status(500).json({ error: 'Failed to create vendor' });
        }

        const savedVendor = result[0];

        // Emit WebSocket event
        emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.VENDOR_UPDATED : WS_EVENTS.VENDOR_CREATED, {
            vendor: savedVendor,
            userId: req.user?.userId,
            username: req.user?.username,
        });

        res.status(isUpdate ? 200 : 201).json(savedVendor);
    } catch (error: any) {
        console.error('Error creating vendor:', error);
        res.status(500).json({
            error: 'Failed to create vendor',
            message: error.message || 'Internal server error'
        });
    }
});

// PUT update vendor
router.put('/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const vendor = req.body;

        if (!vendor.name) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Name is required'
            });
        }

        const trimmedName = vendor.name.trim();
        const existingVendorByName = await db.query(
            'SELECT id FROM vendors WHERE tenant_id = $1 AND id != $2 AND LOWER(TRIM(name)) = LOWER($3)',
            [req.tenantId, req.params.id, trimmedName]
        );

        if (existingVendorByName.length > 0) {
            return res.status(409).json({
                error: 'Duplicate vendor name',
                message: `A vendor with the name "${trimmedName}" already exists.`
            });
        }

        const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

        let putQuery = `
          UPDATE vendors 
          SET name = $1, description = $2, contact_no = $3, 
              company_name = $4, address = $5, is_active = $6, user_id = $7, updated_at = NOW(),
              version = COALESCE(version, 1) + 1
          WHERE id = $8 AND tenant_id = $9
        `;
        const putParams: any[] = [
            vendor.name,
            vendor.description || null,
            vendor.contactNo || null,
            vendor.companyName || null,
            vendor.address || null,
            vendor.isActive !== undefined ? vendor.isActive : true,
            req.user?.userId || null,
            req.params.id,
            req.tenantId
        ];

        if (clientVersion != null) {
            putQuery += ` AND version = $10`;
            putParams.push(clientVersion);
        }

        putQuery += ` RETURNING *`;

        const result = await db.query(putQuery, putParams);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        // Emit WebSocket event
        emitToTenant(req.tenantId!, WS_EVENTS.VENDOR_UPDATED, {
            vendor: result[0],
            userId: req.user?.userId,
            username: req.user?.username,
        });

        res.json(result[0]);
    } catch (error: any) {
        console.error('Error updating vendor:', error);
        res.status(500).json({
            error: 'Failed to update vendor',
            message: error.message || 'Internal server error'
        });
    }
});

// DELETE vendor
router.delete('/:id', async (req: TenantRequest, res) => {
    try {
        const db = getDb();

        // Check if vendor has any relations (optional, but good for UX)
        // For now we rely on DB constraints

        const result = await db.query(
            'UPDATE vendors SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
            [req.params.id, req.tenantId]
        );

        if (result.length === 0) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        // Emit WebSocket event
        emitToTenant(req.tenantId!, WS_EVENTS.VENDOR_DELETED, {
            vendorId: req.params.id,
            userId: req.user?.userId,
            username: req.user?.username,
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting vendor:', error);
        if (error.code === '23503') {
            return res.status(409).json({
                error: 'Conflict',
                message: 'This vendor cannot be deleted because it is referenced by other records (bills, contracts, etc.)'
            });
        }
        res.status(500).json({ error: 'Failed to delete vendor' });
    }
});

export default router;
