import express from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = express.Router();

// Helper to get database
const getDb = () => getDatabaseService();

/** Normalize DB row (snake_case) to client shape (camelCase) for purchase bills. */
function normalizePurchaseBill(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    billNumber: row.bill_number,
    vendorId: row.vendor_id,
    billDate: row.bill_date != null ? String(row.bill_date).split('T')[0] : '',
    dueDate: row.due_date != null ? String(row.due_date).split('T')[0] : undefined,
    description: row.description ?? undefined,
    totalAmount: typeof row.total_amount === 'number' ? row.total_amount : parseFloat(String(row.total_amount ?? '0')),
    paidAmount: typeof row.paid_amount === 'number' ? row.paid_amount : parseFloat(String(row.paid_amount ?? '0')),
    status: row.status ?? 'Unpaid',
    deliveryStatus: row.delivery_status ?? 'Pending',
    itemsReceived: Boolean(row.items_received),
    itemsReceivedDate: row.items_received_date != null ? String(row.items_received_date).split('T')[0] : undefined,
    warehouseId: row.warehouse_id ?? undefined,
    projectId: row.project_id ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

/** Normalize DB row (snake_case) to client shape (camelCase) for purchase bill items. */
function normalizePurchaseBillItem(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    purchaseBillId: row.purchase_bill_id,
    inventoryItemId: row.inventory_item_id,
    itemName: row.item_name,
    description: row.description ?? undefined,
    quantity: typeof row.quantity === 'number' ? row.quantity : parseFloat(String(row.quantity ?? '0')),
    receivedQuantity: typeof row.received_quantity === 'number' ? row.received_quantity : parseFloat(String(row.received_quantity ?? '0')),
    pricePerUnit: typeof row.price_per_unit === 'number' ? row.price_per_unit : parseFloat(String(row.price_per_unit ?? '0')),
    totalAmount: typeof row.total_amount === 'number' ? row.total_amount : parseFloat(String(row.total_amount ?? '0')),
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

// Helper to emit WebSocket events (using websocketHelper)
// emitToTenant is already imported from websocketHelper

// ============================================================================
// PURCHASE BILLS CRUD
// ============================================================================

// GET all purchase bills for tenant
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const rows = await db.query(
      `SELECT * FROM purchase_bills WHERE tenant_id = $1 ORDER BY bill_date DESC`,
      [req.tenantId]
    );
    const bills = (rows || []).map(normalizePurchaseBill);
    res.json(bills);
  } catch (error) {
    console.error('Error fetching purchase bills:', error);
    res.status(500).json({ error: 'Failed to fetch purchase bills' });
  }
});

// GET single purchase bill with items
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const billRows = await db.query(
      'SELECT * FROM purchase_bills WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    const bill = billRows[0];
    
    if (!bill) {
      return res.status(404).json({ error: 'Purchase bill not found' });
    }
    
    const itemRows = await db.query(
      'SELECT * FROM purchase_bill_items WHERE purchase_bill_id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    const items = (itemRows || []).map(normalizePurchaseBillItem);
    res.json({ ...normalizePurchaseBill(bill), items });
  } catch (error) {
    console.error('Error fetching purchase bill:', error);
    res.status(500).json({ error: 'Failed to fetch purchase bill' });
  }
});

