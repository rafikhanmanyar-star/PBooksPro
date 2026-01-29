import express from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = express.Router();
const getDb = () => getDatabaseService();

// ============================================================================
// SHOP CONFIGURATION
// ============================================================================

router.get('/config', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const rows = await db.query(
      'SELECT * FROM shop_config WHERE tenant_id = $1',
      [req.tenantId]
    );
    
    let config = rows[0];
    
    // Create default config if not exists
    if (!config) {
      const id = `shop_config_${req.tenantId}`;
      await db.query(
        `INSERT INTO shop_config (
          id, tenant_id, shop_name, default_profit_margin_percent,
          tax_enabled, tax_percent, tax_name, invoice_prefix,
          show_stock_quantity, low_stock_threshold
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [id, req.tenantId, 'My Shop', 20.00, false, 0.00, 'Tax', 'INV', true, 10]
      );
      
      const newRows = await db.query(
        'SELECT * FROM shop_config WHERE id = $1',
        [id]
      );
      config = newRows[0];
    }
    
    res.json(normalizeShopConfig(config));
  } catch (error) {
    console.error('Error fetching shop config:', error);
    res.status(500).json({ error: 'Failed to fetch shop configuration' });
  }
});

router.post('/config', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const config = req.body;
    
    const id = `shop_config_${req.tenantId}`;
    
    const result = await db.query(
      `INSERT INTO shop_config (
        id, tenant_id, shop_name, shop_address, shop_phone, shop_email,
        default_profit_margin_percent, tax_enabled, tax_percent, tax_name,
        invoice_prefix, invoice_footer_text, show_stock_quantity, low_stock_threshold,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (id) DO UPDATE SET
        shop_name = $3,
        shop_address = $4,
        shop_phone = $5,
        shop_email = $6,
        default_profit_margin_percent = $7,
        tax_enabled = $8,
        tax_percent = $9,
        tax_name = $10,
        invoice_prefix = $11,
        invoice_footer_text = $12,
        show_stock_quantity = $13,
        low_stock_threshold = $14,
        updated_at = NOW()
      RETURNING *`,
      [
        id, req.tenantId,
        config.shopName, config.shopAddress, config.shopPhone, config.shopEmail,
        config.defaultProfitMarginPercent, config.taxEnabled, config.taxPercent, config.taxName,
        config.invoicePrefix, config.invoiceFooterText, config.showStockQuantity, config.lowStockThreshold
      ]
    );
    
    res.json(normalizeShopConfig(result[0]));
  } catch (error) {
    console.error('Error saving shop config:', error);
    res.status(500).json({ error: 'Failed to save shop configuration' });
  }
});

// ============================================================================
// SHOP SALES
// ============================================================================

router.get('/sales', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;
    
    let query = 'SELECT * FROM shop_sales WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    
    if (startDate && endDate) {
      query += ' AND sale_date BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    }
    
    query += ' ORDER BY sale_date DESC, created_at DESC';
    
    const rows = await db.query(query, params);
    res.json(rows.map(normalizeShopSale));
  } catch (error) {
    console.error('Error fetching shop sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

router.get('/sales/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    
    const saleRows = await db.query(
      'SELECT * FROM shop_sales WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (saleRows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    const itemRows = await db.query(
      'SELECT * FROM shop_sale_items WHERE sale_id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    const sale = normalizeShopSale(saleRows[0]);
    sale.items = itemRows.map(normalizeShopSaleItem);
    
    res.json(sale);
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

router.post('/sales', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { sale, items } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Sale must have at least one item' });
    }
    
    const result = await db.transaction(async (client) => {
      // Generate sale ID and invoice number
      const saleId = sale.id || `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get next invoice number if not provided
      let invoiceNumber = sale.invoiceNumber;
      if (!invoiceNumber) {
        const countRows = await client.query(
          'SELECT COUNT(*) as count FROM shop_sales WHERE tenant_id = $1',
          [req.tenantId]
        );
        const count = parseInt(countRows.rows[0].count) + 1;
        const config = await client.query(
          'SELECT invoice_prefix FROM shop_config WHERE tenant_id = $1',
          [req.tenantId]
        );
        const prefix = config.rows[0]?.invoice_prefix || 'INV';
        invoiceNumber = `${prefix}-${String(count).padStart(5, '0')}`;
      }
      
      // Insert sale
      const saleResult = await client.query(
        `INSERT INTO shop_sales (
          id, tenant_id, user_id, invoice_number, sale_date,
          customer_id, customer_name, customer_phone,
          subtotal, tax_amount, discount_amount, total_amount,
          paid_amount, payment_method, payment_account_id, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          saleId, req.tenantId, req.user?.userId, invoiceNumber, sale.saleDate,
          sale.customerId, sale.customerName, sale.customerPhone,
          sale.subtotal, sale.taxAmount, sale.discountAmount, sale.totalAmount,
          sale.paidAmount, sale.paymentMethod, sale.paymentAccountId, sale.status || 'Completed', sale.notes
        ]
      );
      
      // Insert sale items and update inventory
      const savedItems = [];
      for (const item of items) {
        const itemId = `sale_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Insert sale item
        const itemResult = await client.query(
          `INSERT INTO shop_sale_items (
            id, tenant_id, sale_id, inventory_item_id, item_name,
            quantity, cost_price, selling_price, profit_margin_percent,
            line_total, line_profit
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *`,
          [
            itemId, req.tenantId, saleId, item.inventoryItemId, item.itemName,
            item.quantity, item.costPrice, item.sellingPrice, item.profitMarginPercent,
            item.lineTotal, item.lineProfit
          ]
        );
        
        // Deduct from inventory stock
        await client.query(
          `UPDATE inventory_stock 
           SET current_quantity = current_quantity - $1, updated_at = NOW()
           WHERE inventory_item_id = $2 AND tenant_id = $3`,
          [item.quantity, item.inventoryItemId, req.tenantId]
        );
        
        savedItems.push(itemResult.rows[0]);
      }
      
      // Create accounting transaction if payment received
      if (sale.paidAmount > 0 && sale.paymentAccountId) {
        const transactionId = `txn_sale_${saleId}`;
        await client.query(
          `INSERT INTO transactions (
            id, tenant_id, user_id, type, amount, date, description,
            account_id, category_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING`,
          [
            transactionId, req.tenantId, req.user?.userId, 'INCOME',
            sale.paidAmount, sale.saleDate, `Shop Sale - ${invoiceNumber}`,
            sale.paymentAccountId, null // You can link to a sales income category
          ]
        );
        
        // Update account balance
        await client.query(
          `UPDATE accounts 
           SET balance = balance + $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [sale.paidAmount, sale.paymentAccountId, req.tenantId]
        );
      }
      
      return {
        sale: saleResult.rows[0],
        items: savedItems
      };
    });
    
    // Emit WebSocket event
    emitToTenant(req.tenantId!, WS_EVENTS.DATA_UPDATED, {
      type: 'shop_sale',
      action: 'create',
      data: normalizeShopSale(result.sale)
    });
    
    res.json({
      sale: normalizeShopSale(result.sale),
      items: result.items.map(normalizeShopSaleItem)
    });
  } catch (error: any) {
    console.error('Error creating sale:', error);
    res.status(500).json({ error: 'Failed to create sale', message: error.message });
  }
});

// ============================================================================
// REPORTS & ANALYTICS
// ============================================================================

router.get('/reports/summary', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    const params: any[] = [req.tenantId];
    
    if (startDate && endDate) {
      dateFilter = ' AND sale_date BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    }
    
    // Sales summary
    const salesRows = await db.query(
      `SELECT 
        COUNT(*) as total_sales,
        SUM(subtotal) as total_revenue,
        SUM(total_amount) as total_with_tax,
        AVG(total_amount) as average_sale
       FROM shop_sales 
       WHERE tenant_id = $1 AND status = 'Completed'${dateFilter}`,
      params
    );
    
    // Profit summary
    const profitRows = await db.query(
      `SELECT 
        SUM(si.line_profit) as total_profit,
        SUM(si.quantity) as total_items_sold
       FROM shop_sale_items si
       JOIN shop_sales s ON si.sale_id = s.id
       WHERE si.tenant_id = $1 AND s.status = 'Completed'${dateFilter}`,
      params
    );
    
    // Top selling items
    const topItemsRows = await db.query(
      `SELECT 
        si.inventory_item_id,
        si.item_name,
        SUM(si.quantity) as total_quantity,
        SUM(si.line_total) as total_revenue,
        SUM(si.line_profit) as total_profit
       FROM shop_sale_items si
       JOIN shop_sales s ON si.sale_id = s.id
       WHERE si.tenant_id = $1 AND s.status = 'Completed'${dateFilter}
       GROUP BY si.inventory_item_id, si.item_name
       ORDER BY total_quantity DESC
       LIMIT 10`,
      params
    );
    
    res.json({
      sales: {
        totalSales: parseInt(salesRows[0].total_sales) || 0,
        totalRevenue: parseFloat(salesRows[0].total_revenue) || 0,
        totalWithTax: parseFloat(salesRows[0].total_with_tax) || 0,
        averageSale: parseFloat(salesRows[0].average_sale) || 0,
      },
      profit: {
        totalProfit: parseFloat(profitRows[0].total_profit) || 0,
        totalItemsSold: parseInt(profitRows[0].total_items_sold) || 0,
      },
      topSellingItems: topItemsRows.map(row => ({
        inventoryItemId: row.inventory_item_id,
        itemName: row.item_name,
        totalQuantity: parseFloat(row.total_quantity),
        totalRevenue: parseFloat(row.total_revenue),
        totalProfit: parseFloat(row.total_profit),
      }))
    });
  } catch (error) {
    console.error('Error fetching shop reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeShopConfig(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    shopName: row.shop_name,
    shopAddress: row.shop_address,
    shopPhone: row.shop_phone,
    shopEmail: row.shop_email,
    defaultProfitMarginPercent: parseFloat(row.default_profit_margin_percent),
    taxEnabled: Boolean(row.tax_enabled),
    taxPercent: parseFloat(row.tax_percent),
    taxName: row.tax_name,
    invoicePrefix: row.invoice_prefix,
    invoiceFooterText: row.invoice_footer_text,
    showStockQuantity: Boolean(row.show_stock_quantity),
    lowStockThreshold: parseInt(row.low_stock_threshold),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeShopSale(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    invoiceNumber: row.invoice_number,
    saleDate: row.sale_date ? String(row.sale_date).split('T')[0] : '',
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    subtotal: parseFloat(row.subtotal),
    taxAmount: parseFloat(row.tax_amount),
    discountAmount: parseFloat(row.discount_amount),
    totalAmount: parseFloat(row.total_amount),
    paidAmount: parseFloat(row.paid_amount),
    paymentMethod: row.payment_method,
    paymentAccountId: row.payment_account_id,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeShopSaleItem(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    saleId: row.sale_id,
    inventoryItemId: row.inventory_item_id,
    itemName: row.item_name,
    quantity: parseFloat(row.quantity),
    costPrice: parseFloat(row.cost_price),
    sellingPrice: parseFloat(row.selling_price),
    profitMarginPercent: parseFloat(row.profit_margin_percent),
    lineTotal: parseFloat(row.line_total),
    lineProfit: parseFloat(row.line_profit),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
