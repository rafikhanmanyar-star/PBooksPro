# POS System Architecture - Barcode Scanner & Receipt Printer

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           POS SALES PAGE                                 │
│                         (POSSalesPage.tsx)                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Provides Context
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          POS CONTEXT                                     │
│                         (POSContext.tsx)                                 │
│                                                                          │
│  State:                          Methods:                               │
│  • cart                          • addToCart()                          │
│  • customer                      • completeSale()                       │
│  • payments                      • printReceipt()                       │
│  • lastCompletedSale            • clearCart()                          │
│                                                                          │
│  Services:                                                               │
│  • barcodeScannerRef            ← BarcodeScanner instance               │
│  • thermalPrinterRef            ← ThermalPrinter instance               │
└─────────────────────────────────────────────────────────────────────────┘
           │                                │                    │
           │                                │                    │
           ▼                                ▼                    ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────┐
│  PRODUCT SEARCH      │    │  PAYMENT MODAL       │    │  CHECKOUT PANEL  │
│ (ProductSearch.tsx)  │    │ (PaymentModal.tsx)   │    │(CheckoutPanel.tsx)│
│                      │    │                      │    │                  │
│ • Search field       │    │ • Payment methods    │    │ • Cart totals    │
│ • Product grid       │    │ • Complete sale btn  │    │ • Quick actions  │
│ • Category filter    │    │ • Print receipt btn  │    │ • Discounts      │
│                      │    │                      │    │                  │
│ Listens to:          │    │ Triggers:            │    │                  │
│ • searchQuery        │    │ • completeSale()     │    │                  │
│ • Auto-adds on match │    │ • printReceipt()     │    │                  │
└──────────────────────┘    └──────────────────────┘    └──────────────────┘
           │                                │
           │                                │
           ▼                                ▼
┌──────────────────────┐    ┌──────────────────────────────────────────────┐
│  BARCODE SCANNER     │    │  THERMAL PRINTER SERVICE                     │
│  SERVICE             │    │  (thermalPrinter.ts)                         │
│ (barcodeScanner.ts)  │    │                                              │
│                      │    │  Methods:                                    │
│ • Keyboard listener  │    │  • printReceipt(data)                        │
│ • Buffer management  │    │  • generateReceiptHTML()                     │
│ • Timeout detection  │    │  • testPrint()                               │
│ • Barcode validation │    │                                              │
│                      │    │  Generates:                                  │
│ Triggers:            │    │  • HTML receipt                              │
│ • onScan(barcode)    │    │  • Formatted for 80mm                        │
│   → setSearchQuery() │    │  • ESC/POS compatible                        │
└──────────────────────┘    └──────────────────────────────────────────────┘
           │                                │
           │                                │
           ▼                                ▼
┌──────────────────────┐    ┌──────────────────────────────────────────────┐
│  USB BARCODE         │    │  THERMAL PRINTER                             │
│  SCANNER             │    │  (Hardware)                                  │
│  (Hardware)          │    │                                              │
│                      │    │  • 80mm thermal paper                        │
│  • HID Keyboard mode │    │  • ESC/POS compatible                        │
│  • Sends barcode +   │    │  • USB or Network                            │
│    Enter key         │    │  • Windows driver                            │
└──────────────────────┘    └──────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Barcode Scanning Flow

```
┌─────────────┐
│   Scanner   │
│  (Hardware) │
└──────┬──────┘
       │ Scans barcode
       │ Sends keystrokes
       ▼
┌─────────────────────┐
│  Barcode Scanner    │
│     Service         │
│                     │
│ 1. Captures keys    │
│ 2. Buffers input    │
│ 3. Detects Enter    │
│ 4. Validates length │
└──────┬──────────────┘
       │ onScan(barcode)
       ▼
┌─────────────────────┐
│   POS Context       │
│                     │
│ setSearchQuery(     │
│   barcode           │
│ )                   │
└──────┬──────────────┘
       │ searchQuery updated
       ▼
┌─────────────────────┐
│  Product Search     │
│                     │
│ 1. Filters products │
│ 2. Finds exact match│
│ 3. Auto-adds to cart│
└──────┬──────────────┘
       │ addToCart(product)
       ▼
┌─────────────────────┐
│   Cart Updated      │
│                     │
│ • Item added        │
│ • Quantity updated  │
│ • Totals calculated │
└─────────────────────┘
```

