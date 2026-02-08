# Inventory Barcode Integration Guide

## Overview
The inventory system now supports barcode fields for all products. This enables seamless integration with the POS barcode scanner, allowing products to be scanned and automatically added to the cart during sales.

## Features Added

### 1. **Barcode Field in Inventory**
- Added optional `barcode` field to `InventoryItem` interface
- Barcode can be entered manually or scanned during product creation
- Barcode is stored in the database alongside SKU and other product information

### 2. **Product Creation with Barcode**
- New SKU creation modal now includes a "Barcode" input field
- Barcode can be scanned directly into the field using a barcode scanner
- Barcode is optional - products can still be created without one

### 3. **Barcode Search in Stock Master**
- Stock Master search now includes barcode matching
- Search by SKU, product name, OR barcode
- Barcode displayed prominently in product listings

### 4. **POS Integration**
- Products with barcodes can be scanned at POS
- Barcode scanner automatically finds matching product
- Product instantly added to cart when barcode is scanned

## How to Use

### Adding Barcode to New Products

1. **Navigate to Inventory Management**
   - Go to Shop → Inventory
   - Click "New SKU" button

2. **Enter Product Details**
   - Fill in SKU Code (optional - auto-generated)
   - **Scan or type barcode** in the Barcode field
   - Enter Product Name
   - Fill in other details (category, prices, etc.)

3. **Save Product**
   - Click "Create Product"
   - Product is saved with barcode

### Adding Barcode to Existing Products

Currently, barcodes can only be added during product creation. To add a barcode to an existing product:

1. Note the existing product details
2. Create a new product with the same details
3. Include the barcode this time
4. (Future enhancement: Edit existing products)

### Using Barcodes in POS

1. **Open POS Sales Page**
   - Navigate to Shop → POS Sales
   - Barcode scanner automatically activates

2. **Scan Product**
   - Point scanner at product barcode
   - Scanner reads barcode
   - POS searches for matching product
   - Product automatically added to cart

3. **Complete Sale**
   - Continue scanning items
   - Process payment as normal
   - Print receipt

### Searching by Barcode

In the **Stock Master** tab:

1. Click in the search field
2. Scan a barcode OR type it manually
3. Products matching the barcode will be filtered
4. Barcode is displayed with a 📊 icon

## Database Schema

### Products Table (`shop_products`)

```sql
CREATE TABLE shop_products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT,              -- NEW: Barcode field
    retail_price DECIMAL(15, 2),
    cost_price DECIMAL(15, 2),
    unit TEXT,
    reorder_point INTEGER,
    -- ... other fields
);
```

### Migration

The database migration automatically adds the `barcode` column if it doesn't exist:

```sql
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='shop_products' 
        AND column_name='barcode'
    ) THEN
        ALTER TABLE shop_products ADD COLUMN barcode TEXT;
    END IF;
END $$;
```

## Technical Details

### Type Definitions

**InventoryItem Interface** (`types/inventory.ts`):
```typescript
export interface InventoryItem {
    id: string;
    sku: string;
    barcode?: string;  // Optional barcode
    name: string;
    category: string;
    unit: string;
    onHand: number;
    available: number;
    reserved: number;
    inTransit: number;
    damaged: number;
    costPrice: number;
    retailPrice: number;
    reorderPoint: number;
    warehouseStock: Record<string, number>;
}
```

### API Integration

**Creating Products with Barcode**:
```typescript
const payload = {
    sku: item.sku,
    barcode: item.barcode || null,  // Include barcode
    name: item.name,
    category_id: item.category,
    retail_price: item.retailPrice,
    cost_price: item.costPrice,
    unit: item.unit,
    reorder_point: item.reorderPoint
};

await shopApi.createProduct(payload);
```

**Fetching Products**:
```typescript
const products = await shopApi.getProducts();

// Map to InventoryItem
const items = products.map(p => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode || undefined,  // Include barcode
    name: p.name,
    // ... other fields
}));
```

### Search Implementation

**Stock Master Search**:
```typescript
const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku.includes(searchQuery) ||
    (item.barcode && item.barcode.includes(searchQuery))  // Barcode search
);
```

**POS Product Search** (existing):
```typescript
// In ProductSearch component
const filteredProducts = products.filter(p => {
    const matchesSearch = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesSearch && matchesCategory;
});
```

## Barcode Standards

### Supported Formats

The system accepts any barcode format that your scanner supports:

- **UPC-A** (12 digits) - Universal Product Code
- **EAN-13** (13 digits) - European Article Number
- **Code 39** - Alphanumeric
- **Code 128** - Full ASCII
- **QR Code** - 2D barcode (if scanner supports)
- **Custom** - Any format your business uses

### Best Practices

1. **Use Standard Formats**
   - UPC/EAN for retail products
   - Code 128 for internal inventory
   - QR codes for complex data

2. **Unique Barcodes**
   - Each product should have a unique barcode
   - Don't reuse barcodes across different products
   - System doesn't enforce uniqueness (yet)

3. **Barcode Quality**
   - Print barcodes clearly
   - Ensure adequate contrast
   - Protect from damage/fading
   - Test scannability regularly

