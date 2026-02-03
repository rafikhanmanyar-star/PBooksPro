# Purchase Bill Delivery Status Feature

## Overview

This document describes the purchase bill delivery status tracking feature that automatically updates the bill status when all inventory items are received.

## Changes Made

### 1. Type Definitions (`types.ts`)

Added a new enum for tracking delivery status:

```typescript
export enum PurchaseBillDeliveryStatus {
  PENDING = 'Pending',
  PARTIALLY_RECEIVED = 'Partially Received',
  RECEIVED = 'Received',
}
```

Updated `PurchaseBill` interface:
- Added `deliveryStatus: PurchaseBillDeliveryStatus` field
- Clarified that `itemsReceived` boolean is now legacy (use `deliveryStatus` instead)

### 2. Database Migration

**File:** `server/migrations/add-delivery-status-to-purchase-bills.sql`

- Adds `delivery_status` column to `purchase_bills` table
- Sets default value to 'Pending'
- Migrates existing data based on `items_received` flag
- Adds index for better query performance
- Adds check constraint for valid status values

### 3. Server API Updates

**File:** `server/api/routes/purchaseBills.ts`

#### Changes to the `/receive` endpoint:

The endpoint now automatically calculates and updates the delivery status based on received quantities:

1. **Pending**: No items have been received yet
2. **Partially Received**: Some items have been received, but not all
3. **Received**: All items have been fully received

**Logic:**
```javascript
// Check if all items are fully received
const allReceived = allItems.every(item => 
  receivedQuantity >= orderedQuantity - 0.01
);

// Check if any items are received
const anyReceived = allItems.some(item => 
  receivedQuantity > 0
);

// Determine delivery status
let deliveryStatus = 'Pending';
if (allReceived) {
  deliveryStatus = 'Received';
} else if (anyReceived) {
  deliveryStatus = 'Partially Received';
}
```

The bill is automatically updated with the calculated status when items are received.

### 4. Frontend UI Updates

**File:** `components/inventory/PurchasesTab.tsx`

#### New Features:

1. **Delivery Status Badge Function:**
   - Green badge for "Received"
   - Amber badge for "Partially Received"
   - Blue badge for "Pending"

2. **Updated Table Display:**
   - Added "Delivery" column to show delivery status
   - Renamed "Status" column to "Payment" for clarity
   - Both payment status and delivery status are now visible

3. **Bill Creation:**
   - New bills are initialized with `PENDING` delivery status
   - Status is automatically updated when items are received

## How It Works

### Workflow:

1. **Create Purchase Bill:**
   - Bill is created with delivery status = "Pending"
   - Payment status = "Unpaid"

2. **Pay the Bill:**
   - Payment status changes to "Partially Paid" or "Paid"
   - Delivery status remains "Pending"
   - Note: Bill must be paid before items can be received

3. **Receive Items:**
   - User clicks "Receive" action on a paid bill
   - User enters received quantities for each item
   - System automatically calculates delivery status:
     - If all items fully received → "Received"
     - If some items received → "Partially Received"
     - If no items received → remains "Pending"

4. **Partial Receiving:**
   - User can receive items in multiple batches
   - Each time items are received, the status is recalculated
   - Status updates to "Received" only when ALL items are fully received

## Benefits

1. **Clear Status Tracking:** 
   - Separate payment and delivery status for better visibility
   
2. **Automatic Updates:** 
   - No manual status changes needed
   - Status is always accurate based on received quantities

3. **Partial Receiving Support:**
   - Track gradual inventory receipt
   - Know immediately when some items are still pending

4. **Inventory Accuracy:**
   - Ensures inventory is only updated when items are physically received
   - Prevents stock discrepancies

## Database Schema

```sql
ALTER TABLE purchase_bills 
ADD COLUMN delivery_status VARCHAR(50) DEFAULT 'Pending'
CHECK (delivery_status IN ('Pending', 'Partially Received', 'Received'));
```

## API Response Example

```json
{
  "id": "bill_123",
  "billNumber": "PB-0001",
  "vendorId": "vendor_456",
  "status": "Paid",
  "deliveryStatus": "Partially Received",
  "itemsReceived": false,
  "totalAmount": 5000,
  "paidAmount": 5000,
  "items": [
    {
      "id": "item_1",
      "itemName": "Steel Bars",
      "quantity": 100,
      "receivedQuantity": 50,
      "pricePerUnit": 50
    }
  ]
}
```

## Testing

To test the feature:

1. Create a new purchase bill with multiple items
2. Pay the bill (required before receiving)
3. Click "Receive" and enter partial quantities
   - Verify status changes to "Partially Received"
4. Receive the remaining items
   - Verify status changes to "Received"
5. Check that inventory quantities are updated correctly

## Future Enhancements

Potential improvements:
- Add delivery status filter to the bills list
- Show delivery progress percentage
- Add email notifications when status changes
- Generate receiving reports
- Track who received the items and when
