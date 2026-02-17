
import { PoolClient } from 'pg';
import { getDatabaseService } from './databaseService.js';

export interface ShopSale {
    id?: string;
    branchId: string;
    terminalId: string;
    userId: string;
    customerId?: string;
    loyaltyMemberId?: string;
    saleNumber: string;
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
    totalPaid: number;
    changeDue: number;
    paymentMethod: string;
    paymentDetails: any;
    items: ShopSaleItem[];
}

export interface ShopSaleItem {
    productId: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    discountAmount: number;
    subtotal: number;
}

export class ShopService {
    private db = getDatabaseService();

    // --- Branch Methods ---
    async getBranches(tenantId: string) {
        return this.db.query('SELECT * FROM shop_branches WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
    }

    // --- Warehouse Methods ---
    async getWarehouses(tenantId: string) {
        console.log(`[ShopService] Fetching warehouses for tenant: ${tenantId}`);
        const warehouses = await this.db.query('SELECT * FROM shop_warehouses WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
        const branches = await this.db.query('SELECT * FROM shop_branches WHERE tenant_id = $1', [tenantId]);

        console.log(`[ShopService] Found ${warehouses.length} warehouses and ${branches.length} branches`);

        // If mismatch, ensure every branch has at least one warehouse with same ID (to support legacy logic)
        if (warehouses.length < branches.length) {
            console.log(`[ShopService] Creating missing warehouses from branches...`);
            for (const branch of branches) {
                const hasWh = warehouses.some((w: any) => w.id === branch.id);
                if (!hasWh) {
                    console.log(`[ShopService] Creating warehouse for branch: ${branch.name}`);
                    await this.db.query(`
                        INSERT INTO shop_warehouses (id, tenant_id, name, code, location)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (id) DO NOTHING
                    `, [branch.id, tenantId, branch.name, branch.code, branch.location || 'Store']);
                }
            }
            // Re-fetch after fixing
            const refreshed = await this.db.query('SELECT * FROM shop_warehouses WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
            console.log(`[ShopService] After sync, total warehouses: ${refreshed.length}`);
            return refreshed;
        }

        // 🔥 FIX: If no warehouses exist at all, create a default one
        if (warehouses.length === 0) {
            console.log(`[ShopService] ⚠️ No warehouses found! Creating default warehouse...`);
            const defaultWarehouse = await this.db.query(`
                INSERT INTO shop_warehouses (tenant_id, name, code, location, is_active)
                VALUES ($1, 'Main Warehouse', 'WH-MAIN', 'Head Office', TRUE)
                RETURNING *
            `, [tenantId]);
            console.log(`[ShopService] ✅ Default warehouse created:`, defaultWarehouse[0]);
            return defaultWarehouse;
        }

        console.log(`[ShopService] Returning ${warehouses.length} warehouses`);
        return warehouses;
    }

    async createWarehouse(tenantId: string, data: any) {
        const res = await this.db.query(`
            INSERT INTO shop_warehouses (
                tenant_id, name, code, location, is_active
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [
            tenantId,
            data.name,
            data.code || `WH-${Date.now().toString().slice(-4)}`,
            data.location || '',
            data.isActive ?? true
        ]);
        return res[0].id;
    }

    // --- Inventory Methods ---
    async getProducts(tenantId: string) {
        return this.db.query('SELECT * FROM shop_products WHERE tenant_id = $1 AND is_active = TRUE', [tenantId]);
    }

    // --- Terminal Methods ---
    async getTerminals(tenantId: string) {
        console.log(`[ShopService] Fetching terminals for tenant: ${tenantId}`);
        const res = await this.db.query('SELECT * FROM shop_terminals WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
        console.log(`[ShopService] Found ${res.length} terminals in DB for tenant ${tenantId}`);
        return res;
    }

    async createTerminal(tenantId: string, data: any) {
        const res = await this.db.query(`
            INSERT INTO shop_terminals (
                tenant_id, branch_id, name, code, status, version, ip_address
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [
            tenantId,
            data.branchId,
            data.name,
            data.code || `T-${Date.now().toString().slice(-4)}`,
            data.status || 'Offline',
            data.version || '1.0.0',
            data.ipAddress || '0.0.0.0'
        ]);
        console.log(`[ShopService] Created terminal ${res[0].id} for tenant ${tenantId}`);
        return res[0].id;
    }

    async updateTerminal(tenantId: string, terminalId: string, data: any) {
        return this.db.query(`
            UPDATE shop_terminals
            SET 
                name = COALESCE($1, name),
                status = COALESCE($2, status),
                last_sync = COALESCE($3, last_sync),
                ip_address = COALESCE($4, ip_address),
                health_score = COALESCE($5, health_score),
                updated_at = NOW()
            WHERE id = $6 AND tenant_id = $7
        `, [
            data.name, data.status, data.last_sync,
            data.ip_address, data.health_score,
            terminalId, tenantId
        ]);
    }

    async deleteTerminal(tenantId: string, terminalId: string) {
        return this.db.query('DELETE FROM shop_terminals WHERE id = $1 AND tenant_id = $2', [terminalId, tenantId]);
    }

    async createProduct(tenantId: string, data: any) {
        return this.db.transaction(async (client) => {
            // 1. Resolve Category ID if name is provided (or use ID directly)
            let categoryId = data.category_id || null;
            if (categoryId && categoryId.length < 32) { // Heuristic: likely a name, not a UUID/ID
                const catRes = await client.query(
                    'SELECT id FROM categories WHERE tenant_id = $1 AND name ILIKE $2 LIMIT 1',
                    [tenantId, categoryId]
                );
                categoryId = catRes.rows.length > 0 ? catRes.rows[0].id : null;
            }

            // 2. Insert Product
            try {
                const res = await client.query(`
                    INSERT INTO shop_products (
                        tenant_id, name, sku, barcode, category_id, unit, 
                        cost_price, retail_price, tax_rate, reorder_point, is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING id
                `, [
                    tenantId,
                    data.name,
                    data.sku || `SKU-${Date.now()}`,
                    data.barcode || null,
                    categoryId,
                    data.unit || 'pcs',
                    data.cost_price || 0,
                    data.retail_price || 0,
                    data.tax_rate || 0,
                    data.reorder_point || 10,
                    true // is_active
                ]);
                return res.rows[0].id;
            } catch (err: any) {
                if (err.code === '23505') { // Unique constraint violation
                    throw new Error(`SKU "${data.sku}" already exists in the system.`);
                }
                console.error(`[ShopService] Error creating product:`, err);
                throw new Error(`Failed to create product: ${err.message}`);
            }
        });
    }

    async updateProduct(tenantId: string, productId: string, data: any) {
        return this.db.transaction(async (client) => {
            // 1. Update Product details
            try {
                await client.query(`
                    UPDATE shop_products 
                    SET name = $1, 
                        sku = $2, 
                        barcode = $3, 
                        category_id = $4, 
                        unit = $5, 
                        cost_price = $6, 
                        retail_price = $7, 
                        tax_rate = $8, 
                        reorder_point = $9,
                        is_active = $10,
                        updated_at = NOW()
                    WHERE id = $11 AND tenant_id = $12
                `, [
                    data.name,
                    data.sku,
                    data.barcode,
                    data.category_id || data.categoryId,
                    data.unit,
                    data.cost_price || data.cost,
                    data.retail_price || data.price,
                    data.tax_rate || data.taxRate,
                    data.reorder_point || data.reorderPoint,
                    data.is_active !== undefined ? data.is_active : true,
                    productId,
                    tenantId
                ]);
                return { success: true };
            } catch (err: any) {
                console.error(`[ShopService] Error updating product:`, err);
                throw new Error(`Failed to update product: ${err.message}`);
            }
        });
    }

    async getInventory(tenantId: string, branchId?: string) {
        let query = `
            SELECT i.*, p.name as product_name, p.sku, p.retail_price, w.name as warehouse_name 
            FROM shop_inventory i
            JOIN shop_products p ON i.product_id = p.id AND p.tenant_id = $1
            JOIN shop_warehouses w ON i.warehouse_id = w.id AND w.tenant_id = $1
            WHERE i.tenant_id = $1
        `;
        const params: any[] = [tenantId];

        // Note: Currently inventory is per warehouse, but we can link warehouse to branch if needed.
        // For simplicity, we fetch all.
        return this.db.query(query, params);
    }

    async getInventoryMovements(tenantId: string, productId?: string) {
        let query = `
            SELECT m.*, p.name as product_name, p.sku, w.name as warehouse_name
            FROM shop_inventory_movements m
            JOIN shop_products p ON m.product_id = p.id AND p.tenant_id = $1
            JOIN shop_warehouses w ON m.warehouse_id = w.id AND w.tenant_id = $1
            WHERE m.tenant_id = $1
        `;
        const params: any[] = [tenantId];

        if (productId) {
            query += ` AND m.product_id = $2`;
            params.push(productId);
        }

        query += ` ORDER BY m.created_at DESC`;
        return this.db.query(query, params);
    }

    async adjustInventory(tenantId: string, data: {
        productId: string,
        warehouseId: string,
        quantity: number,
        type: string,
        referenceId?: string,
        reason?: string,
        userId: string
    }) {
        return this.db.transaction(async (client) => {
            // 1. Update Inventory
            const updateRes = await client.query(`
                INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand, updated_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (tenant_id, product_id, warehouse_id) 
                DO UPDATE SET quantity_on_hand = shop_inventory.quantity_on_hand + $4, updated_at = NOW()
                RETURNING *
             `, [tenantId, data.productId, data.warehouseId, data.quantity]);

            // 2. Record Movement
            await client.query(`
                INSERT INTO shop_inventory_movements (
                    tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id, reason
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             `, [
                tenantId,
                data.productId,
                data.warehouseId,
                data.type,
                data.quantity,
                data.referenceId || `adj-${Date.now()}`,
                data.userId,
                data.reason
            ]);

            return updateRes.rows[0];
        });
    }

    // --- Sales Methods ---
    async createSale(tenantId: string, saleData: ShopSale) {
        return this.db.transaction(async (client) => {
            // 1. Insert Master Sale record
            const saleRes = await client.query(`
                INSERT INTO shop_sales (
                    tenant_id, branch_id, terminal_id, user_id, customer_id, 
                    loyalty_member_id, sale_number, subtotal, tax_total, 
                    discount_total, grand_total, total_paid, change_due,
                    payment_method, payment_details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id
            `, [
                tenantId, saleData.branchId, saleData.terminalId, saleData.userId,
                saleData.customerId, saleData.loyaltyMemberId, saleData.saleNumber,
                saleData.subtotal, saleData.taxTotal, saleData.discountTotal,
                saleData.grandTotal, saleData.totalPaid, saleData.changeDue,
                saleData.paymentMethod, JSON.stringify(saleData.paymentDetails)
            ]);

            const saleId = saleRes.rows[0].id;

            // 2. Insert Sale Items
            for (const item of saleData.items) {
                await client.query(`
                    INSERT INTO shop_sale_items (
                        tenant_id, sale_id, product_id, quantity, unit_price, 
                        tax_amount, discount_amount, subtotal
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    tenantId, saleId, item.productId, item.quantity,
                    item.unitPrice, item.taxAmount, item.discountAmount, item.subtotal
                ]);

                // 3. Update Inventory (Deduct stock from branch's default warehouse)
                // Finding default warehouse for branch (Simplified: find first warehouse for now)
                const whRes = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
                if (whRes.rows.length > 0) {
                    const warehouseId = whRes.rows[0].id;
                    await client.query(`
                        UPDATE shop_inventory 
                        SET quantity_on_hand = quantity_on_hand - $1 
                        WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4
                    `, [item.quantity, tenantId, item.productId, warehouseId]);

                    // 4. Record Inventory Movement
                    await client.query(`
                        INSERT INTO shop_inventory_movements (
                            tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id
                        ) VALUES ($1, $2, $3, 'Sale', $4, $5, $6)
                    `, [tenantId, item.productId, warehouseId, -item.quantity, saleId, saleData.userId]);
                }
            }

            // 5. Update Loyalty Points if applicable
            if (saleData.loyaltyMemberId) {
                // Logic: 1 point per 100 PKR (Simplified)
                const pointsEarned = Math.floor(saleData.grandTotal / 100);
                await client.query(`
                    UPDATE shop_loyalty_members 
                    SET points_balance = points_balance + $1, 
                        total_spend = total_spend + $2,
                        visit_count = visit_count + 1
                    WHERE id = $3
                `, [pointsEarned, saleData.grandTotal, saleData.loyaltyMemberId]);

                await client.query(`UPDATE shop_sales SET points_earned = $1 WHERE id = $2`, [pointsEarned, saleId]);
            }

            return saleId;
        });
    }

    async getSales(tenantId: string) {
        return this.db.query(`
            SELECT s.*, c.name as customer_name, b.name as branch_name 
            FROM shop_sales s
            LEFT JOIN contacts c ON s.customer_id = c.id AND c.tenant_id = $1
            LEFT JOIN shop_branches b ON s.branch_id = b.id AND b.tenant_id = $1
            WHERE s.tenant_id = $1 
            ORDER BY s.created_at DESC
        `, [tenantId]);
    }

    async createBranch(tenantId: string, data: any) {
        return this.db.transaction(async (client) => {
            const managerName = data.managerName || data.manager || 'Branch Manager';
            const contactNo = data.contactNo || data.contact || '';
            const branchCode = data.code || `BR-${Date.now().toString().slice(-4)}`;

            const res = await client.query(`
                INSERT INTO shop_branches (
                    tenant_id, name, code, type, region, 
                    manager_name, contact_no, timezone, open_time, close_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            `, [
                tenantId,
                data.name,
                branchCode,
                data.type || 'Express',
                data.region || '',
                managerName,
                contactNo,
                data.timezone || 'GMT+5',
                data.openTime || '09:00',
                data.closeTime || '21:00',
                data.location || ''
            ]);

            // Auto-create a default terminal and warehouse for the new branch?
            // Optional but helpful. Let's do it for user convenience.
            const branchId = res.rows[0].id;

            // Create default terminal and warehouse for the new branch
            // Create default terminal for the new branch
            await client.query(`
                 INSERT INTO shop_terminals (tenant_id, branch_id, name, code)
                 VALUES ($1, $2, 'Main Terminal', $3)
            `, [tenantId, branchId, `T-${branchCode}-01`]);

            // Create a corresponding warehouse for the branch
            await client.query(`
                INSERT INTO shop_warehouses (id, tenant_id, name, code, location)
                VALUES ($1, $2, $3, $4, $5)
            `, [branchId, tenantId, data.name, branchCode, data.location || 'Store']);

            return branchId;
        });
    }

    async updateBranch(tenantId: string, branchId: string, data: any) {
        return this.db.transaction(async (client) => {
            const managerName = data.managerName || data.manager;
            const contactNo = data.contactNo || data.contact;

            await client.query(`
                UPDATE shop_branches 
                SET 
                    name = COALESCE($1, name),
                    code = COALESCE($2, code),
                    type = COALESCE($3, type),
                    region = COALESCE($4, region),
                    manager_name = COALESCE($5, manager_name),
                    contact_no = COALESCE($6, contact_no),
                    timezone = COALESCE($7, timezone),
                    open_time = COALESCE($8, open_time),
                    close_time = COALESCE($9, close_time),
                    location = COALESCE($10, location),
                    status = COALESCE($11, status),
                    updated_at = NOW()
                WHERE id = $12 AND tenant_id = $13
            `, [
                data.name, data.code, data.type, data.region,
                managerName, contactNo, data.timezone,
                data.openTime, data.closeTime, data.location,
                data.status,
                branchId, tenantId
            ]);

            return branchId;
        });
    }

    // --- Loyalty Methods ---
    async getLoyaltyMembers(tenantId: string) {
        return this.db.query(`
            SELECT m.*, c.name as customer_name, c.contact_no, c.address as email
            FROM shop_loyalty_members m
            JOIN contacts c ON m.customer_id = c.id AND c.tenant_id = $1
            WHERE m.tenant_id = $1
        `, [tenantId]);
    }

    async createLoyaltyMember(tenantId: string, data: any) {
        return this.db.transaction(async (client) => {
            let customerId = data.customerId;

            // If no customerId provided, check/create contact
            if (!customerId) {
                // Check existing by phone
                if (data.phone) {
                    const existing = await client.query(
                        'SELECT id FROM contacts WHERE tenant_id = $1 AND contact_no = $2 LIMIT 1',
                        [tenantId, data.phone]
                    );
                    if (existing.rows.length > 0) {
                        customerId = existing.rows[0].id;
                    }
                }

                // If still no customerId, create new contact
                if (!customerId) {
                    const newContactId = `contact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    const newContact = await client.query(`
                        INSERT INTO contacts (id, tenant_id, name, type, contact_no, address)
                        VALUES ($1, $2, $3, 'Customer', $4, $5)
                        RETURNING id
                    `, [newContactId, tenantId, data.name, data.phone, data.email]);
                    customerId = newContact.rows[0].id;
                }
            }

            // Create Loyalty Member
            const res = await client.query(`
                INSERT INTO shop_loyalty_members (
                    tenant_id, customer_id, card_number, tier, status
                ) VALUES ($1, $2, $3, 'Silver', 'Active')
                RETURNING id
            `, [
                tenantId,
                customerId,
                data.cardNumber || `L-${Date.now()}`
            ]);

            return res.rows[0].id;
        });
    }

    async updateLoyaltyMember(tenantId: string, memberId: string, data: any) {
        return this.db.query(`
            UPDATE shop_loyalty_members
            SET 
                card_number = COALESCE($1, card_number),
                tier = COALESCE($2, tier),
                status = COALESCE($3, status),
                updated_at = NOW()
            WHERE id = $4 AND tenant_id = $5
            RETURNING *
        `, [data.cardNumber, data.tier, data.status, memberId, tenantId]);
    }

    async deleteLoyaltyMember(tenantId: string, memberId: string) {
        return this.db.query(
            'DELETE FROM shop_loyalty_members WHERE id = $1 AND tenant_id = $2',
            [memberId, tenantId]
        );
    }
    // --- Policy Methods ---
    async getPolicies(tenantId: string) {
        const res = await this.db.query('SELECT * FROM shop_policies WHERE tenant_id = $1', [tenantId]);
        if (res.length === 0) {
            // Create default policies if none exist
            const defaultRes = await this.db.query(`
                INSERT INTO shop_policies (tenant_id) VALUES ($1)
                RETURNING *
            `, [tenantId]);
            return defaultRes[0];
        }
        return res[0];
    }

    async updatePolicies(tenantId: string, data: any) {
        const res = await this.db.query(`
            INSERT INTO shop_policies (
                tenant_id, allow_negative_stock, universal_pricing, 
                tax_inclusive, default_tax_rate, require_manager_approval, 
                loyalty_redemption_ratio, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (tenant_id) DO UPDATE SET
                allow_negative_stock = EXCLUDED.allow_negative_stock,
                universal_pricing = EXCLUDED.universal_pricing,
                tax_inclusive = EXCLUDED.tax_inclusive,
                default_tax_rate = EXCLUDED.default_tax_rate,
                require_manager_approval = EXCLUDED.require_manager_approval,
                loyalty_redemption_ratio = EXCLUDED.loyalty_redemption_ratio,
                updated_at = NOW()
            RETURNING *
        `, [
            tenantId,
            data.allowNegativeStock,
            data.universalPricing,
            data.taxInclusive,
            data.defaultTaxRate,
            data.requireManagerApproval,
            data.loyaltyRedemptionRatio
        ]);
        return res[0];
    }

    // --- Shop product categories (uses categories table with type = 'product') ---
    async getShopCategories(tenantId: string) {
        const rows = await this.db.query(
            `SELECT id, name, type, created_at FROM categories 
             WHERE tenant_id = $1 AND type = 'product' AND deleted_at IS NULL
             ORDER BY name`,
            [tenantId]
        );
        return rows;
    }

    async createShopCategory(tenantId: string, data: { name: string }) {
        const id = `shop_cat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        await this.db.query(
            `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, created_at, updated_at)
             VALUES ($1, $2, $3, 'product', false, false, NOW(), NOW())`,
            [id, tenantId, data.name]
        );
        return id;
    }

    async updateShopCategory(tenantId: string, categoryId: string, data: { name: string }) {
        await this.db.query(
            `UPDATE categories SET name = $1, updated_at = NOW() 
             WHERE id = $2 AND tenant_id = $3 AND type = 'product'`,
            [data.name, categoryId, tenantId]
        );
    }

    async deleteShopCategory(tenantId: string, categoryId: string) {
        await this.db.query(
            `UPDATE shop_products SET category_id = NULL WHERE tenant_id = $1 AND category_id = $2`,
            [tenantId, categoryId]
        );
        await this.db.query(
            `UPDATE categories SET deleted_at = NOW(), updated_at = NOW() 
             WHERE id = $1 AND tenant_id = $2 AND type = 'product'`,
            [categoryId, tenantId]
        );
    }
}

let shopServiceInstance: ShopService | null = null;
export function getShopService(): ShopService {
    if (!shopServiceInstance) {
        shopServiceInstance = new ShopService();
    }
    return shopServiceInstance;
}
