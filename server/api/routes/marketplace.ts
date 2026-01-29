import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

const ADS_PER_DAY_LIMIT = 2;

/**
 * GET /api/marketplace/categories
 * List all marketplace categories (for filters and form)
 */
router.get('/categories', async (_req: TenantRequest, res) => {
  try {
    const db = getDb();
    const rows = await db.query(
      'SELECT id, name, display_order FROM marketplace_categories ORDER BY display_order, name'
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Marketplace categories error:', error);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

/**
 * GET /api/marketplace
 * List ads with optional filters: category, search, sort (newest default)
 * Does not require supplier; all tenants can browse.
 */
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { category, search, sort = 'newest' } = req.query as { category?: string; search?: string; sort?: string };

    let sql = `
      SELECT a.id, a.tenant_id, a.title, a.description, a.category_id, a.product_brand, a.product_model,
             a.min_order_quantity, a.unit, a.specifications, a.contact_email, a.contact_phone, a.status,
             a.created_at, a.updated_at,
             c.name AS category_name,
             t.name AS supplier_name, t.company_name AS supplier_company_name, t.email AS supplier_email
      FROM marketplace_ads a
      JOIN marketplace_categories c ON c.id = a.category_id
      JOIN tenants t ON t.id = a.tenant_id
      WHERE a.status = 'ACTIVE'
    `;
    const params: any[] = [];
    let idx = 1;

    if (category) {
      sql += ` AND a.category_id = $${idx}`;
      params.push(category);
      idx++;
    }
    if (search && String(search).trim()) {
      sql += ` AND (a.title ILIKE $${idx} OR a.description ILIKE $${idx} OR a.product_brand ILIKE $${idx} OR a.product_model ILIKE $${idx})`;
      params.push(`%${String(search).trim()}%`);
      idx++;
    }

    if (sort === 'oldest') {
      sql += ' ORDER BY a.created_at ASC';
    } else {
      sql += ' ORDER BY a.created_at DESC';
    }

    const rows = await db.query(sql, params);
    if (rows.length > 0) {
      const adIds = rows.map((r: any) => r.id);
      const images = await db.query(
        `SELECT id, ad_id, image_data, content_type FROM marketplace_ad_images
         WHERE ad_id = ANY($1)
         ORDER BY ad_id, sort_order, id`,
        [adIds]
      );
      const firstByAd: Record<string, any> = {};
      for (const img of images as any[]) {
        if (!firstByAd[img.ad_id]) {
          firstByAd[img.ad_id] = {
            id: img.id,
            content_type: img.content_type,
            data_base64: img.image_data ? (Buffer.isBuffer(img.image_data) ? img.image_data.toString('base64') : img.image_data) : null,
          };
        }
      }
      const withImage = rows.map((r: any) => ({ ...r, first_image: firstByAd[r.id] || null }));
      return res.json(withImage);
    }
    res.json(rows);
  } catch (error: any) {
    console.error('Marketplace list error:', error);
    res.status(500).json({ error: 'Failed to load marketplace ads' });
  }
});

/**
 * GET /api/marketplace/my-ads
 * List current tenant's ads (suppliers only in UI; API allows any tenant)
 */
router.get('/my-ads', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getDb();
    const rows = await db.query(
      `SELECT a.id, a.tenant_id, a.title, a.description, a.category_id, a.product_brand, a.product_model,
              a.min_order_quantity, a.unit, a.specifications, a.contact_email, a.contact_phone, a.status,
              a.created_at, a.updated_at,
              c.name AS category_name
       FROM marketplace_ads a
       JOIN marketplace_categories c ON c.id = a.category_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC`,
      [tenantId]
    );
    if (rows.length > 0) {
      const adIds = rows.map((r: any) => r.id);
      const images = await db.query(
        `SELECT id, ad_id, image_data, content_type FROM marketplace_ad_images
         WHERE ad_id = ANY($1) ORDER BY ad_id, sort_order, id`,
        [adIds]
      );
      const firstByAd: Record<string, any> = {};
      for (const img of images as any[]) {
        if (!firstByAd[img.ad_id]) {
          firstByAd[img.ad_id] = {
            id: img.id,
            content_type: img.content_type,
            data_base64: img.image_data ? (Buffer.isBuffer(img.image_data) ? img.image_data.toString('base64') : img.image_data) : null,
          };
        }
      }
      const withImage = rows.map((r: any) => ({ ...r, first_image: firstByAd[r.id] || null }));
      return res.json(withImage);
    }
    res.json(rows);
  } catch (error: any) {
    console.error('Marketplace my-ads error:', error);
    res.status(500).json({ error: 'Failed to load your ads' });
  }
});

/**
 * GET /api/marketplace/ads-today
 * Returns count of ads created by current tenant today (for 2/day limit)
 */
router.get('/ads-today', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getDb();
    const rows = await db.query(
      `SELECT COUNT(*) AS count FROM marketplace_ads
       WHERE tenant_id = $1 AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE`,
      [tenantId]
    );
    const count = parseInt(String(rows[0]?.count ?? 0), 10);
    res.json({ count, limit: ADS_PER_DAY_LIMIT });
  } catch (error: any) {
    console.error('Marketplace ads-today error:', error);
    res.status(500).json({ error: 'Failed to check ad limit' });
  }
});

