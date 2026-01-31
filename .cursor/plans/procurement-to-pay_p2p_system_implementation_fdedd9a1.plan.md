---
name: Procurement-to-Pay P2P System Implementation
overview: Design and implement a modular Procurement-to-Pay (P2P) system with database schema updates, state management, and dual UI dashboards (Buyer and Supplier) integrated into the Biz Planet section.
todos: []
isProject: false
---

# Procurement-to-Pay (P2P) System Implementation Plan

## Overview

This plan implements a complete P2P system that enables organizations (tenants) to manage the full lifecycle from Purchase Orders through Invoices to Bills and Payments. The system includes supplier promotion workflows, PO issuance, invoice flipping, approval workflows, and automated billing.

## Architecture Overview

```
┌─────────────────┐
│   Tenants       │ ── is_supplier flag
│  (Organizations)│
└────────┬────────┘
         │
    ┌────┴─────────────────────────┐
    │                              │
┌───▼──────────────┐    ┌──────────▼──────────┐
│  Buyer Dashboard │    │  Supplier Portal    │
│  (All buyers)    │    │  (is_supplier=true) │
└──────────────────┘    └─────────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼──────────────┐
         │   P2P Core Engine        │
         │  - PO Management         │
         │  - Invoice Processing    │
         │  - Bill Generation       │
         │  - State Transitions     │
         └──────────────────────────┘
```

## User Flow: Buyer → Registered Supplier

When a buyer initiates a PO to a **registered supplier**, the flow is: Create PO → Submit (PO Sent) → Supplier sees PO and can open (locks record) → Buyer can open when not locked, submit revisions (then unlock) → Supplier converts PO to invoice (income category) → Buyer records as bill (expense category) → Delivery (supplier: in progress; buyer: confirm receive) → Payment (buyer pays; status Paid; expense recorded) → Supplier sees Paid, income updated, process closed.

**Full flowchart (Mermaid) and phase summary:** see [doc/BIZ_PLANET_PO_FLOW.md](../../doc/BIZ_PLANET_PO_FLOW.md). Key behaviors: **PO locking** (one party edits at a time), **revisions** (buyer submits; supplier sees updated PO), **invoice from PO** (supplier), **bill in project** (buyer), then delivery and payment to close.

## 1. Database Schema Updates

### 1.1 New Tables

#### Suppliers Table (Extends Tenants)

Extend existing `tenants` table with supplier-specific metadata:

```sql
-- Add supplier metadata columns to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_terms TEXT CHECK (payment_terms IN ('Net 30', 'Net 60', 'Net 90', 'Due on Receipt', 'Custom'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS supplier_category TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS supplier_status TEXT CHECK (supplier_status IN ('Active', 'Inactive')) DEFAULT 'Active';
```

#### Purchase Orders Table

**File**: `server/migrations/add-p2p-tables.sql`, `services/database/schema.ts`

```sql
CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'SENT', 'RECEIVED', 'INVOICED', 'DELIVERED', 'COMPLETED')) DEFAULT 'DRAFT',
    items TEXT NOT NULL, -- JSON array of POItem
    description TEXT,
    created_by TEXT,
    sent_at TEXT,
    received_at TEXT,
    delivered_at TEXT,
    completed_at TEXT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);
```

#### P2P Invoices Table

```sql
CREATE TABLE IF NOT EXISTS p2p_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    po_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    items TEXT NOT NULL, -- JSON array matching PO items
    reviewed_by TEXT,
    reviewed_at TEXT,
    rejected_reason TEXT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);
```

#### P2P Bills Table

```sql
CREATE TABLE IF NOT EXISTS p2p_bills (
    id TEXT PRIMARY KEY,
    bill_number TEXT NOT NULL UNIQUE,
    invoice_id TEXT NOT NULL,
    po_id TEXT NOT NULL,
    buyer_tenant_id TEXT NOT NULL,
    supplier_tenant_id TEXT NOT NULL,
    amount REAL NOT NULL,
    due_date TEXT NOT NULL,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')) DEFAULT 'UNPAID',
    paid_amount REAL NOT NULL DEFAULT 0,
    paid_at TEXT,
    payment_account_id TEXT,
    transaction_id TEXT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES p2p_invoices(id) ON DELETE RESTRICT,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (buyer_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);
```

#### Audit Trail Table (Reuse existing `transaction_log` or create P2P-specific)