### Receipt Printing Flow

```
┌─────────────────────┐
│  User clicks        │
│  "COMPLETE ORDER"   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  completeSale()     │
│                     │
│ 1. Create sale data │
│ 2. Save to backend  │
│ 3. Store locally    │
│ 4. Clear cart       │
└──────┬──────────────┘
       │ setLastCompletedSale(data)
       ▼
┌─────────────────────┐
│  Payment Modal      │
│                     │
│ • Shows success     │
│ • Displays "PRINT   │
│   RECEIPT" button   │
└──────┬──────────────┘
       │ User clicks "PRINT RECEIPT"
       ▼
┌─────────────────────┐
│  printReceipt()     │
│                     │
│ 1. Get sale data    │
│ 2. Format receipt   │
│ 3. Create HTML      │
└──────┬──────────────┘
       │ receiptData
       ▼
┌─────────────────────┐
│  Thermal Printer    │
│     Service         │
│                     │
│ 1. Generate HTML    │
│ 2. Create iframe    │
│ 3. Load content     │
│ 4. Trigger print    │
└──────┬──────────────┘
       │ window.print()
       ▼
┌─────────────────────┐
│  Browser Print      │
│     Dialog          │
│                     │
│ • Select printer    │
│ • Configure options │
│ • Click Print       │
└──────┬──────────────┘
       │ Print job
       ▼
┌─────────────────────┐
│  Thermal Printer    │
│    (Hardware)       │
│                     │
│ • Receives job      │
│ • Prints receipt    │
│ • Cuts paper        │
└─────────────────────┘
```

## Component Hierarchy

```
App
└── POSProvider (Context)
    └── POSSalesPage
        ├── POSHeader
        │   └── Status indicators
        │
        ├── ProductSearch
        │   ├── Search input (barcode target)
        │   ├── Category tabs
        │   └── Product grid
        │       └── Product cards
        │
        ├── CartGrid
        │   └── Cart items
        │       └── Item rows
        │
        ├── CheckoutPanel
        │   ├── Totals display
        │   ├── Quick actions
        │   └── Payment button
        │
        ├── ShortcutBar
        │   └── Function key shortcuts
        │
        └── Modals
            ├── PaymentModal
            │   ├── Payment methods
            │   ├── Tender input
            │   ├── Payment summary
            │   ├── Complete order button
            │   └── Print receipt button ← NEW
            │
            ├── HeldSalesModal
            └── CustomerSelectionModal
```

## Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────┐      ┌────────────────────┐        │
│  │ BarcodeScanner     │      │ ThermalPrinter     │        │
│  │                    │      │                    │        │
│  │ • start()          │      │ • printReceipt()   │        │
│  │ • stop()           │      │ • testPrint()      │        │
│  │ • isActive()       │      │ • generateHTML()   │        │
│  │                    │      │                    │        │
│  │ Config:            │      │ Config:            │        │
│  │ • minLength        │      │ • paperWidth       │        │
│  │ • maxLength        │      │ • encoding         │        │
│  │ • timeout          │      │ • autoConnect      │        │
│  │ • onScan callback  │      │                    │        │
│  └────────────────────┘      └────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                    │                           │
                    │                           │
                    ▼                           ▼
        ┌──────────────────┐      ┌──────────────────────┐
        │  Browser APIs    │      │  Browser APIs        │
        │                  │      │                      │
        │  • KeyboardEvent │      │  • window.print()    │
        │  • addEventListener│     │  • iframe           │
        │  • setTimeout    │      │  • document.write()  │
        └──────────────────┘      └──────────────────────┘
