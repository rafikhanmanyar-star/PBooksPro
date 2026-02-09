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
        const vendors = await db.query(
            'SELECT * FROM vendors WHERE tenant_id = $1 ORDER BY name',
            [req.tenantId]
        );
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
            'SELECT id, name FROM vendors WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND id != $3',
            [req.tenantId, trimmedName, vendorId]
        );

        if (existingVendorByName.length > 0) {
            return res.status(409).json({
                error: 'Duplicate vendor name',
                message: `A vendor with the name "${trimmedName}" already exists.`
            });
        }

        const result = await db.query(
            `INSERT INTO vendors (
        id, tenant_id, name, description, contact_no, company_name, address, is_active, user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        contact_no = EXCLUDED.contact_no,
        company_name = EXCLUDED.company_name,
        address = EXCLUDED.address,
        is_active = EXCLUDED.is_active,
        user_id = EXCLUDED.user_id,
        updated_at = NOW()
      WHERE vendors.tenant_id = $2
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
                req.user?.userId || null
            ]
        );

        if (!result || result.length === 0) {
            return res.status(500).json({ error: 'Failed to create vendor' });
        }

        const savedVendor = result[0];

        // Emit WebSocket event
        emitToTenant(req.tenantId!, WS_EVENTS.VENDOR_CREATED, {
            vendor: savedVendor,
            userId: req.user?.userId,
            username: req.user?.username,
        });

        res.status(201).json(savedVendor);
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

        const result = await db.query(
            `UPDATE vendors 
       SET name = $1, description = $2, contact_no = $3, 
           company_name = $4, address = $5, is_active = $6, user_id = $7, updated_at = NOW()
       WHERE id = $8 AND tenant_id = $9
       RETURNING *`,
            [
                vendor.name,
                vendor.description || null,
                vendor.contactNo || null,
                vendor.companyName || null,
                vendor.address || null,
                vendor.isActive !== undefined ? vendor.isActive : true,
                req.user?.userId || null,
                req.params.id,
                req.tenantId
            ]
        );

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
            'DELETE FROM vendors WHERE id = $1 AND tenant_id = $2 RETURNING id',
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
