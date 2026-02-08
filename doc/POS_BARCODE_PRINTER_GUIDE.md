# POS System - Barcode Scanner & Thermal Printer Integration

This document explains how to use the barcode scanner and thermal printer features in the POS system.

## Overview

The POS system now supports:
1. **Barcode Scanner Integration** - Automatically scan product barcodes to add items to cart
2. **Thermal Receipt Printing** - Print professional receipts on 80mm thermal printers

## Barcode Scanner Setup

### Hardware Requirements
- USB Barcode Scanner (HID keyboard emulation mode)
- Compatible with most standard barcode scanners including:
  - Honeywell/Metrologic scanners
  - Zebra/Symbol scanners
  - Datalogic scanners
  - Generic USB barcode scanners

### Configuration

The barcode scanner is automatically initialized when the POS page loads. No additional configuration is required.

#### Scanner Settings
- **Minimum barcode length**: 3 characters
- **Maximum barcode length**: 50 characters
- **Timeout between characters**: 100ms
- **Auto-focus**: Enabled (search field automatically focused)

### How to Use

1. **Automatic Scanning**:
   - Simply scan any product barcode
   - The scanner will automatically detect the barcode input
   - If a matching product is found, it will be added to the cart immediately
   - The search field will be cleared automatically

2. **Manual Entry**:
   - You can also manually type a barcode in the search field
   - Press Enter or wait for the timeout to trigger the search

3. **Search Behavior**:
   - Exact barcode match → Item added to cart automatically
   - Partial match → Shows filtered products in the grid
   - No match → Shows "No items found" message

### Troubleshooting

**Scanner not working?**
- Ensure the scanner is in HID keyboard emulation mode
- Check that the scanner is properly connected via USB
- Verify the scanner is configured to send Enter key after barcode
- Test the scanner in a text editor to ensure it's typing correctly

**Items not adding automatically?**
- Verify the barcode in your database matches the scanned barcode exactly
- Check the browser console for any error messages
- Ensure the product has a valid barcode field in the database

## Thermal Printer Setup

### Hardware Requirements
- 80mm Thermal Receipt Printer
- ESC/POS compatible printer (most thermal printers support this)
- Compatible printers include:
  - Epson TM-T20/T82/T88 series
  - Star TSP100/TSP650 series
  - Bixolon SRP-350/SRP-275 series
  - Generic 80mm thermal printers

### Windows Setup

1. **Install Printer Driver**:
   - Connect your thermal printer via USB or Network
   - Install the manufacturer's driver from the CD or website
   - Windows should detect the printer automatically

2. **Configure Printer**:
   - Open Windows Settings → Devices → Printers & Scanners
   - Find your thermal printer in the list
   - Click "Manage" → "Printing Preferences"
   - Set paper size to 80mm (or 3.15 inches)
   - Set orientation to Portrait
   - Disable margins if possible

3. **Set as Default (Optional)**:
   - Right-click the printer and select "Set as default printer"
   - This will make it the default for all print operations

### How to Print Receipts

1. **After Completing a Sale**:
   - Complete the payment in the Payment Modal
   - Click "COMPLETE ORDER" button
   - A "PRINT RECEIPT" button will appear
   - Click "PRINT RECEIPT" to print

2. **Print Dialog**:
   - The browser's print dialog will appear
   - Select your thermal printer from the list
   - Click "Print"
   - The receipt will be printed immediately

### Silent Printing (Direct Print)

To print receipts automatically without showing the print preview:
1. **Set Windows Default**: Ensure your Thermal Printer is set as the "Default Printer" in Windows Settings.
2. **Enable Chrome Kiosk Mode**: 
   - In your Chrome shortcut target, add `--kiosk-printing` at the end.
   - Example: `chrome.exe --kiosk-printing`

### Auto-Cutting Paper

1. Go to Printer **Printing Preferences** -> **Device Settings**.
2. Set **Cutter** to "Cut at end of job".

### Reprinting Receipts

1. Press **F9** in the POS to search old sales history.
2. Select a sale and click **REPRINT RECEIPT** to print a previous receipt.

3. **Receipt Contents**:
   - Store name and information
   - Receipt number and timestamp
   - Cashier name
   - Customer name (if selected)
   - Itemized list with quantities and prices
   - Subtotal, discounts, and taxes
   - Total amount
   - Payment methods
   - Change due (if applicable)
   - Barcode for receipt number
   - Thank you message

### Customizing Receipt

You can customize the receipt by editing the `thermalPrinter.ts` file:

```typescript
// Location: services/printer/thermalPrinter.ts

// Customize store information in POSContext.tsx:
const receiptData: ReceiptData = {
    storeName: 'Your Store Name',
    storeAddress: 'Your Address',
    storePhone: 'Your Phone',
    taxId: 'Your Tax ID',
    // ... rest of the data
};
```

### Troubleshooting

**Print dialog not appearing?**
- Check browser console for errors
- Ensure pop-ups are not blocked for this site
- Try a different browser (Chrome recommended)

**Receipt not formatting correctly?**
- Verify printer paper size is set to 80mm
- Check printer preferences for correct paper width
- Ensure "Fit to page" is disabled in print settings

**Printer not listed in print dialog?**
- Verify printer is properly installed in Windows
- Check printer is turned on and connected
- Try printing a test page from Windows Settings

**Receipt cuts off or wraps incorrectly?**
- Adjust the CSS in `thermalPrinter.ts`
- Check the `@page` size setting
- Verify printer paper width matches the CSS width

## Keyboard Shortcuts

The POS system includes several keyboard shortcuts for efficiency:

- **F1**: Clear cart
- **F2**: Hold current sale
- **F3**: View held sales
- **F4**: Focus search field (for manual barcode entry)
- **F6**: Select customer
- **F8**: Open payment modal
- **F12**: Complete sale (if balance is paid)

## Best Practices

1. **Barcode Scanning**:
   - Keep the search field focused for fastest scanning
   - Scan barcodes at a steady pace
   - Ensure barcodes are clean and undamaged
   - Use good lighting for optimal scanning

2. **Receipt Printing**:
   - Keep thermal paper stocked
   - Clean printer head regularly
   - Use quality thermal paper for best results
   - Test print before opening for the day

3. **Performance**:
   - The barcode scanner runs continuously in the background
   - Minimal performance impact
   - Printer only initializes when needed
   - All operations are asynchronous

## Technical Details

### Barcode Scanner Service
- **File**: `services/barcode/barcodeScanner.ts`
- **Type**: Keyboard event listener
- **Mode**: HID keyboard emulation
- **Auto-start**: Yes
- **Auto-cleanup**: Yes (on component unmount)

### Thermal Printer Service
- **File**: `services/printer/thermalPrinter.ts`
- **Method**: Browser Print API
- **Format**: HTML to Print
- **Paper**: 80mm thermal
- **Encoding**: UTF-8

### Integration Points
- **POSContext**: Main integration point
- **PaymentModal**: Print receipt button
- **ProductSearch**: Barcode scanning and auto-add

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify hardware connections
3. Test hardware with manufacturer's tools
4. Check this documentation for troubleshooting steps

## Future Enhancements

Planned features:
- [ ] Direct ESC/POS command support (bypass browser print)
- [ ] Receipt template customization UI
- [ ] Multiple receipt formats (customer copy, merchant copy)
- [ ] Email receipt option
- [ ] SMS receipt option
- [ ] Receipt history and reprint
- [ ] Barcode scanner configuration UI
- [ ] Support for 2D barcodes (QR codes)