```

## State Management

```
POSContext State Tree:
├── cart: POSCartItem[]
│   └── { id, productId, name, quantity, unitPrice, ... }
│
├── customer: POSCustomer | null
│   └── { id, name, phone, points, tier, ... }
│
├── payments: POSPayment[]
│   └── { id, method, amount, reference }
│
├── heldSales: POSHeldSale[]
│   └── { id, reference, cart, customerId, total, ... }
│
├── lastCompletedSale: SaleData | null ← NEW
│   └── { saleNumber, items, totals, payments, ... }
│
├── searchQuery: string ← Updated by barcode scanner
│
├── Modal States:
│   ├── isPaymentModalOpen: boolean
│   ├── isHeldSalesModalOpen: boolean
│   └── isCustomerModalOpen: boolean
│
└── Service Refs:
    ├── barcodeScannerRef: BarcodeScanner ← NEW
    └── thermalPrinterRef: ThermalPrinter ← NEW
```

## Event Flow

```
User Action → Component → Context → Service → Hardware
     │            │          │         │          │
     │            │          │         │          │
     ▼            ▼          ▼         ▼          ▼
  
Scan Item → ProductSearch → setSearchQuery → BarcodeScanner → USB Scanner
                │                                                    │
                └─────────────────────────────────────────────────┘
                                    │
                                    ▼
                            Item Added to Cart

Complete Sale → PaymentModal → completeSale() → Save Data
                     │                              │
                     └──────────────────────────────┘
                                    │
                                    ▼
                          Show Print Button

Print Receipt → PaymentModal → printReceipt() → ThermalPrinter → Thermal Printer
                                                                        │
                                                                        ▼
                                                                  Receipt Printed
```

## Integration Points

### 1. POSContext Integration
- Initializes services on mount
- Provides methods to components
- Manages service lifecycle
- Stores receipt data

### 2. ProductSearch Integration
- Receives searchQuery from context
- Filters products by barcode
- Auto-adds on exact match
- Clears search after add

### 3. PaymentModal Integration
- Triggers completeSale()
- Displays print button
- Calls printReceipt()
- Shows last sale data

### 4. Hardware Integration
- Barcode scanner: USB HID keyboard
- Thermal printer: Windows driver + Browser Print API
- No additional software needed
- Standard protocols

## Technology Stack

```
┌─────────────────────────────────────────┐
│         Frontend (React + TypeScript)    │
├─────────────────────────────────────────┤
│  • React Context API                     │
│  • TypeScript for type safety            │
│  • Custom hooks (usePOS)                 │
│  • Event listeners                       │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Services Layer                   │
├─────────────────────────────────────────┤
│  • BarcodeScanner (TypeScript class)     │
│  • ThermalPrinter (TypeScript class)     │
│  • Event-based architecture              │
│  • Callback patterns                     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Browser APIs                     │
├─────────────────────────────────────────┤
│  • KeyboardEvent API                     │
│  • Print API (window.print)              │
│  • DOM manipulation                      │
│  • setTimeout/clearTimeout               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Hardware Layer                   │
├─────────────────────────────────────────┤
│  • USB Barcode Scanner (HID)             │
│  • Thermal Printer (ESC/POS)             │
│  • Windows Drivers                       │
│  • Standard protocols                    │
└─────────────────────────────────────────┘
```

## Security & Performance

### Security Considerations
- ✅ No external API calls for hardware
- ✅ All processing client-side
- ✅ No sensitive data in receipts
- ✅ HTML sanitization in receipt generation
- ✅ Input validation for barcodes

### Performance Optimizations
- ✅ Service instances reused (refs)
- ✅ Debounced barcode detection
- ✅ Lazy initialization of printer
- ✅ Async operations for printing
- ✅ Minimal re-renders with useMemo/useCallback

### Error Handling
- ✅ Try-catch blocks in all services
- ✅ User-friendly error messages
- ✅ Console logging for debugging
- ✅ Graceful degradation
- ✅ Fallback behaviors

## Deployment Considerations

### Browser Compatibility
- ✅ Chrome (Recommended)
- ✅ Edge
- ✅ Firefox
- ⚠️ Safari (limited print support)

### Operating System
- ✅ Windows 10/11 (Primary)
- ⚠️ macOS (requires driver)
- ⚠️ Linux (requires CUPS)

### Hardware Requirements
- ✅ USB ports for scanner/printer
- ✅ Network port for network printer
- ✅ Minimum 4GB RAM
- ✅ Modern CPU (any)

This architecture provides a robust, maintainable, and scalable solution for POS hardware integration.