/**
 * GET /api/marketplace/:id
 * Get single ad by id (with supplier info for contact)
 */
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const rows = await db.query(
      `SELECT a.id, a.tenant_id, a.title, a.description, a.category_id, a.product_brand, a.product_model,
              a.min_order_quantity, a.unit, a.specifications, a.contact_email, a.contact_phone, a.status,
              a.created_at, a.updated_at,
              c.name AS category_name,
              t.name AS supplier_name, t.company_name AS supplier_company_name, t.email AS supplier_email
       FROM marketplace_ads a
       JOIN marketplace_categories c ON c.id = a.category_id
       JOIN tenants t ON t.id = a.tenant_id
       WHERE a.id = $1 AND a.status = 'ACTIVE'`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ad not found' });
    const ad = rows[0] as any;
    const imgRows = await db.query(
      `SELECT id, content_type, image_data FROM marketplace_ad_images WHERE ad_id = $1 ORDER BY sort_order, id`,
      [ad.id]
    );
    const images = (imgRows as any[]).map((img) => ({
      id: img.id,
      content_type: img.content_type,
      data_base64: img.image_data ? (Buffer.isBuffer(img.image_data) ? img.image_data.toString('base64') : img.image_data) : null,
    }));
    res.json({ ...ad, images });
  } catch (error: any) {
    console.error('Marketplace get ad error:', error);
    res.status(500).json({ error: 'Failed to load ad' });
  }
});

/**
 * POST /api/marketplace
 * Create a new ad. Limit: 2 per supplier per calendar day.
 */
router.post('/', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getDb();
    const {
      title,
      description,
      category_id,
      product_brand,
      product_model,
      min_order_quantity,
      unit,
      specifications,
      contact_email,
      contact_phone,
      images: imagesPayload,
    } = req.body;

    if (!title || !category_id) {
      return res.status(400).json({ error: 'Title and category are required' });
    }

    const countResult = await db.query(
      `SELECT COUNT(*) AS count FROM marketplace_ads
       WHERE tenant_id = $1 AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE`,
      [tenantId]
    );
    const todayCount = parseInt(String(countResult[0]?.count ?? 0), 10);
    if (todayCount >= ADS_PER_DAY_LIMIT) {
      return res.status(429).json({
        error: 'Daily limit reached',
        message: `You can post up to ${ADS_PER_DAY_LIMIT} ads per day. Try again tomorrow.`,
        limit: ADS_PER_DAY_LIMIT,
      });
    }

    const id = `ma_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(
      `INSERT INTO marketplace_ads (
        id, tenant_id, title, description, category_id,
        product_brand, product_model, min_order_quantity, unit, specifications,
        contact_email, contact_phone, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE')`,
      [
        id,
        tenantId,
        title.trim(),
        description ? String(description).trim() : null,
        category_id,
        product_brand ? String(product_brand).trim() : null,
        product_model ? String(product_model).trim() : null,
        min_order_quantity != null ? min_order_quantity : null,
        unit ? String(unit).trim() : null,
        specifications ? String(specifications).trim() : null,
        contact_email ? String(contact_email).trim() : null,
        contact_phone ? String(contact_phone).trim() : null,
      ]
    );

    const images = Array.isArray(imagesPayload) ? imagesPayload : [];
    for (let i = 0; i < images.length; i++) {
      const item = images[i];
      const data = item?.data;
      const contentType = item?.contentType || item?.content_type || 'image/jpeg';
      if (data && typeof data === 'string') {
        const imgId = `mai_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
        const buf = Buffer.from(data, 'base64');
        await db.query(
          `INSERT INTO marketplace_ad_images (id, ad_id, image_data, content_type, sort_order) VALUES ($1, $2, $3, $4, $5)`,
          [imgId, id, buf, contentType, i]
        );
      }
    }

    const created = await db.query(
      `SELECT a.*, c.name AS category_name FROM marketplace_ads a
       JOIN marketplace_categories c ON c.id = a.category_id WHERE a.id = $1`,
      [id]
    );
    const imgRows = await db.query(
      `SELECT id, content_type, image_data FROM marketplace_ad_images WHERE ad_id = $1 ORDER BY sort_order, id`,
      [id]
    );
    const imagesList = (imgRows as any[]).map((img) => ({
      id: img.id,
      content_type: img.content_type,
      data_base64: img.image_data ? (Buffer.isBuffer(img.image_data) ? img.image_data.toString('base64') : img.image_data) : null,
    }));
    res.status(201).json({ ...created[0], images: imagesList });
  } catch (error: any) {
    console.error('Marketplace create error:', error);
    res.status(500).json({ error: 'Failed to create ad' });
  }
});

/**
 * DELETE /api/marketplace/:id
 * Delete own ad (tenant_id must match)
 */
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getDb();
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM marketplace_ads WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Ad not found or you cannot delete it' });
    res.json({ deleted: true, id });
  } catch (error: any) {
    console.error('Marketplace delete error:', error);
    res.status(500).json({ error: 'Failed to delete ad' });
  }
});

export default router;
