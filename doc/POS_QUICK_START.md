# Quick Start Guide - Barcode Scanner & Receipt Printer

## 🚀 Quick Setup (5 Minutes)

### Step 1: Connect Barcode Scanner
1. Plug USB barcode scanner into computer
2. Wait for Windows to recognize it
3. Test by scanning a barcode in Notepad - it should type the barcode and press Enter
4. ✅ Scanner is ready!

### Step 2: Connect Thermal Printer
1. Plug thermal printer into computer (USB or Network)
2. Install driver from manufacturer's website or CD
3. Go to Windows Settings → Printers & Scanners
4. Verify printer appears in the list
5. Print a test page from Windows
6. ✅ Printer is ready!

### Step 3: Use in POS System
1. Open POS Sales page in the application
2. Scanner automatically activates
3. Scan product barcodes - items add to cart automatically
4. Complete sale and payment
5. Click "PRINT RECEIPT" button
6. Select your thermal printer
7. ✅ Receipt prints!

## 📱 Using Barcode Scanner

### Automatic Mode (Recommended)
1. **Just scan!** The scanner is always listening
2. Product automatically adds to cart when barcode matches
3. Search field clears automatically
4. Ready for next scan immediately

### Manual Mode
1. Click in search field (or press F4)
2. Type or scan barcode
3. Press Enter
4. Product adds to cart

### Tips for Best Results
- ✅ Keep search field focused (auto-focuses every second)
- ✅ Scan at steady pace (not too fast)
- ✅ Ensure good lighting for scanner
- ✅ Keep barcodes clean and undamaged
- ✅ Hold scanner 4-6 inches from barcode

## 🖨️ Printing Receipts

### After Each Sale
1. Complete payment in Payment Modal
2. Click **"COMPLETE ORDER"** button
3. **"PRINT RECEIPT"** button appears
4. Click to print
5. Select thermal printer in dialog
6. Click "Print"
7. Receipt prints automatically

### Receipt Includes
- ✅ Store information
- ✅ Receipt number with barcode
- ✅ Date and time
- ✅ Cashier name
- ✅ Customer name (if selected)
- ✅ All items with prices
- ✅ Discounts and taxes
- ✅ Payment methods
- ✅ Change due
- ✅ Thank you message

### Reprint Last Receipt
1. Stay in Payment Modal after completing sale
2. **"PRINT RECEIPT"** button remains visible
3. Click again to reprint
4. Can print multiple copies

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **F1** | Clear cart |
| **F2** | Hold current sale |
| **F3** | View held sales |
| **F4** | Focus search field |
| **F6** | Select customer |
| **F8** | Open payment modal |
| **F12** | Complete sale (if paid) |

## 🔧 Troubleshooting

### Scanner Not Working?

**Problem**: Scanned barcodes don't add items

**Solutions**:
1. ✅ Check USB connection is secure
2. ✅ Test scanner in Notepad - should type barcode
3. ✅ Verify barcode exists in product database
4. ✅ Check browser console (F12) for errors
5. ✅ Refresh the page to restart scanner

**Problem**: Scanner adds wrong items

**Solutions**:
1. ✅ Verify barcode matches product in database
2. ✅ Check for duplicate barcodes
3. ✅ Clean barcode label if damaged
4. ✅ Ensure scanner is configured for correct format

### Printer Not Working?

**Problem**: Print dialog doesn't appear

**Solutions**:
1. ✅ Check browser allows pop-ups for this site
2. ✅ Try different browser (Chrome recommended)
3. ✅ Check browser console (F12) for errors
4. ✅ Verify sale was completed successfully

**Problem**: Printer not in list

**Solutions**:
1. ✅ Check printer is turned on
2. ✅ Verify printer driver is installed
3. ✅ Test print from Windows Settings
4. ✅ Restart printer and computer
5. ✅ Check USB/Network connection

**Problem**: Receipt prints incorrectly

**Solutions**:
1. ✅ Set paper size to 80mm in printer preferences
2. ✅ Set orientation to Portrait
3. ✅ Disable "Fit to page" option
4. ✅ Check thermal paper is loaded correctly
5. ✅ Clean printer head if faded

## 📋 Daily Checklist

### Opening Procedures
- [ ] Turn on thermal printer
- [ ] Load thermal paper if needed
- [ ] Test print a receipt
- [ ] Connect barcode scanner
- [ ] Test scan a product
- [ ] Open POS Sales page
- [ ] Verify scanner is active (check console)

### During Operations
- [ ] Keep search field focused for scanning
- [ ] Print receipt for every sale
- [ ] Check printer paper level regularly
- [ ] Verify receipts print clearly

### Closing Procedures
- [ ] Print end-of-day reports
- [ ] Turn off thermal printer
- [ ] Disconnect scanner (optional)
- [ ] Check all receipts printed correctly

## 🎯 Best Practices

### For Speed
1. ✅ Use barcode scanner for all products
2. ✅ Keep commonly scanned items accessible
3. ✅ Use keyboard shortcuts (F-keys)
4. ✅ Pre-select customer before scanning
5. ✅ Keep search field focused

### For Accuracy
1. ✅ Verify item added before scanning next
2. ✅ Check quantities are correct
3. ✅ Review cart before payment
4. ✅ Print receipt for customer verification
5. ✅ Keep receipts for audit trail

### For Maintenance
1. ✅ Clean scanner lens weekly
2. ✅ Clean printer head monthly
3. ✅ Use quality thermal paper
4. ✅ Keep backup paper rolls
5. ✅ Test equipment daily

## 📞 Getting Help

### Check These First
1. 📖 Read `POS_BARCODE_PRINTER_GUIDE.md` for detailed setup
2. 📖 Read `POS_BARCODE_PRINTER_IMPLEMENTATION.md` for technical details
3. 🔍 Check browser console (F12) for error messages
4. 🧪 Use Hardware Test page to verify equipment

### Common Questions

**Q: Can I use any barcode scanner?**
A: Yes! Any USB scanner that works in HID keyboard mode will work.

**Q: Can I use any thermal printer?**
A: Yes! Any 80mm ESC/POS compatible thermal printer will work.

**Q: Do I need special software?**
A: No! Just install the printer driver from the manufacturer.

**Q: Can I print on regular paper?**
A: Yes, but thermal paper is recommended for receipts.

**Q: Can I email receipts instead?**
A: Not yet, but this feature is planned for future updates.

**Q: Can I customize the receipt?**
A: Yes! Edit the store information in `POSContext.tsx`.

**Q: Can I reprint old receipts?**
A: Currently only the last completed sale. Full history coming soon.

## 🎉 You're Ready!

Your POS system is now equipped with professional barcode scanning and receipt printing. Enjoy faster checkouts and happier customers!

---

**Need More Help?**
- 📖 Full documentation: `doc/POS_BARCODE_PRINTER_GUIDE.md`
- 🔧 Technical details: `doc/POS_BARCODE_PRINTER_IMPLEMENTATION.md`
- 🧪 Test equipment: Use the Hardware Test component
