# My Shop - Retail/POS System

## Overview

The "My Shop" feature is a comprehensive retail point-of-sale (POS) system integrated into the application. It enables businesses to:

1. **Purchase inventory** from vendors (via Purchase Bills)
2. **Track stock levels** in real-time
3. **Sell items** from inventory with configurable profit margins
4. **Generate sales invoices** for customers
5. **View reports** on sales, purchases, profits, and inventory

## System Architecture

### Database Schema

#### Tables Created:

1. **`shop_config`** - Shop configuration and settings
   - Shop details (name, address, phone, email)
   - Pricing settings (default profit margin, tax)
   - Invoice settings (prefix, footer)
   - Display settings (stock visibility, low stock alerts)

2. **`shop_sales`** - Sales invoices
   - Invoice details
   - Customer information (optional)
   - Financial totals (subtotal, tax, discount)
   - Payment information
   - Status tracking

3. **`shop_sale_items`** - Line items for each sale
   - Item details from inventory
   - Quantity sold
   - Cost price vs selling price
   - Profit calculation per item

### Complete Workflow

```
1. PURCHASE FROM VENDOR
   ├─> Create Purchase Bill
   ├─> Pay Bill
   ├─> Receive Items
   └─> Inventory Stock Updated (+)

2. CONFIGURE SHOP
   ├─> Set profit margins
   ├─> Configure tax
   └─> Customize invoices

3. SELL TO CUSTOMER
   ├─> Select items from inventory
   ├─> Apply profit margin (auto-calculated)
   ├─> Add tax (if enabled)
   ├─> Generate invoice
   ├─> Receive payment
   ├─> Inventory Stock Updated (-)
   └─> Revenue recorded in accounting

4. VIEW REPORTS
   ├─> Sales summary
   ├─> Purchase summary
   ├─> Profit/Loss analysis
   ├─> Top selling items
   └─> Inventory valuation
```

## API Endpoints

### Shop Configuration
- `GET /api/shop/config` - Get shop configuration
- `POST /api/shop/config` - Save shop configuration

### Sales Management
- `GET /api/shop/sales` - List all sales (with date filters)
- `GET /api/shop/sales/:id` - Get sale details with items
- `POST /api/shop/sales` - Create new sale

### Reports & Analytics
- `GET /api/shop/reports/summary` - Get sales & profit summary

## Features

### 1. Shop Configuration

Configure your shop settings:
- **Shop Details**: Name, address, phone, email
- **Pricing**: Default profit margin percentage
- **Tax Settings**: Enable/disable tax, set tax rate
- **Invoice Settings**: Custom prefix, footer text
- **Stock Settings**: Show/hide stock quantities, low stock alerts

### 2. Point of Sale (POS)

**Sell Interface:**
- Browse available inventory items
- View current stock levels
- Add items to cart
- Automatic price calculation with profit margin
- Apply discounts
- Calculate tax (if enabled)
- Multiple payment methods
- Optional customer information
- Print/view invoice

**Price Calculation:**
```
Cost Price = Average cost from inventory_stock
Selling Price = Cost Price × (1 + Profit Margin %)
Tax Amount = Subtotal × Tax %
Total = Subtotal + Tax - Discount
```

### 3. Inventory Management

**Stock Tracking:**
- Real-time stock levels
- Automatic deduction on sale
- Automatic addition on purchase receipt
- Low stock alerts
- Stock value calculation

**Inventory Flow:**
```
Purchase Bill Received → Stock (+)
Sale Completed → Stock (-)
Current Stock = Starting + Purchases - Sales
```

### 4. Dashboard & Reports

**Sales Reports:**
- Total sales count
- Total revenue
- Average sale value
- Sales trends over time

**Purchase Reports:**
- Total purchases
- Total cost
- Average purchase value
- Purchase trends

**Profit Analysis:**
- Total profit (Sales - Cost)
- Profit margin percentage
- Item-wise profit
- Period comparison

**Top Performing Items:**
- Best selling products
- Highest revenue items
- Highest profit items
- Slow-moving stock

**Inventory Reports:**
- Current stock levels
- Stock value at cost
- Stock value at selling price
- Low stock items
- Out of stock items

## Integration Points

### With Purchase Bills
- Stock increases when purchase bills are received
- Cost price tracked from purchase price
- Warehouse linkage (optional)

### With Accounting
- Sales create income transactions
- Payment updates account balances
- Revenue recognition
- Profit tracking

### With Inventory
- Real-time stock updates
- Cost averaging (FIFO/Weighted Average)
- Stock movements tracking

## UI Components

### Shop Configuration Page
Location: `Settings → Shop Configuration`

