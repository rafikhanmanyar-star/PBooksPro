# POS Receipt Print Template Implementation Plan

## Overview
Implement a configurable POS receipt print template with barcode support and transaction history search functionality.

## Requirements
1. Add POS receipt template configuration to Print Settings
2. Create thermal receipt format matching reference image
3. Add barcode generation for sale numbers
4. Enable barcode scanning in Sales History Modal
5. Make shop name, address, terminal, user ID configurable

## Implementation Steps

### 1. Update PrintSettings Type
**File**: `types.ts` (lines 639-673)

Add new fields to PrintSettings interface:
```typescript
export interface PrintSettings {
  // ... existing fields ...
  
  // POS Receipt Settings
  posShopName?: string;
  posShopAddress?: string;
  posShopPhone?: string;
  posTerminalId?: string;
  posShowBarcode?: boolean;
  posReceiptFooter?: string;
}
```

### 2. Update PrintTemplateForm Component
**File**: `components/settings/PrintTemplateForm.tsx`

Add new section for POS Receipt settings after line 619:
- Shop Name input
- Shop Address textarea
- Shop Phone input
- Terminal ID input
- Show Barcode checkbox
- Receipt Footer textarea

### 3. Create POS Receipt Template
**File**: `services/printer/posReceiptTemplate.ts` (NEW)

Create a new template generator that:
- Uses settings from PrintSettings
- Generates thermal receipt HTML (80mm width)
- Includes barcode using Code128 or similar
- Matches reference image layout

### 4. Update ThermalPrinter Service
**File**: `services/printer/thermalPrinter.ts`

Modify to use configurable template from settings:
- Accept PrintSettings in constructor
- Use posShopName, posShopAddress, etc. from settings
- Generate barcode for sale number

### 5. Update POSContext
**File**: `context/POSContext.tsx`

Pass PrintSettings to ThermalPrinter:
- Access state.printSettings
- Pass to createThermalPrinter()

### 6. Enhance SalesHistoryModal
**File**: `components/shop/pos/SalesHistoryModal.tsx`

Add barcode scanning support:
- Add barcode scanner integration
- Parse scanned barcode to extract sale number
- Auto-search and select matching sale
- Show visual feedback for barcode scan

### 7. Create Barcode Generator Utility
**File**: `utils/barcodeGenerator.ts` (NEW)

Utility functions for:
- Generating Code128 barcode SVG
- Encoding sale numbers
- Decoding scanned barcodes

## File Structure
```
services/
  printer/
    thermalPrinter.ts (UPDATE)
    posReceiptTemplate.ts (NEW)
    
components/
  settings/
    PrintTemplateForm.tsx (UPDATE)
  shop/
    pos/
      SalesHistoryModal.tsx (UPDATE)
      
context/
  POSContext.tsx (UPDATE)
  
utils/
  barcodeGenerator.ts (NEW)
  
types.ts (UPDATE)
```

## Receipt Layout (Reference)
```
┌─────────────────────────┐
│      SHOP NAME          │
│  Address: Lorem ipsum   │
│    Tel: XXXX XXXX       │
│                         │
│    CASH RECEIPT         │
│ ************************│
│ Date: 01/01/2021   20:21│
│ ************************│
│ Lorem ipsum        1.10 │
│ Lorem ipsum             │
│ Dolor sit          1.85 │
│ Color sit          1.85 │
│ Ipsum              3.69 │
│ Ipsum              3.69 │
│ ************************│
│ Total             14.28 │
│ Cash              15.00 │
│ Change             1.72 │
│ ************************│
│                         │
│     THANK YOU           │
│                         │
│  ||||||||||||||||||||   │ <- Barcode
│    SALE-2021-0001       │
└─────────────────────────┘
```

## Barcode Format
- Type: Code128
- Content: Sale Number (e.g., "SALE-2021-0001")
- Size: Fit within 80mm width
- Human-readable text below barcode

## Testing Checklist
- [ ] Print Settings UI shows POS receipt fields
- [ ] Settings save and load correctly
- [ ] Receipt prints with configured shop info
- [ ] Barcode generates correctly
- [ ] Barcode is scannable
- [ ] Sales History search works with barcode
- [ ] Manual search still works
- [ ] Receipt matches reference image layout

## Dependencies
- JsBarcode library for barcode generation (or SVG-based solution)
- Existing ThermalPrinter service
- Existing POSContext and SalesHistoryModal

## Notes
- Keep existing receipt functionality intact
- Make all POS settings optional with sensible defaults
- Ensure barcode is printer-friendly (high contrast, appropriate size)
- Test with actual thermal printer if available
