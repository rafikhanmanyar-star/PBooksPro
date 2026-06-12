// @ts-nocheck
import { Router } from 'express';
import { AdminMarketplaceRepository } from '../repositories/AdminTenantRepository.js';

const router = Router();
const marketplaceRepo = new AdminMarketplaceRepository();

router.get('/ads', async (_req, res) => {
  try {
    const rows = await marketplaceRepo.listAdsForModeration();
    if (rows.length > 0) {
      const adIds = rows.map((r: any) => r.id);
      const images = await marketplaceRepo.listFirstImagesForAds(adIds);
      const firstByAd: Record<string, any> = {};
      for (const img of images as any[]) {
        if (!firstByAd[img.ad_id]) {
          firstByAd[img.ad_id] = {
            id: img.id,
            content_type: img.content_type,
            data_base64: img.image_data
              ? Buffer.isBuffer(img.image_data)
                ? img.image_data.toString('base64')
                : img.image_data
              : null,
          };
        }
      }
      return res.json(rows.map((r: any) => ({ ...r, first_image: firstByAd[r.id] || null })));
    }
    res.json(rows);
  } catch (error: any) {
    console.error('Admin marketplace ads list error:', error);
    res.status(500).json({ error: 'Failed to load ads' });
  }
});

router.post('/ads/:id/approve', async (req, res) => {
  try {
    await marketplaceRepo.approveAd(req.params.id);
    res.json({ success: true, message: 'Ad approved' });
  } catch (error: any) {
    console.error('Admin ad approve error:', error);
    res.status(500).json({ error: 'Failed to approve ad' });
  }
});

router.post('/ads/:id/reject', async (req, res) => {
  try {
    await marketplaceRepo.rejectAd(req.params.id);
    res.json({ success: true, message: 'Ad rejected' });
  } catch (error: any) {
    console.error('Admin ad reject error:', error);
    res.status(500).json({ error: 'Failed to reject ad' });
  }
});

router.get('/categories', async (_req, res) => {
  try {
    res.json(await marketplaceRepo.listCategories());
  } catch (error: any) {
    console.error('Admin marketplace categories list error:', error);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { id, name, display_order } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'ID and Name are required' });
    await marketplaceRepo.insertCategory(id, name, display_order ?? 0);
    res.status(201).json({ success: true, message: 'Category created' });
  } catch (error: any) {
    console.error('Admin category create error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { name, display_order } = req.body;
    await marketplaceRepo.updateCategory(req.params.id, name, display_order);
    res.json({ success: true, message: 'Category updated' });
  } catch (error: any) {
    console.error('Admin category update error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const count = await marketplaceRepo.countAdsInCategory(req.params.id);
    if (count > 0) {
      return res.status(400).json({ error: 'Cannot delete category that is in use by ads' });
    }
    await marketplaceRepo.deleteCategory(req.params.id);
    res.json({ success: true, message: 'Category deleted' });
  } catch (error: any) {
    console.error('Admin category delete error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
