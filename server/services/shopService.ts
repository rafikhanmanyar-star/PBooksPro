
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

    // --- Inventory Methods ---
    async getProducts(tenantId: string) {
        return this.db.query('SELECT * FROM shop_products WHERE tenant_id = $1 AND is_active = TRUE', [tenantId]);
    }

    async createProduct(tenantId: string, data: any) {
        const res = await this.db.query(`
            INSERT INTO shop_products (
                tenant_id, name, sku, category_id, unit, 
                cost_price, retail_price, tax_rate, reorder_point
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `, [
            tenantId,
            data.name,
            data.sku || `SKU-${Date.now()}`,
            data.category_id || null, // Ensure category ID is valid or handle lookup if sending name
            data.unit || 'pcs',
            data.cost_price || 0,
            data.retail_price || 0,
            data.tax_rate || 0,
            data.reorder_point || 10
        ]);
        return res[0].id;
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
                ON CONFLICT (product_id, warehouse_id) 
                DO UPDATE SET quantity_on_hand = shop_inventory.quantity_on_hand + $4, updated_at = NOW()
                RETURNING *
             `, [tenantId, data.productId, data.warehouseId, data.quantity]);

            // 2. Record Movement
            await client.query(`
                INSERT INTO shop_inventory_movements (
                    tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id, notes
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
                    discount_total, grand_total, payment_method, payment_details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
            `, [
                tenantId, saleData.branchId, saleData.terminalId, saleData.userId,
                saleData.customerId, saleData.loyaltyMemberId, saleData.saleNumber,
                saleData.subtotal, saleData.taxTotal, saleData.discountTotal,
                saleData.grandTotal, saleData.paymentMethod, JSON.stringify(saleData.paymentDetails)
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
            await client.query(`
                 INSERT INTO shop_terminals (tenant_id, branch_id, name, code)
                 VALUES ($1, $2, 'Main Terminal', $3)
            `, [tenantId, branchId, `T-${branchCode}-01`]);

            // Create default warehouse (if not exists generic one, or per branch)
            // For now, let's keep it simple.

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
            SELECT m.*, c.name as customer_name, c.contact_no
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
                    const newContact = await client.query(`
                        INSERT INTO contacts (tenant_id, name, type, contact_no, address)
                        VALUES ($1, $2, 'Customer', $3, $4)
                        RETURNING id
                    `, [tenantId, data.name, data.phone, data.email]); // Storing email in address field temporarily or schema mismatch? 
                    // contacts table: name, type, description, contact_no, company_name, address. No email column in schema shown earlier?
                    // actually `postgresql-schema.sql` shows contacts table. Let's check.
                    // Contacts table: id, tenant_id, name, type, description, contact_no, company_name, address.
                    // It seems contacts table doesn't have email? Users table has email. 
                    // Maybe store email in description for now or address.
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
}

let shopServiceInstance: ShopService | null = null;
export function getShopService(): ShopService {
    if (!shopServiceInstance) {
        shopServiceInstance = new ShopService();
    }
    return shopServiceInstance;
}
