
import express from 'express';
import { getShopService } from '../../services/shopService.js';

const router = express.Router();

// --- Branches ---
router.get('/branches', async (req: any, res) => {
    try {
        console.log(`[ShopAPI] GET /branches - Tenant: ${req.tenantId}`);
        const branches = await getShopService().getBranches(req.tenantId);
        console.log(`[ShopAPI] Found ${branches.length} branches for tenant ${req.tenantId}`);
        res.json(branches);
    } catch (error: any) {
        console.error(`[ShopAPI] GET /branches error:`, error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/branches', async (req: any, res) => {
    try {
        console.log(`[ShopAPI] POST /branches - Tenant: ${req.tenantId}`, req.body);
        const branchId = await getShopService().createBranch(req.tenantId, req.body);
        console.log(`[ShopAPI] Created branch ${branchId} for tenant ${req.tenantId}`);
        res.status(201).json({ id: branchId, message: 'Branch registered successfully' });
    } catch (error: any) {
        console.error(`[ShopAPI] POST /branches error:`, error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/branches/:id', async (req: any, res) => {
    try {
        console.log(`[ShopAPI] PUT /branches/${req.params.id} - Tenant: ${req.tenantId}`, req.body);
        await getShopService().updateBranch(req.tenantId, req.params.id, req.body);
        res.json({ success: true, message: 'Branch updated successfully' });
    } catch (error: any) {
        console.error(`[ShopAPI] PUT /branches error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// --- Warehouses ---
router.get('/warehouses', async (req: any, res) => {
    try {
        const warehouses = await getShopService().getWarehouses(req.tenantId);
        res.json(warehouses);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/warehouses', async (req: any, res) => {
    try {
        const warehouseId = await getShopService().createWarehouse(req.tenantId, req.body);
        res.status(201).json({ id: warehouseId, message: 'Warehouse created successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- Terminals ---
router.get('/terminals', async (req: any, res) => {
    try {
        const terminals = await getShopService().getTerminals(req.tenantId);
        res.json(terminals);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/terminals', async (req: any, res) => {
    try {
        const terminalId = await getShopService().createTerminal(req.tenantId, req.body);
        res.status(201).json({ id: terminalId, message: 'Terminal registered successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/terminals/:id', async (req: any, res) => {
    try {
        await getShopService().updateTerminal(req.tenantId, req.params.id, req.body);
        res.json({ success: true, message: 'Terminal updated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/terminals/:id', async (req: any, res) => {
    try {
        await getShopService().deleteTerminal(req.tenantId, req.params.id);
        res.json({ success: true, message: 'Terminal removed successfully' });
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

router.post('/products', async (req: any, res) => {
    try {
        const productId = await getShopService().createProduct(req.tenantId, req.body);
        res.status(201).json({ id: productId, message: 'Product created successfully' });
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

router.put('/loyalty/members/:id', async (req: any, res) => {
    try {
        await getShopService().updateLoyaltyMember(req.tenantId, req.params.id, req.body);
        res.json({ success: true, message: 'Member updated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/loyalty/members/:id', async (req: any, res) => {
    try {
        await getShopService().deleteLoyaltyMember(req.tenantId, req.params.id);
        res.json({ success: true, message: 'Member removed successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- Policies ---
router.get('/policies', async (req: any, res) => {
    try {
        const policies = await getShopService().getPolicies(req.tenantId);
        res.json(policies);
    } catch (error: any) {
        console.error(`[ShopAPI] GET /policies error:`, error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/policies', async (req: any, res) => {
    try {
        const policies = await getShopService().updatePolicies(req.tenantId, req.body);
        res.json(policies);
    } catch (error: any) {
        console.error(`[ShopAPI] POST /policies error:`, error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
