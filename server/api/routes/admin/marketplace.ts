import { Router } from 'express';
import { getDatabaseService } from '../../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

/**
 * GET /api/admin/marketplace/ads
 * List all ads for moderation
 */
router.get('/ads', async (_req, res) => {
    try {
        const db = getDb();
        const rows = await db.query(`
      SELECT a.*, c.name AS category_name, t.name AS supplier_name, t.company_name AS supplier_company_name
      FROM marketplace_ads a
      JOIN marketplace_categories c ON c.id = a.category_id
      JOIN tenants t ON t.id = a.tenant_id
      ORDER BY 
        CASE WHEN a.status = 'PENDING' THEN 0 ELSE 1 END,
        a.created_at DESC
    `);

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
        console.error('Admin marketplace ads list error:', error);
        res.status(500).json({ error: 'Failed to load ads' });
    }
});

/**
 * POST /api/admin/marketplace/ads/:id/approve
 */
router.post('/ads/:id/approve', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        await db.query(
            "UPDATE marketplace_ads SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1",
            [id]
        );
        res.json({ success: true, message: 'Ad approved' });
    } catch (error: any) {
        console.error('Admin ad approve error:', error);
        res.status(500).json({ error: 'Failed to approve ad' });
    }
});

/**
 * POST /api/admin/marketplace/ads/:id/reject
 */
router.post('/ads/:id/reject', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const { reason } = req.body;
        await db.query(
            "UPDATE marketplace_ads SET status = 'REJECTED', updated_at = NOW() WHERE id = $1",
            [id]
        );
        // Optionally store rejection reason somewhere if we add a column for it
        res.json({ success: true, message: 'Ad rejected' });
    } catch (error: any) {
        console.error('Admin ad reject error:', error);
        res.status(500).json({ error: 'Failed to reject ad' });
    }
});

/**
 * GET /api/admin/marketplace/categories
 */
router.get('/categories', async (_req, res) => {
    try {
        const db = getDb();
        const rows = await db.query('SELECT * FROM marketplace_categories ORDER BY display_order, name');
        res.json(rows);
    } catch (error: any) {
        console.error('Admin marketplace categories list error:', error);
        res.status(500).json({ error: 'Failed to load categories' });
    }
});

/**
 * POST /api/admin/marketplace/categories
 */
router.post('/categories', async (req, res) => {
    try {
        const db = getDb();
        const { id, name, display_order } = req.body;
        if (!id || !name) return res.status(400).json({ error: 'ID and Name are required' });

        await db.query(
            'INSERT INTO marketplace_categories (id, name, display_order) VALUES ($1, $2, $3)',
            [id, name, display_order ?? 0]
        );
        res.status(201).json({ success: true, message: 'Category created' });
    } catch (error: any) {
        console.error('Admin category create error:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

/**
 * PUT /api/admin/marketplace/categories/:id
 */
router.put('/categories/:id', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const { name, display_order } = req.body;

        await db.query(
            'UPDATE marketplace_categories SET name = $1, display_order = $2 WHERE id = $3',
            [name, display_order, id]
        );
        res.json({ success: true, message: 'Category updated' });
    } catch (error: any) {
        console.error('Admin category update error:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

/**
 * DELETE /api/admin/marketplace/categories/:id
 */
router.delete('/categories/:id', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        // Check if there are ads using this category
        const adsCount = await db.query('SELECT COUNT(*) AS count FROM marketplace_ads WHERE category_id = $1', [id]);
        if (parseInt(adsCount[0].count) > 0) {
            return res.status(400).json({ error: 'Cannot delete category that is in use by ads' });
        }

        await db.query('DELETE FROM marketplace_categories WHERE id = $1', [id]);
        res.json({ success: true, message: 'Category deleted' });
    } catch (error: any) {
        console.error('Admin category delete error:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

export default router;