4. **Scanner Configuration**
   - Configure scanner to send Enter key after barcode
   - Use HID keyboard emulation mode
   - Set appropriate timeout (100ms recommended)

## Display Features

### Stock Master Table

Products with barcodes show:
- Product name (bold)
- SKU (gray, monospace)
- Barcode (indigo, with 📊 icon)

```
Cotton T-Shirt
SKU: SHIRT-001
📊 1234567890123
```

### Product Detail Panel

Selected product shows:
- Product name
- SKU ID
- Barcode (if available, with 📊 icon)

```
Cotton T-Shirt
SKU ID: SHIRT-001
📊 BARCODE: 1234567890123
```

## Workflow Examples

### Example 1: Adding New Product with Barcode

```
1. User clicks "New SKU" in Inventory
2. User scans barcode into Barcode field
   → Scanner types: "1234567890123" + Enter
3. User enters product name: "Cotton T-Shirt"
4. User enters prices and other details
5. User clicks "Create Product"
6. Product saved with barcode
```

### Example 2: Scanning Product at POS

```
1. Cashier opens POS Sales page
2. Customer brings product to counter
3. Cashier scans barcode
   → Scanner sends: "1234567890123" + Enter
4. POS searches for barcode match
5. Product "Cotton T-Shirt" found
6. Product added to cart automatically
7. Cashier continues scanning next item
```

### Example 3: Searching by Barcode

```
1. User opens Stock Master
2. User scans barcode into search field
   → Scanner types: "1234567890123"
3. List filters to show matching product
4. User clicks product to view details
5. Barcode displayed in detail panel
```

## Troubleshooting

### Barcode Not Saving

**Problem**: Barcode field is empty after creating product

**Solutions**:
- Check database migration ran successfully
- Verify `shop_products` table has `barcode` column
- Check browser console for API errors
- Ensure barcode value is not empty string

### Barcode Not Scanning in POS

**Problem**: Scanned barcode doesn't add product to cart

**Solutions**:
- Verify product has barcode in inventory
- Check barcode matches exactly (case-sensitive)
- Ensure scanner is configured correctly
- Check browser console for barcode scanner logs
- Verify product exists in POS products list

### Barcode Search Not Working

**Problem**: Searching by barcode doesn't filter products

**Solutions**:
- Ensure barcode is saved in database
- Check search query includes barcode
- Verify filter logic includes barcode field
- Clear search and try again

### Duplicate Barcodes

**Problem**: Multiple products with same barcode

**Solutions**:
- Currently system allows duplicates
- POS will add first matching product
- Future enhancement: Enforce uniqueness
- Manually ensure barcodes are unique

## Future Enhancements

### Planned Features

1. **Edit Existing Products**
   - Add/update barcode on existing products
   - Bulk barcode import

2. **Barcode Uniqueness**
   - Database constraint for unique barcodes
   - Validation during product creation
   - Warning for duplicate barcodes

3. **Barcode Generation**
   - Auto-generate barcodes for new products
   - Support multiple barcode formats
   - Print barcode labels

4. **Barcode Variants**
   - Multiple barcodes per product
   - Variant-specific barcodes
   - Size/color barcode mapping

5. **Barcode History**
   - Track barcode changes
   - Barcode usage analytics
   - Popular products by scan count

6. **Advanced Search**
   - Partial barcode matching
   - Fuzzy search
   - Barcode format validation

## Integration with Existing Features

### POS Barcode Scanner

The inventory barcode field integrates seamlessly with the existing POS barcode scanner:

1. **Scanner Service** (`services/barcode/barcodeScanner.ts`)
   - Detects barcode input
   - Updates search query
   - No changes needed

2. **Product Search** (`components/shop/pos/ProductSearch.tsx`)
   - Searches by barcode
   - Auto-adds matching product
   - Already supports barcode field

3. **POS Context** (`context/POSContext.tsx`)
   - Manages cart state
   - No changes needed

### Receipt Printing

Barcodes can be included in receipts:

- Product barcode shown on receipt (optional)
- Receipt number has barcode
- Future: Print product barcodes on receipt

## Best Practices for Businesses

### Retail Stores

1. Use UPC/EAN barcodes from suppliers
2. Scan barcodes during product receiving
3. Verify barcode accuracy before shelving
4. Train staff on scanner usage

### Warehouses

1. Use Code 128 for internal tracking
2. Print barcode labels for bulk items
3. Scan during stock movements
4. Regular barcode audits

### Restaurants/Cafes

1. Use custom barcodes for menu items
2. Print barcode menus for quick ordering
3. Scan ingredients for inventory tracking
4. Track popular items by scan frequency

## Conclusion

The barcode field integration provides a seamless bridge between your physical inventory and the digital POS system. Products can now be tracked from receiving to sale using barcode scanning, improving accuracy and speed.

For questions or issues, refer to:
- `doc/POS_BARCODE_PRINTER_GUIDE.md` - Scanner setup
- `doc/POS_QUICK_START.md` - Quick start guide
- Browser console logs for debugging