// POST create/update purchase bill (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const bill = req.body;
    
    // Validate required fields
    if (!bill.billNumber || !bill.vendorId || !bill.billDate) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Bill number, vendor, and date are required'
      });
    }
    
    // Generate ID if not provided
    const billId = bill.id || `pbill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if bill exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM purchase_bills WHERE id = $1 AND tenant_id = $2',
      [billId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Check if bill number already exists for this tenant (only for new bills or when bill number is being changed)
    if (!isUpdate || (isUpdate && existing[0].bill_number !== bill.billNumber)) {
      const duplicateBill = await db.query(
        'SELECT id FROM purchase_bills WHERE bill_number = $1 AND tenant_id = $2 AND id != $3',
        [bill.billNumber, req.tenantId, billId]
      );
      
      if (duplicateBill.length > 0) {
        return res.status(400).json({ 
          error: 'Bill number already exists',
          message: `A purchase bill with number "${bill.billNumber}" already exists for this organization.`
        });
      }
    }
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO purchase_bills (
        id, tenant_id, user_id, bill_number, vendor_id, bill_date, due_date,
        description, total_amount, paid_amount, status, items_received,
        items_received_date, warehouse_id, project_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                COALESCE((SELECT created_at FROM purchase_bills WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        bill_number = EXCLUDED.bill_number,
        vendor_id = EXCLUDED.vendor_id,
        bill_date = EXCLUDED.bill_date,
        due_date = EXCLUDED.due_date,
        description = EXCLUDED.description,
        total_amount = EXCLUDED.total_amount,
        paid_amount = EXCLUDED.paid_amount,
        status = EXCLUDED.status,
        items_received = EXCLUDED.items_received,
        items_received_date = EXCLUDED.items_received_date,
        warehouse_id = EXCLUDED.warehouse_id,
        project_id = EXCLUDED.project_id,
        user_id = EXCLUDED.user_id,
        updated_at = NOW()
      RETURNING *`,
      [
        billId,
        req.tenantId,
        req.user?.userId || null,
        bill.billNumber,
        bill.vendorId,
        bill.billDate,
        bill.dueDate || null,
        bill.description || null,
        bill.totalAmount || 0,
        bill.paidAmount || 0,
        bill.status || 'Unpaid',
        bill.itemsReceived || false,
        bill.itemsReceivedDate || null,
        bill.warehouseId || null,
        bill.projectId || null
      ]
    );
    
    const saved = result[0];
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.PURCHASE_BILL_UPDATED : WS_EVENTS.PURCHASE_BILL_CREATED, {
      bill: saved,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.json(normalizePurchaseBill(saved));
  } catch (error) {
    console.error('Error saving purchase bill:', error);
    res.status(500).json({ error: 'Failed to save purchase bill' });
  }
});

// DELETE purchase bill
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    
    // Check if bill exists and has no payments
    const billResult = await db.query(
      'SELECT paid_amount FROM purchase_bills WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    const bill = billResult[0];
    
    if (!bill) {
      return res.status(404).json({ error: 'Purchase bill not found' });
    }
    
    if (parseFloat(bill.paid_amount) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete bill with payments',
        message: 'This bill has recorded payments. Please delete payments first.'
      });
    }
    
    // Delete bill (items will cascade)
    await db.query(
      'DELETE FROM purchase_bills WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    // Emit WebSocket event
    emitToTenant(req.tenantId!, WS_EVENTS.PURCHASE_BILL_DELETED, {
      billId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting purchase bill:', error);
    res.status(500).json({ error: 'Failed to delete purchase bill' });
  }
});

// ============================================================================
// PURCHASE BILL ITEMS CRUD
// ============================================================================

// GET all items for a bill
router.get('/:billId/items', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const rows = await db.query(
      'SELECT * FROM purchase_bill_items WHERE purchase_bill_id = $1 AND tenant_id = $2',
      [req.params.billId, req.tenantId]
    );
    const items = (rows || []).map(normalizePurchaseBillItem);
    res.json(items);
  } catch (error) {
    console.error('Error fetching purchase bill items:', error);
    res.status(500).json({ error: 'Failed to fetch purchase bill items' });
  }
});