**Features:**
- Shop information form
- Pricing settings
- Tax configuration
- Invoice customization
- Save/Cancel actions

### POS/Sales Interface
Location: `Inventory → My Shop → Sell`

**Features:**
- Item selection with search
- Shopping cart
- Price display with profit margin
- Tax calculation
- Payment processing
- Invoice generation

### Shop Dashboard
Location: `Inventory → My Shop → Dashboard`

**Features:**
- Summary cards (Sales, Profit, Items Sold)
- Sales chart
- Top selling items table
- Recent sales list
- Quick filters (Today, Week, Month, Custom)

## Security & Permissions

- All endpoints require authentication
- Tenant isolation enforced
- User tracking for audit trail
- Payment account validation

## Business Logic

### Profit Calculation
```typescript
const costPrice = inventory_stock.average_cost;
const profitMargin = shop_config.default_profit_margin_percent;
const sellingPrice = costPrice * (1 + profitMargin / 100);
const profit = (sellingPrice - costPrice) * quantity;
```

### Tax Calculation
```typescript
if (shop_config.tax_enabled) {
  const taxAmount = subtotal * (shop_config.tax_percent / 100);
  const total = subtotal + taxAmount - discount;
}
```

### Stock Deduction
```typescript
// On sale completion
current_stock = current_stock - quantity_sold;

// Validation: Prevent negative stock
if (current_stock < 0) {
  throw new Error('Insufficient stock');
}
```

## Testing Checklist

- [ ] Shop configuration saves correctly
- [ ] Purchase bill increases stock
- [ ] Sale decreases stock
- [ ] Profit margins calculate correctly
- [ ] Tax applies when enabled
- [ ] Payment updates account balance
- [ ] Low stock alerts work
- [ ] Reports show accurate data
- [ ] Invoice numbers increment
- [ ] Multi-tenant isolation works

## Future Enhancements

1. **Advanced Features:**
   - Barcode scanning
   - Receipt printing
   - Customer loyalty program
   - Discounts & promotions
   - Refunds & returns
   - Credit sales

2. **Reporting:**
   - Export to Excel/PDF
   - Email reports
   - Scheduled reports
   - Custom date ranges
   - Comparison reports

3. **Inventory:**
   - Stock alerts via notification
   - Automatic reorder
   - Batch/Serial number tracking
   - Expiry date tracking
   - Stock transfers between warehouses

4. **Analytics:**
   - Sales forecasting
   - Demand planning
   - Profitability by category
   - Customer purchase patterns
   - Seasonal trends

## Database Indices

For optimal performance, the following indices are created:

```sql
-- Shop Config
idx_shop_config_tenant

-- Shop Sales
idx_shop_sales_tenant
idx_shop_sales_date
idx_shop_sales_status
idx_shop_sales_customer

-- Shop Sale Items
idx_shop_sale_items_tenant
idx_shop_sale_items_sale
idx_shop_sale_items_inventory
```

## Migration Path

1. Run database migration: `add-shop-sales-tables.sql`
2. Restart server to load new routes
3. Default shop config created automatically
4. Start using the feature!

## Support & Troubleshooting

**Common Issues:**

1. **Stock not updating:**
   - Check if purchase bill status is "Received"
   - Verify inventory_stock table has records
   - Check tenant_id isolation

2. **Prices incorrect:**
   - Verify shop_config.default_profit_margin_percent
   - Check inventory_stock.average_cost
   - Review tax settings

3. **Sales not creating:**
   - Verify items have stock available
   - Check payment account exists
   - Review browser console for errors

## API Usage Examples

### Create a Sale

```typescript
POST /api/shop/sales
{
  "sale": {
    "saleDate": "2026-01-28",
    "customerName": "John Doe",
    "subtotal": 1000,
    "taxAmount": 50,
    "totalAmount": 1050,
    "paidAmount": 1050,
    "paymentMethod": "Cash",
    "paymentAccountId": "account_123"
  },
  "items": [
    {
      "inventoryItemId": "item_456",
      "itemName": "Product A",
      "quantity": 2,
      "costPrice": 400,
      "sellingPrice": 500,
      "profitMarginPercent": 25,
      "lineTotal": 1000,
      "lineProfit": 200
    }
  ]
}
```

### Get Sales Report

```typescript
GET /api/shop/reports/summary?startDate=2026-01-01&endDate=2026-01-31

Response:
{
  "sales": {
    "totalSales": 150,
    "totalRevenue": 50000,
    "averageSale": 333.33
  },
  "profit": {
    "totalProfit": 12500,
    "totalItemsSold": 450
  },
  "topSellingItems": [...]
}
```

