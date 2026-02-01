
import express from 'express';
import { getShopService } from '../../services/shopService.js';

const router = express.Router();

// --- Branches ---
router.get('/branches', async (req: any, res) => {
    try {
        const branches = await getShopService().getBranches(req.tenantId);
        res.json(branches);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/branches', async (req: any, res) => {
    try {
        const branchId = await getShopService().createBranch(req.tenantId, req.body);
        res.status(201).json({ id: branchId, message: 'Branch registered successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- Products & Inventory ---
router.get('/products', async (req: any, res) => {
    try {
        const products = await getShopService().getProducts(req.tenantId);
        res.json(products);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/inventory', async (req: any, res) => {
    try {
        const inventory = await getShopService().getInventory(req.tenantId);
        res.json(inventory);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/inventory/adjust', async (req: any, res) => {
    try {
        // req.body: { productId, warehouseId, quantity, type, referenceId, reason }
        // userId from req.user
        const data = { ...req.body, userId: req.user?.userId || 'system' };

        const result = await getShopService().adjustInventory(req.tenantId, data);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- Sales ---
router.get('/sales', async (req: any, res) => {
    try {
        const sales = await getShopService().getSales(req.tenantId);
        res.json(sales);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/sales', async (req: any, res) => {
    try {
        const saleId = await getShopService().createSale(req.tenantId, req.body);
        res.status(201).json({ id: saleId, message: 'Sale completed successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- Loyalty ---
router.get('/loyalty/members', async (req: any, res) => {
    try {
        const members = await getShopService().getLoyaltyMembers(req.tenantId);
        res.json(members);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/loyalty/members', async (req: any, res) => {
    try {
        const memberId = await getShopService().createLoyaltyMember(req.tenantId, req.body);
        res.status(201).json({ id: memberId, message: 'Member enrolled successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