// POST create/update purchase bill item (upsert)
router.post('/:billId/items', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const item = req.body;
    
    // Validate required fields
    if (!item.inventoryItemId || !item.quantity || !item.pricePerUnit) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Inventory item, quantity, and price are required'
      });
    }
    
    // Verify inventory item exists
    const inventoryItemResult = await db.query(
      'SELECT id, name FROM inventory_items WHERE id = $1 AND tenant_id = $2',
      [item.inventoryItemId, req.tenantId]
    );
    const inventoryItem = inventoryItemResult[0];
    
    if (!inventoryItem) {
      console.error(`Inventory item not found: ${item.inventoryItemId} for tenant ${req.tenantId}`);
      return res.status(400).json({ 
        error: 'Invalid inventory item',
        message: 'The selected inventory item does not exist. Please refresh and try again.'
      });
    }
    
    // Verify bill exists
    const billResult = await db.query(
      'SELECT id FROM purchase_bills WHERE id = $1 AND tenant_id = $2',
      [req.params.billId, req.tenantId]
    );
    const bill = billResult[0];
    
    if (!bill) {
      return res.status(404).json({ 
        error: 'Bill not found',
        message: 'Purchase bill not found'
      });
    }
    
    // Generate ID if not provided
    const itemId = item.id || `pitem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate total
    const totalAmount = parseFloat(item.quantity) * parseFloat(item.pricePerUnit);
    
    // Use item name from inventory if not provided
    const itemName = item.itemName || inventoryItem.name;
    
    // Upsert item
    const result = await db.query(
      `INSERT INTO purchase_bill_items (
        id, tenant_id, purchase_bill_id, inventory_item_id, item_name,
        description, quantity, received_quantity, price_per_unit, total_amount, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                COALESCE((SELECT created_at FROM purchase_bill_items WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        inventory_item_id = EXCLUDED.inventory_item_id,
        item_name = EXCLUDED.item_name,
        description = EXCLUDED.description,
        quantity = EXCLUDED.quantity,
        received_quantity = COALESCE(EXCLUDED.received_quantity, purchase_bill_items.received_quantity),
        price_per_unit = EXCLUDED.price_per_unit,
        total_amount = EXCLUDED.total_amount,
        updated_at = NOW()
      RETURNING *`,
      [
        itemId,
        req.tenantId,
        req.params.billId,
        item.inventoryItemId,
        itemName,
        item.description || null,
        item.quantity,
        item.receivedQuantity || 0,
        item.pricePerUnit,
        totalAmount
      ]
    );
    
    // Update bill total
    await updateBillTotal(db, req.params.billId, req.tenantId!);
    
    // Emit WebSocket event
    emitToTenant(req.tenantId!, WS_EVENTS.PURCHASE_BILL_ITEM_UPDATED, {
      item: result[0],
      billId: req.params.billId,
      userId: req.user?.userId,
    });
    
    res.json(normalizePurchaseBillItem(result[0]));
  } catch (error: any) {
    console.error('Error saving purchase bill item:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table
    });
    
    // Provide more specific error messages
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: 'Invalid reference',
        message: 'The inventory item or bill reference is invalid. Please refresh the page and try again.',
        detail: error.detail
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to save purchase bill item',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// DELETE purchase bill item
router.delete('/:billId/items/:itemId', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    
    // Delete item
    await db.query(
      'DELETE FROM purchase_bill_items WHERE id = $1 AND tenant_id = $2',
      [req.params.itemId, req.tenantId]
    );
    
    // Update bill total
    await updateBillTotal(db, req.params.billId, req.tenantId!);
    
    // Emit WebSocket event
    emitToTenant(req.tenantId!, WS_EVENTS.PURCHASE_BILL_ITEM_DELETED, {
      itemId: req.params.itemId,
      billId: req.params.billId,
      userId: req.user?.userId,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting purchase bill item:', error);
    res.status(500).json({ error: 'Failed to delete purchase bill item' });
  }
});

// ============================================================================
// PURCHASE BILL PAYMENTS
// ============================================================================

// POST pay bill - Create payment and update bill status
router.post('/:id/pay', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const billId = req.params.id;
    const { amount, paymentAccountId, paymentDate, description } = req.body;
    
    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Payment amount must be greater than 0'
      });
    }
    
    if (!paymentAccountId) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Payment account is required'
      });
    }
    
    const paymentAmount = parseFloat(amount);
    const payDate = paymentDate || new Date().toISOString().split('T')[0];
    
    // Process payment atomically within a transaction
    const result = await db.transaction(async (client) => {
      // Lock the bill row
      const billLock = await client.query(
        'SELECT * FROM purchase_bills WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT',
        [billId, req.tenantId]
      );
      
      if (billLock.rows.length === 0) {
        throw { code: 'BILL_NOT_FOUND', message: 'Purchase bill not found' };
      }
      
      const bill = billLock.rows[0];
      const billAmount = parseFloat(bill.total_amount);
      const currentPaidAmount = parseFloat(bill.paid_amount || '0');
      
      // Validate overpayment
      if (currentPaidAmount + paymentAmount > billAmount + 0.01) {
        throw {
          code: 'PAYMENT_OVERPAYMENT',
          message: `Payment would exceed bill amount. Remaining: ${(billAmount - currentPaidAmount).toFixed(2)}`,
          remainingBalance: billAmount - currentPaidAmount
        };
      }
      
      // Create transaction in main ledger
      const transactionId = `txn-pbill-${Date.now()}-${billId}`;
      const transactionDescription = description || `Purchase Bill Payment: #${bill.bill_number}`;
      
      // Get vendor and inventory items for expense allocation
      const items = await client.query(
        `SELECT pbi.*, ii.expense_category_id 
         FROM purchase_bill_items pbi
         LEFT JOIN inventory_items ii ON pbi.inventory_item_id = ii.id
         WHERE pbi.purchase_bill_id = $1 AND pbi.tenant_id = $2`,
        [billId, req.tenantId]
      );
      
      // Create expense transaction
      await client.query(
        `INSERT INTO transactions (
          id, tenant_id, user_id, type, amount, date, description,
          account_id, contact_id, project_id, bill_id, created_at, updated_at
        ) VALUES ($1, $2, $3, 'Expense', $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [
          transactionId,
          req.tenantId,
          req.user?.userId || null,
          paymentAmount,
          payDate,
          transactionDescription,
          paymentAccountId,
          bill.vendor_id,
          bill.project_id || null,
          billId
        ]
      );
      
      // Create payment record
      const paymentId = `ppay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const payment = await client.query(
        `INSERT INTO purchase_bill_payments (
          id, tenant_id, purchase_bill_id, amount, payment_date,
          payment_account_id, description, transaction_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
          paymentId,
          req.tenantId,
          billId,
          paymentAmount,
          payDate,
          paymentAccountId,
          description || null,
          transactionId
        ]
      );
      
      // Update bill paid amount and status
      const newPaidAmount = currentPaidAmount + paymentAmount;
      const newStatus = newPaidAmount >= billAmount - 0.01 
        ? 'Paid' 
        : 'Partially Paid';
      
      const updatedBill = await client.query(
        `UPDATE purchase_bills 
         SET paid_amount = $1, status = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4
         RETURNING *`,
        [newPaidAmount, newStatus, billId, req.tenantId]
      );
      
      return {
        payment: payment.rows[0],
        bill: updatedBill.rows[0],
        transactionId
      };
    });
    
    // Emit WebSocket events
    emitToTenant(req.tenantId!, WS_EVENTS.PURCHASE_BILL_PAYMENT_CREATED, {
      payment: result.payment,
      bill: result.bill,
      userId: req.user?.userId,
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error processing payment:', error);
    if (error.code === 'BILL_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    if (error.code === 'PAYMENT_OVERPAYMENT') {
      return res.status(400).json({ 
        error: error.message,
        remainingBalance: error.remainingBalance
      });
    }
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// GET payments for a bill
router.get('/:id/payments', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const payments = await db.query(
      'SELECT * FROM purchase_bill_payments WHERE purchase_bill_id = $1 AND tenant_id = $2 ORDER BY payment_date DESC',
      [req.params.id, req.tenantId]
    );
    res.json(payments);
  } catch (error) {
    console.error('Error fetching purchase bill payments:', error);
    res.status(500).json({ error: 'Failed to fetch purchase bill payments' });
  }
});

// POST receive items - Update received quantities and inventory stock
router.post('/:id/receive', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const billId = req.params.id;
    const { items } = req.body as { items?: Array<{ itemId: string; receivedQuantity: string | number }> };
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Items array is required and must contain at least one item'
      });
    }
    
    // Verify bill exists and is paid
    const billResult = await db.query(
      'SELECT * FROM purchase_bills WHERE id = $1 AND tenant_id = $2',
      [billId, req.tenantId]
    );
    const bill = billResult[0];
    
    if (!bill) {
      return res.status(404).json({ 
        error: 'Purchase bill not found',
        message: 'Purchase bill not found'
      });
    }
    
    if (bill.status !== 'Paid') {
      return res.status(400).json({ 
        error: 'Bill must be paid',
        message: 'Items can only be received after the bill is paid'
      });
    }
    
    // Process receiving within a transaction
    const result = await db.transaction(async (client) => {
      const updatedItems: any[] = [];
      
      // Update received quantities for each item
      for (const item of items) {
        // Verify item belongs to this bill
        const billItemResult = await client.query(
          'SELECT * FROM purchase_bill_items WHERE id = $1 AND purchase_bill_id = $2 AND tenant_id = $3',
          [item.itemId, billId, req.tenantId]
        );
        const billItem = billItemResult.rows[0];
        
        if (!billItem) {
          throw { 
            code: 'ITEM_NOT_FOUND', 
            message: `Item with ID ${item.itemId} not found in this bill. Please refresh and try again.` 
          };
        }
        
        const receivedQty = parseFloat(String(item.receivedQuantity)) || 0;
        const orderedQty = parseFloat(billItem.quantity);
        const currentReceivedQty = parseFloat(billItem.received_quantity || '0');
        
        // Validate received quantity
        if (receivedQty < 0) {
          throw { 
            code: 'INVALID_QUANTITY', 
            message: `Received quantity cannot be negative` 
          };
        }
        
        if (receivedQty > orderedQty) {
          throw { 
            code: 'INVALID_QUANTITY', 
            message: `Received quantity (${receivedQty}) cannot exceed ordered quantity (${orderedQty})` 
          };
        }
        
        // Calculate the quantity to add to inventory (difference between new and current received)
        const qtyToAdd = receivedQty - currentReceivedQty;
        
        // Update received quantity
        const updatedResult = await client.query(
          `UPDATE purchase_bill_items 
           SET received_quantity = $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3
           RETURNING *`,
          [receivedQty, item.itemId, req.tenantId]
        );
        const updated = updatedResult.rows[0];
        
        updatedItems.push(updated);
        
        // Update inventory stock if quantity to add > 0
        if (qtyToAdd > 0) {
          const inventoryItemId = billItem.inventory_item_id;
          const pricePerUnit = parseFloat(billItem.price_per_unit);
          
          // Verify inventory item exists
          const inventoryItemResult = await client.query(
            'SELECT id FROM inventory_items WHERE id = $1 AND tenant_id = $2',
            [inventoryItemId, req.tenantId]
          );
          const inventoryItem = inventoryItemResult.rows[0];
          
          if (!inventoryItem) {
            throw { 
              code: 'INVENTORY_ITEM_NOT_FOUND', 
              message: `Inventory item with ID ${inventoryItemId} not found. Please refresh and try again.` 
            };
          }
          
          // Get current stock
          const currentStockResult = await client.query(
            'SELECT * FROM inventory_stock WHERE inventory_item_id = $1 AND tenant_id = $2',
            [inventoryItemId, req.tenantId]
          );
          const currentStock = currentStockResult.rows[0];
          
          if (currentStock) {
            // Update existing stock using weighted average
            const currentQty = parseFloat(currentStock.current_quantity);
            const currentCost = parseFloat(currentStock.average_cost);
            const newQty = currentQty + qtyToAdd;
            const newCost = currentQty > 0 
              ? ((currentQty * currentCost) + (qtyToAdd * pricePerUnit)) / newQty
              : pricePerUnit;
            
            await client.query(
              `UPDATE inventory_stock 
               SET current_quantity = $1, 
                   average_cost = $2,
                   last_purchase_date = $3,
                   last_purchase_price = $4,
                   last_purchase_bill_id = $5,
                   updated_at = NOW()
               WHERE inventory_item_id = $6 AND tenant_id = $7`,
              [
                newQty,
                newCost,
                bill.bill_date,
                pricePerUnit,
                billId,
                inventoryItemId,
                req.tenantId
              ]
            );
          } else {
            // Create new stock record (use unique constraint on tenant_id + inventory_item_id)
            await client.query(
              `INSERT INTO inventory_stock (
                id, tenant_id, inventory_item_id, current_quantity, average_cost,
                last_purchase_date, last_purchase_price, last_purchase_bill_id, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
              ON CONFLICT (tenant_id, inventory_item_id) 
              DO UPDATE SET
                current_quantity = inventory_stock.current_quantity + $4,
                average_cost = CASE 
                  WHEN inventory_stock.current_quantity + $4 > 0 THEN
                    ((inventory_stock.current_quantity * inventory_stock.average_cost) + ($4 * $5)) / 
                    (inventory_stock.current_quantity + $4)
                  ELSE $5
                END,
                last_purchase_date = $6,
                last_purchase_price = $5,
                last_purchase_bill_id = $8,
                updated_at = NOW()`,
              [
                `stock_${Date.now()}_${inventoryItemId}`,
                req.tenantId,
                inventoryItemId,
                qtyToAdd,
                pricePerUnit,
                bill.bill_date,
                pricePerUnit,
                billId
              ]
            );
          }
        } else if (qtyToAdd < 0) {
          // Handle returns/reductions (if received quantity is reduced)
          const inventoryItemId = billItem.inventory_item_id;
          const reductionQty = Math.abs(qtyToAdd);
          
          const currentStockResult = await client.query(
            'SELECT * FROM inventory_stock WHERE inventory_item_id = $1 AND tenant_id = $2',
            [inventoryItemId, req.tenantId]
          );
          const currentStock = currentStockResult.rows[0];
          
          if (currentStock) {
            const currentQty = parseFloat(currentStock.current_quantity);
            const newQty = Math.max(0, currentQty - reductionQty);
            
            await client.query(
              `UPDATE inventory_stock 
               SET current_quantity = $1, updated_at = NOW()
               WHERE inventory_item_id = $2 AND tenant_id = $3`,
              [newQty, inventoryItemId, req.tenantId]
            );
          }
        }
      }
      
      // Check delivery status - calculate if all, some, or no items are received
      const allItemsResult = await client.query(
        'SELECT quantity, received_quantity FROM purchase_bill_items WHERE purchase_bill_id = $1 AND tenant_id = $2',
        [billId, req.tenantId]
      );
      const allItems = allItemsResult.rows;
      
      // Check if all items are fully received
      const allReceived = allItems.every((item: any) => 
        parseFloat(item.received_quantity || '0') >= parseFloat(item.quantity) - 0.01
      );
      
      // Check if any items are partially or fully received
      const anyReceived = allItems.some((item: any) => 
        parseFloat(item.received_quantity || '0') > 0
      );
      
      // Determine delivery status
      let deliveryStatus = 'Pending';
      if (allReceived) {
        deliveryStatus = 'Received';
      } else if (anyReceived) {
        deliveryStatus = 'Partially Received';
      }
      
      // Update bill with delivery status
      await client.query(
        `UPDATE purchase_bills 
         SET items_received = $1, 
             delivery_status = $2,
             items_received_date = CASE WHEN $1 THEN NOW() ELSE items_received_date END,
             updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [allReceived, deliveryStatus, billId, req.tenantId]
      );
      
      return { items: updatedItems, allReceived, deliveryStatus };
    });
    
    // Emit WebSocket event
    emitToTenant(req.tenantId!, WS_EVENTS.PURCHASE_BILL_UPDATED, {
      billId,
      itemsReceived: result.allReceived,
      deliveryStatus: result.deliveryStatus,
      userId: req.user?.userId,
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error receiving items:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table
    });
    
    if (error.code === 'ITEM_NOT_FOUND' || error.code === 'INVALID_QUANTITY' || error.code === 'INVENTORY_ITEM_NOT_FOUND') {
      return res.status(400).json({ 
        error: error.message,
        message: error.message 
      });
    }
    
    // Handle database constraint violations
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ 
        error: 'Database constraint violation',
        message: 'A stock record already exists for this item. Please try again.'
      });
    }
    
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: 'Invalid reference',
        message: 'One or more inventory items or bill references are invalid. Please refresh and try again.'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to receive items',
      message: error.message || 'An unexpected error occurred while receiving items'
    });
  }
});