```sql
CREATE TABLE IF NOT EXISTS p2p_audit_trail (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- 'PO', 'INVOICE', 'BILL'
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'STATUS_CHANGE', 'CREATED', 'APPROVED', 'REJECTED'
    from_status TEXT,
    to_status TEXT,
    performed_by TEXT,
    performed_at TEXT NOT NULL DEFAULT (datetime('now')),
    notes TEXT,
    tenant_id TEXT NOT NULL
);
```

### 1.2 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_po_buyer_tenant ON purchase_orders(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier_tenant ON purchase_orders(supplier_tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_po_id ON p2p_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoices_status ON p2p_invoices(status);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_invoice_id ON p2p_bills(invoice_id);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_due_date ON p2p_bills(due_date);
CREATE INDEX IF NOT EXISTS idx_p2p_bills_payment_status ON p2p_bills(payment_status);
```

## 2. TypeScript Types

### 2.1 Add P2P Types

**File**: `types.ts`

```typescript
// PO Status Enum
export enum POStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  RECEIVED = 'RECEIVED',
  INVOICED = 'INVOICED',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED'
}

// Invoice Status Enum
export enum P2PInvoiceStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

// Bill Payment Status Enum
export enum P2PBillPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE'
}

// Supplier Metadata
export interface SupplierMetadata {
  taxId?: string;
  paymentTerms?: 'Net 30' | 'Net 60' | 'Net 90' | 'Due on Receipt' | 'Custom';
  supplierCategory?: string;
  supplierStatus?: 'Active' | 'Inactive';
}

// PO Line Item
export interface POItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  categoryId?: string;
}

