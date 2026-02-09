# POS Receipt Configuration Guide

## Quick Start Guide

### Step 1: Access Print Settings
1. Open the application
2. Click on **Settings** in the sidebar
3. Navigate to **Preferences** tab
4. Click on **Communication** sub-tab
5. Scroll down to find **Print Settings** card
6. Click **Print Settings** to open the configuration modal

### Step 2: Configure POS Receipt Template
In the Print Settings modal, scroll to the **"POS Receipt Template"** section:

#### Required Fields:
- **Shop Name**: Enter your store name (e.g., "PBooks Pro Store")
- **Shop Phone**: Enter your contact number (e.g., "+92-XXX-XXXXXXX")

#### Optional Fields:
- **Shop Address**: Enter your full address (multi-line supported)
- **Terminal ID**: Enter terminal identifier if you have multiple POS terminals (e.g., "TERMINAL-01")
- **Receipt Footer Text**: Custom message for customers (e.g., "Thank you for your business!")

#### Barcode Settings:
- ☑ **Show barcode on receipts**: Keep this checked to enable barcode scanning for transaction lookup

### Step 3: Save Settings
1. Review all entered information
2. Click **"Save Settings"** button at the bottom
3. You should see a success message: "Print template settings saved!"

### Step 4: Test Receipt Printing
1. Navigate to **Shop** → **POS Sales**
2. Add items to cart
3. Click **"Payment"** (F2)
4. Complete a test sale
5. Click **"Print Receipt"** button
6. Verify the receipt shows your configured information

### Step 5: Test Barcode Scanning
1. Print a test receipt (it will have a barcode at the bottom)
2. In POS Sales, press **F9** to open Sales History
3. Use a barcode scanner to scan the receipt barcode
4. The system should automatically find and select the transaction
5. Click **"REPRINT RECEIPT"** to print again

## Configuration Examples

### Example 1: Single Store Setup
```
Shop Name: PBooks Pro Store
Shop Address: 123 Main Street
              Karachi, Pakistan
Shop Phone: +92-321-1234567
Terminal ID: (leave empty)
Receipt Footer: Thank you! Visit us again!
Show Barcode: ☑ Checked
```

### Example 2: Multi-Terminal Setup
```
Shop Name: PBooks Pro - Downtown Branch
Shop Address: 456 Business Avenue
              Floor 2, Suite 201
              Karachi, Pakistan
Shop Phone: +92-321-7654321
Terminal ID: TERMINAL-01
Receipt Footer: Questions? Call us at +92-321-7654321
Show Barcode: ☑ Checked
```

### Example 3: Minimal Setup
```
Shop Name: My Store
Shop Phone: 0300-1234567
(All other fields left empty)
Show Barcode: ☑ Checked
```

## Troubleshooting

### Receipt doesn't show my shop name
- **Solution**: Make sure you clicked "Save Settings" after entering the information
- **Check**: Refresh the page and try printing again

### Barcode not appearing on receipt
- **Solution**: Ensure "Show barcode on receipts" checkbox is checked
- **Check**: Save settings and print a new receipt

### Barcode scanner not working in Sales History
- **Solution**: Make sure your barcode scanner is in HID (keyboard emulation) mode
- **Check**: Test the scanner in a text editor first - it should type the barcode

### Receipt shows old information
- **Solution**: The printer may be cached. Close and reopen the POS page
- **Check**: Verify settings were saved (check Settings → Print Settings again)

### Paper doesn't cut automatically
- **Solution**: This is configured in the printer driver, not in the app
- **Check**: See `POS_BARCODE_PRINTER_GUIDE.md` for printer driver configuration

## Tips & Best Practices

### Shop Name
- Keep it short and clear (max 30 characters recommended)
- Use your business name as customers know it
- Avoid special characters that may not print well

### Shop Address
- Use 2-3 lines maximum for readability
- Include city and postal code
- Keep each line under 40 characters

### Shop Phone
- Use a format customers can easily read
- Include country code for international customers
- Consider adding WhatsApp icon if applicable

### Terminal ID
- Use only if you have multiple POS terminals
- Keep it short (e.g., "T1", "MAIN", "COUNTER-A")
- Helps identify which terminal processed the sale

### Receipt Footer
- Keep it friendly and professional
- Maximum 2 lines recommended
- Consider including:
  - Return policy reminder
  - Website or social media
  - Operating hours
  - Loyalty program info

### Barcode
- Always keep enabled for easy transaction lookup
- Useful for returns and exchanges
- Helps with customer service inquiries
- Essential for audit trail

## Advanced Configuration

### Multiple Languages
Currently, the system supports single-language receipts. For multi-language support:
1. Use the language your primary customers speak
2. Consider adding English translations in the footer
3. Future versions may support language switching

### Custom Branding
For logo support:
1. Currently not available in POS receipts
2. Available in invoice templates (Settings → Print Settings → Company Logo)
3. Future versions may support logo on POS receipts

### Receipt Customization
To further customize receipts:
1. Modify `services/printer/thermalPrinter.ts`
2. Adjust CSS styles in the `generateReceiptHTML()` method
3. Test thoroughly before deploying to production

## Keyboard Shortcuts

While in POS Sales:
- **F2**: Open Payment Modal
- **F9**: Open Sales History (for barcode scanning)
- **ESC**: Close current modal

## Related Documentation

- `POS_BARCODE_PRINTER_GUIDE.md` - Printer setup and configuration
- `POS_QUICK_START.md` - General POS usage guide
- `AUTOMATIC_PAPER_CUTTING_IMPLEMENTATION.md` - Auto-cut setup
- `POS_RECEIPT_IMPLEMENTATION_SUMMARY.md` - Technical implementation details

## Support

If you encounter issues:
1. Check this guide first
2. Review the troubleshooting section
3. Verify all settings are saved
4. Test with a sample receipt
5. Check browser console for errors (F12)

---

**Last Updated**: February 2026
**Version**: 1.0