// ============================================================================
// INVENTORY STOCK ENDPOINTS
// ============================================================================

// GET all inventory stock
router.get('/inventory-stock/all', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const stock = await db.query(
      `SELECT * FROM inventory_stock WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [req.tenantId]
    );
    res.json(stock);
  } catch (error) {
    console.error('Error fetching inventory stock:', error);
    res.status(500).json({ error: 'Failed to fetch inventory stock' });
  }
});

// GET stock for specific inventory item
router.get('/inventory-stock/item/:inventoryItemId', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const stockResult = await db.query(
      'SELECT * FROM inventory_stock WHERE inventory_item_id = $1 AND tenant_id = $2',
      [req.params.inventoryItemId, req.tenantId]
    );
    const stock = stockResult[0];
    
    if (!stock) {
      return res.json({ currentQuantity: 0, averageCost: 0 });
    }
    
    res.json(stock);
  } catch (error) {
    console.error('Error fetching inventory stock:', error);
    res.status(500).json({ error: 'Failed to fetch inventory stock' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Helper to update bill total based on items
async function updateBillTotal(db: any, billId: string, tenantId: string) {
  const items = await db.query(
    'SELECT SUM(total_amount) as total FROM purchase_bill_items WHERE purchase_bill_id = $1 AND tenant_id = $2',
    [billId, tenantId]
  );
  
  const total = items[0]?.total || 0;
  
  await db.query(
    'UPDATE purchase_bills SET total_amount = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
    [total, billId, tenantId]
  );
}

export default router;
