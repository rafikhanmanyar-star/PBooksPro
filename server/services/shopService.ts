
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

    async getInventory(tenantId: string, branchId?: string) {
        let query = `
            SELECT i.*, p.name as product_name, p.sku, p.retail_price, w.name as warehouse_name 
            FROM shop_inventory i
            JOIN shop_products p ON i.product_id = p.id
            JOIN shop_warehouses w ON i.warehouse_id = w.id
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
            LEFT JOIN contacts c ON s.customer_id = c.id
            LEFT JOIN shop_branches b ON s.branch_id = b.id
            WHERE s.tenant_id = $1 
            ORDER BY s.created_at DESC
        `, [tenantId]);
    }

    // --- Loyalty Methods ---
    async getLoyaltyMembers(tenantId: string) {
        return this.db.query(`
            SELECT m.*, c.name as customer_name, c.contact_no
            FROM shop_loyalty_members m
            JOIN contacts c ON m.customer_id = c.id
            WHERE m.tenant_id = $1
        `, [tenantId]);
    }
}

let shopServiceInstance: ShopService | null = null;
export function getShopService(): ShopService {
    if (!shopServiceInstance) {
        shopServiceInstance = new ShopService();
    }
    return shopServiceInstance;
}