// Purchase Order
export interface PurchaseOrder {
  id: string;
  poNumber: string;
  buyerTenantId: string;
  supplierTenantId: string;
  totalAmount: number;
  status: POStatus;
  items: POItem[];
  description?: string;
  createdBy?: string;
  sentAt?: string;
  receivedAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  tenantId: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

// P2P Invoice
export interface P2PInvoice {
  id: string;
  invoiceNumber: string;
  poId: string;
  buyerTenantId: string;
  supplierTenantId: string;
  amount: number;
  status: P2PInvoiceStatus;
  items: POItem[];
  reviewedBy?: string;
  reviewedAt?: string;
  rejectedReason?: string;
  tenantId: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

// P2P Bill
export interface P2PBill {
  id: string;
  billNumber: string;
  invoiceId: string;
  poId: string;
  buyerTenantId: string;
  supplierTenantId: string;
  amount: number;
  dueDate: string;
  paymentStatus: P2PBillPaymentStatus;
  paidAmount: number;
  paidAt?: string;
  paymentAccountId?: string;
  transactionId?: string;
  tenantId: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
}
```

## 3. State Management Logic

### 3.1 State Machine Service

**File**: `services/p2p/stateMachine.ts`

Implement state transition logic with validation:

```typescript
// Valid state transitions
const VALID_TRANSITIONS = {
  PO: {
    DRAFT: ['SENT'],
    SENT: ['RECEIVED', 'INVOICED'],
    RECEIVED: ['INVOICED'],
    INVOICED: ['DELIVERED'],
    DELIVERED: ['COMPLETED'],
    COMPLETED: [] // Terminal state
  },
  INVOICE: {
    PENDING: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED'],
    APPROVED: [], // Terminal state
    REJECTED: [] // Terminal state
  }
};

// State transition validator
export function canTransitionPO(from: POStatus, to: POStatus): boolean {
  return VALID_TRANSITIONS.PO[from]?.includes(to) || false;
}

// Business logic: When PO is marked DELIVERED, check for approved invoice
export async function handlePODelivery(poId: string): Promise<void> {
  // 1. Check if invoice exists and is APPROVED
  // 2. If yes, auto-generate BILL with due_date calculated from payment_terms
  // 3. Update PO status to DELIVERED
}
```

### 3.2 Audit Trail Service

**File**: `services/p2p/auditTrail.ts`

```typescript
export async function logStatusChange(
  entityType: 'PO' | 'INVOICE' | 'BILL',
  entityId: string,
  fromStatus: string,
  toStatus: string,
  userId: string,
  notes?: string
): Promise<void> {
  // Record timestamped status change in p2p_audit_trail
}
```

## 4. API Routes & Business Logic

### 4.1 Supplier Promotion Route

**File**: `server/api/routes/suppliers.ts`

```typescript
// POST /api/suppliers/promote
// Promote a tenant to supplier by setting is_supplier=true
router.post('/promote', async (req: TenantRequest, res) => {
  // 1. Validate tenant exists
  // 2. Update is_supplier = true
  // 3. Set supplier metadata (tax_id, payment_terms, category, status)
  // 4. Return updated tenant
});
```

### 4.2 Purchase Orders Routes

**File**: `server/api/routes/purchaseOrders.ts`

```typescript
// POST /api/purchase-orders
// Create PO, set status to SENT, trigger notification
router.post('/', async (req: TenantRequest, res) => {
  // 1. Create PO with status DRAFT
  // 2. Automatically set status to SENT
  // 3. Trigger notification hook (stub)
  // 4. Log audit trail
  // 5. Return created PO
});

// PUT /api/purchase-orders/:id/status
// Update PO status with validation
router.put('/:id/status', async (req: TenantRequest, res) => {
  // 1. Validate state transition
  // 2. Update status
  // 3. If DELIVERED, check for APPROVED invoice and auto-generate BILL
  // 4. Log audit trail
});
```

### 4.3 Invoice Routes

**File**: `server/api/routes/p2pInvoices.ts`

```typescript
// POST /api/p2p-invoices/flip-from-po
// Supplier creates invoice from SENT PO
router.post('/flip-from-po/:poId', async (req: TenantRequest, res) => {
  // 1. Validate PO exists and status is SENT
  // 2. Validate supplier is authorized (supplier_tenant_id matches)
  // 3. Create invoice from PO items
  // 4. Set invoice status to PENDING
  // 5. Update PO status to INVOICED
  // 6. Log audit trail
});

// PUT /api/p2p-invoices/:id/approve
// Buyer approves invoice
router.put('/:id/approve', async (req: TenantRequest, res) => {
  // 1. Validate invoice status allows approval
  // 2. Update status to APPROVED
  // 3. Log audit trail
});
```

### 4.4 Bill Auto-Generation

**File**: `server/api/routes/p2pBills.ts`

```typescript
// Internal function called when PO marked DELIVERED
async function autoGenerateBill(invoiceId: string, poId: string): Promise<P2PBill> {
  // 1. Get approved invoice
  // 2. Get supplier payment_terms
  // 3. Calculate due_date (today + payment_terms days)
  // 4. Create bill record
  // 5. Return bill
}
```

## 5. UI Components - Buyer Dashboard

### 5.1 Buyer Dashboard Page

**File**: `components/bizPlanet/BuyerDashboard.tsx`

**Features**:

- Outstanding POs table (status: SENT, RECEIVED, INVOICED, DELIVERED)
- Invoices Awaiting Approval widget (status: PENDING, UNDER_REVIEW)
- Supplier Performance metrics
- Organization search and promotion tool

**Layout**:

```
┌─────────────────────────────────────────────┐
│  Buyer Dashboard                            │
├─────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Outstanding│  │Invoices │  │Supplier  │ │
│  │  POs     │  │Awaiting │  │Performance│ │
│  │  (5)     │  │Approval │  │          │ │
│  │          │  │   (3)   │  │          │ │
│  └──────────┘  └──────────┘  └──────────┘ │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │  Outstanding POs Table              │   │
│  │  [Search] [Filter: Status]          │   │
│  │  PO# | Supplier | Amount | Status  │   │
│  └─────────────────────────────────────┘   │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │  Promote Organizations              │   │
│  │  [Search Organizations...]          │   │
│  │  [Promote to Supplier]              │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 5.2 PO Management Components

**Files**:

- `components/bizPlanet/p2p/POCreateForm.tsx` - Create new PO
- `components/bizPlanet/p2p/PODetailModal.tsx` - View/edit PO details
- `components/bizPlanet/p2p/POListTable.tsx` - List POs with filters
- `components/bizPlanet/p2p/InvoiceApprovalModal.tsx` - Approve/reject invoices

## 6. UI Components - Supplier Portal

### 6.1 Supplier Portal Page

**File**: `components/bizPlanet/SupplierPortal.tsx`

**Visibility**: Only shown when `tenant.is_supplier === true`

**Features**:

- Received POs table (status: SENT, RECEIVED)
- "Flip to Invoice" action button (prominent, per PO)
- Invoice Status Tracker (shows status of submitted invoices)
- My Invoices list

**Layout**:

```
┌─────────────────────────────────────────────┐
│  Supplier Portal                            │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐   │
│  │  Received Purchase Orders           │   │
│  │  PO# | Buyer | Amount | Received   │   │
│  │  ──────────────────────────────────│   │
│  │  [Flip to Invoice] [Flip to Invoice]│   │
│  └─────────────────────────────────────┘   │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │  Invoice Status Tracker             │   │
│  │  PENDING │ UNDER_REVIEW │ APPROVED │   │
│  └─────────────────────────────────────┘   │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │  My Invoices                        │   │
│  │  Invoice# | PO# | Status | Amount  │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 6.2 Supplier Components

**Files**:

- `components/bizPlanet/p2p/SupplierPOList.tsx` - List received POs
- `components/bizPlanet/p2p/FlipToInvoiceModal.tsx` - Flip PO to invoice
- `components/bizPlanet/p2p/InvoiceStatusTracker.tsx` - Visual status tracker

## 7. Biz Planet Page Integration

### 7.1 Update BizPlanetPage

**File**: `components/bizPlanet/BizPlanetPage.tsx`

```typescript
// Check if current tenant is supplier
const isSupplier = currentTenant?.is_supplier === true;

return (
  <>
    {isSupplier ? (
      <SupplierPortal />
    ) : (
      <BuyerDashboard />
    )}
  </>
);
```

## 8. Notification Hooks (Stubs)

### 8.1 Notification Service

**File**: `services/p2p/notifications.ts`

```typescript
// Stub for PO receipt notification
export async function notifyPOReceived(poId: string, supplierId: string): Promise<void> {
  // TODO: Implement in-app notification or email
  console.log(`📧 Notification: PO ${poId} received by supplier ${supplierId}`);
}

// Stub for invoice approval notification
export async function notifyInvoiceApproved(invoiceId: string, supplierId: string): Promise<void> {
  // TODO: Implement in-app notification or email
  console.log(`📧 Notification: Invoice ${invoiceId} approved for supplier ${supplierId}`);
}
```

## 9. Implementation Sequence

1. **Database Schema** (Priority 1)
  - Add supplier metadata columns to `tenants`
  - Create `purchase_orders`, `p2p_invoices`, `p2p_bills` tables
  - Create indexes
  - Add migration scripts
2. **Types & State Management** (Priority 1)
  - Add TypeScript interfaces
  - Implement state machine logic
  - Create audit trail service
3. **API Routes** (Priority 2)
  - Supplier promotion route
  - PO CRUD routes
  - Invoice flip route
  - Bill auto-generation logic
4. **Buyer Dashboard** (Priority 2)
  - Create BuyerDashboard component
  - PO management components
  - Invoice approval workflow
5. **Supplier Portal** (Priority 2)
  - Create SupplierPortal component
  - Flip to invoice functionality
  - Status tracking
6. **Integration & Testing** (Priority 3)
  - Wire up BizPlanetPage
  - Test workflows end-to-end
  - Add notification stubs

## 10. Key Files to Create/Modify

**New Files**:

- `server/migrations/add-p2p-tables.sql`
- `server/api/routes/suppliers.ts`
- `server/api/routes/purchaseOrders.ts`
- `server/api/routes/p2pInvoices.ts`
- `server/api/routes/p2pBills.ts`
- `services/p2p/stateMachine.ts`
- `services/p2p/auditTrail.ts`
- `services/p2p/notifications.ts`
- `components/bizPlanet/BuyerDashboard.tsx`
- `components/bizPlanet/SupplierPortal.tsx`
- `components/bizPlanet/p2p/*.tsx` (multiple component files)

**Modified Files**:

- `services/database/schema.ts` - Add P2P tables to SQLite schema
- `server/migrations/postgresql-schema.sql` - Add P2P tables and supplier columns
- `types.ts` - Add P2P type definitions
- `components/bizPlanet/BizPlanetPage.tsx` - Route to Buyer/Supplier views
- `context/AppContext.tsx` - Add P2P state management
- `server/api/index.ts` - Register new P2P routes

## 11. Design Guidelines

**UI Theme**: Modern, clean design following latest industry practices:

- Card-based layouts with subtle shadows
- Status badges with color coding (green=approved, yellow=pending, red=rejected)
- Prominent action buttons (primary color for "Flip to Invoice")
- Responsive grid layouts
- Empty states with helpful messages
- Loading states with skeletons

**Status Colors**:

- DRAFT: Gray
- SENT: Blue
- PENDING: Yellow/Orange
- APPROVED: Green
- REJECTED: Red
- COMPLETED: Dark Green

**Accessibility**:

- Keyboard navigation
- ARIA labels for status changes
- Screen reader support

