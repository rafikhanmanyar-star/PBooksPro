import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all plan amenities
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { activeOnly } = req.query;
    const params: any[] = [req.tenantId];

    const { limit, offset } = req.query;
    const effectiveLimit = Math.min(parseInt(limit as string) || 10000, 50000);
    let amenities: any[];
    try {
      let query = 'SELECT * FROM plan_amenities WHERE tenant_id = $1 AND deleted_at IS NULL';
      if (activeOnly === 'true') query += ' AND is_active = true';
      query += ` ORDER BY name ASC LIMIT $2`;
      const qParams = [...params, effectiveLimit];
      if (offset) { query += ` OFFSET $3`; qParams.push(parseInt(offset as string)); }
      amenities = await db.query(query, qParams);
    } catch (queryErr: any) {
      if (queryErr?.message?.includes('deleted_at') || queryErr?.message?.includes('does not exist')) {
        let query = 'SELECT * FROM plan_amenities WHERE tenant_id = $1';
        if (activeOnly === 'true') query += ' AND is_active = true';
        query += ` ORDER BY name ASC LIMIT $2`;
        const qParams = [...params, effectiveLimit];
        if (offset) { query += ` OFFSET $3`; qParams.push(parseInt(offset as string)); }
        amenities = await db.query(query, qParams);
      } else {
        throw queryErr;
      }
    }

    const mapped = amenities.map((a: any) => ({
      id: a.id,
      name: a.name,
      price: parseFloat(a.price) || 0,
      isPercentage: a.is_percentage,
      isActive: a.is_active,
      description: a.description,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));

    res.json(mapped);
  } catch (error: any) {
    console.error('Error fetching plan amenities:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch plan amenities' });
  }
});

// GET plan amenity by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    let amenities: any[];
    try {
      amenities = await db.query(
        'SELECT * FROM plan_amenities WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [req.params.id, req.tenantId]
      );
    } catch (queryErr: any) {
      if (queryErr?.message?.includes('deleted_at') || queryErr?.message?.includes('does not exist')) {
        amenities = await db.query(
          'SELECT * FROM plan_amenities WHERE id = $1 AND tenant_id = $2',
          [req.params.id, req.tenantId]
        );
      } else {
        throw queryErr;
      }
    }

    if (amenities.length === 0) {
      return res.status(404).json({ error: 'Plan amenity not found' });
    }

    const a = amenities[0];
    res.json({
      id: a.id,
      name: a.name,
      price: parseFloat(a.price) || 0,
      isPercentage: a.is_percentage,
      isActive: a.is_active,
      description: a.description,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    });
  } catch (error: any) {
    console.error('Error fetching plan amenity:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch plan amenity' });
  }
});

// POST create/update plan amenity (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const amenity = req.body;

    // Validate required fields
    if (!amenity.name) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name is required'
      });
    }
    if (amenity.price === undefined || amenity.price === null) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Price is required'
      });
    }

    // Generate ID if not provided
    const amenityId = amenity.id || `amenity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if amenity exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, version FROM plan_amenities WHERE id = $1 AND tenant_id = $2',
      [amenityId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Optimistic locking check for POST update
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO plan_amenities (
        id, tenant_id, name, price, is_percentage, is_active, description, created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7,
                COALESCE((SELECT created_at FROM plan_amenities WHERE id = $1), NOW()), NOW(), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        is_percentage = EXCLUDED.is_percentage,
        is_active = EXCLUDED.is_active,
        description = EXCLUDED.description,
        updated_at = NOW(),
        version = COALESCE(plan_amenities.version, 1) + 1,
        deleted_at = NULL
      WHERE plan_amenities.tenant_id = $2 AND (plan_amenities.version = $8 OR plan_amenities.version IS NULL)
      RETURNING *`,
      [
        amenityId,
        req.tenantId,
        amenity.name,
        amenity.price,
        amenity.isPercentage ?? false,
        amenity.isActive ?? true,
        amenity.description || null,
        serverVersion
      ]
    );

    const a = result[0];
    const mapped = {
      id: a.id,
      name: a.name,
      price: parseFloat(a.price) || 0,
      isPercentage: a.is_percentage,
      isActive: a.is_active,
      description: a.description,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };

    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.PLAN_AMENITY_UPDATED : WS_EVENTS.PLAN_AMENITY_CREATED, {
      planAmenity: mapped,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json(mapped);
  } catch (error: any) {
    console.error('Error creating/updating plan amenity:', error);
    res.status(500).json({
      error: 'Failed to create/update plan amenity',
      message: error.message || 'Internal server error'
    });
  }
});

// PUT update plan amenity
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const amenity = req.body;
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE plan_amenities 
      SET name = $1, price = $2, is_percentage = $3, is_active = $4, description = $5, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $6 AND tenant_id = $7
    `;
    const updateParams: any[] = [
      amenity.name,
      amenity.price,
      amenity.isPercentage ?? false,
      amenity.isActive ?? true,
      amenity.description || null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $8`;
      updateParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;

    const result = await db.query(updateQuery, updateParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Plan amenity not found' });
    }

    const a = result[0];
    const mapped = {
      id: a.id,
      name: a.name,
      price: parseFloat(a.price) || 0,
      isPercentage: a.is_percentage,
      isActive: a.is_active,
      description: a.description,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };

    emitToTenant(req.tenantId!, WS_EVENTS.PLAN_AMENITY_UPDATED, {
      planAmenity: mapped,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(mapped);
  } catch (error) {
    console.error('Error updating plan amenity:', error);
    res.status(500).json({ error: 'Failed to update plan amenity' });
  }
});

// DELETE plan amenity
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE plan_amenities SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Plan amenity not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.PLAN_AMENITY_DELETED, {
      planAmenityId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting plan amenity:', error);
    res.status(500).json({ error: 'Failed to delete plan amenity' });
  }
});

export default router;
