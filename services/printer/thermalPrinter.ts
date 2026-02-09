/**
 * Thermal Printer Service
 * Handles receipt printing to thermal printers (ESC/POS compatible)
 * Supports both direct USB printing and network printing
 */

import { PrintSettings } from '../../types';
import html2canvas from 'html2canvas';

export interface PrinterConfig {
    printerName?: string;
    paperWidth?: number; // in mm (default 80mm for thermal printers)
    encoding?: string;
    autoConnect?: boolean;
    printSettings?: PrintSettings; // Optional print settings for configurable templates
    /**
     * If true, rasterizes the receipt HTML into a single PNG before printing.
     * This dramatically improves output consistency on many thermal printer drivers
     * (fixes "preview looks right, but printer outputs plain text / loses layout / skips barcode").
     */
    rasterize?: boolean;
}

export interface ReceiptData {
    storeName: string;
    storeAddress?: string;
    storePhone?: string;
    taxId?: string;
    receiptNumber: string;
    date: string;
    time: string;
    cashier: string;
    customer?: string;
    items: ReceiptItem[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    payments: ReceiptPayment[];
    change?: number;
    footer?: string;
}

export interface ReceiptItem {
    name: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    total: number;
}

export interface ReceiptPayment {
    method: string;
    amount: number;
}

/**
 * Thermal Printer Service
 * Uses browser's native print API for thermal printer integration
 */
export class ThermalPrinter {
    private config: PrinterConfig;
    private printSettings?: PrintSettings;

    constructor(config: PrinterConfig = {}) {
        this.config = {
            paperWidth: 80, // 80mm thermal paper
            encoding: 'UTF-8',
            autoConnect: true,
            rasterize: true,
            ...config
        };
        this.printSettings = config.printSettings;
    }

    /**
     * Print receipt using browser's print dialog
     * This will work with any printer configured in Windows
     */
    async printReceipt(data: ReceiptData): Promise<void> {
        try {
            // Create a hidden iframe for printing
            const printFrame = document.createElement('iframe');
            // NOTE: must not be 0x0. Some browsers/drivers (and html2canvas) will render a blank page
            // when the iframe viewport is zero-sized, resulting in "nothing prints".
            printFrame.style.position = 'fixed';
            printFrame.style.left = '-10000px';
            printFrame.style.top = '0';
            printFrame.style.width = '400px';
            printFrame.style.height = '1200px';
            printFrame.style.opacity = '0';
            printFrame.style.pointerEvents = 'none';
            printFrame.style.border = 'none';
            document.body.appendChild(printFrame);

            const doc = printFrame.contentWindow?.document;
            if (!doc) {
                throw new Error('Failed to create print document');
            }

            // Generate receipt HTML
            const receiptHTML = this.generateReceiptHTML(data);

            doc.open();
            doc.write(receiptHTML);
            doc.close();

            // Wait for DOM + resources (barcode image) to be ready
            await this.waitForPrintDocumentReady(doc);

            // Some thermal printer drivers will ignore CSS layout / images and print "text-only".
            // Rasterizing the receipt into an image forces graphics output so the paper matches the preview.
            if (this.config.rasterize) {
                try {
                    await this.rasterizeReceiptToImage(doc);
                    // Ensure the generated PNG is fully loaded before printing.
                    await this.waitForPrintDocumentReady(doc);
                } catch (err) {
                    // Fallback to HTML printing if rasterization fails for any reason
                    console.warn('⚠️ Receipt rasterization failed, falling back to HTML print.', err);
                }
            }

            // Print, then (driver-configured) cut
            await this.printAndWaitForCompletion(printFrame);
            await this.cutPaper();

            // Clean up after printing
            setTimeout(() => {
                document.body.removeChild(printFrame);
            }, 1000);

        } catch (error) {
            console.error('Print error:', error);
            throw new Error(`Failed to print receipt: ${error}`);
        }
    }

    private async printAndWaitForCompletion(printFrame: HTMLIFrameElement): Promise<void> {
        const win = printFrame.contentWindow;
        if (!win) return;

        // Best-effort: wait for "afterprint" so we don't tear down too early.
        await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                try {
                    win.removeEventListener('afterprint', finish);
                } catch {
                    // ignore
                }
                resolve();
            };

            try {
                win.addEventListener('afterprint', finish, { once: true });
            } catch {
                // ignore
            }

            // Fallback: some browsers/drivers don't reliably fire afterprint
            setTimeout(finish, 8000);

            try {
                win.focus();
                win.print();
            } catch {
                // If print fails, still resolve so caller can throw higher up
                finish();
            }
        });
    }

    private async waitForPrintDocumentReady(doc: Document): Promise<void> {
        // Ensure the document is "interactive"/"complete"
        await new Promise<void>((resolve) => setTimeout(resolve, 150));

        // Wait for fonts (if supported)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fontsReady = (doc as any).fonts?.ready;
            if (fontsReady && typeof fontsReady.then === 'function') {
                await fontsReady;
            }
        } catch {
            // ignore
        }

        // Wait for images (barcode <img>) to load/decode
        const images = Array.from(doc.images || []);
        await Promise.all(images.map(async (img) => {
            try {
                if (!img.complete) {
                    await new Promise<void>((resolve) => {
                        const onDone = () => resolve();
                        img.addEventListener('load', onDone, { once: true });
                        img.addEventListener('error', onDone, { once: true });
                    });
                }
                // decode() is more reliable when available
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const anyImg = img as any;
                if (typeof anyImg.decode === 'function') {
                    await anyImg.decode();
                }
            } catch {
                // ignore
            }
        }));
    }

    private async rasterizeReceiptToImage(doc: Document): Promise<void> {
        const receiptEl = doc.querySelector('.receipt') as HTMLElement | null;
        if (!receiptEl) return;

        // Ensure layout is settled before capturing.
        await new Promise<void>((resolve) => setTimeout(resolve, 50));

        const canvas = await html2canvas(receiptEl, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true,
        });

        const png = canvas.toDataURL('image/png');

        // Replace the document with a single image for maximum driver compatibility.
        const widthPx = receiptEl.getBoundingClientRect().width || 302;
        doc.open();
        doc.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${Math.round(widthPx)}">
  <title>Receipt</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    @page { size: 80mm auto; margin: 0; }
    body { width: ${Math.round(widthPx)}px; max-width: ${Math.round(widthPx)}px; }
    img { display: block; width: 100%; height: auto; }
    @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <img src="${png}" alt="Receipt" />
</body>
</html>
        `);
        doc.close();

        // Give the browser a beat to load the PNG before printing.
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }

    /**
     * Generate HTML for thermal receipt
     * Optimized for 80mm thermal printers
     */
    private generateReceiptHTML(data: ReceiptData): string {
        const { items, payments } = data;

        // Use PrintSettings if available, otherwise fall back to data
        const shopName = this.printSettings?.posShopName || data.storeName;
        const shopAddress = this.printSettings?.posShopAddress || data.storeAddress;
        const shopPhone = this.printSettings?.posShopPhone || data.storePhone;
        const terminalId = this.printSettings?.posTerminalId;
        const showBarcode = this.printSettings?.posShowBarcode ?? true;
        const footerText = this.printSettings?.posReceiptFooter || data.footer || 'Thank you for your business!';

        /* 80mm thermal (e.g. Black Copper): 80mm = 302px at 96dpi. Use px so preview = print. */
        const WIDTH_PX = 302;
        const PADDING_PX = 8;

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=${WIDTH_PX}">
    <title>Receipt ${data.receiptNumber}</title>
    <style>
        * { box-sizing: border-box; }
        html { margin: 0; padding: 0; }
        /* 80mm paper for Black Copper / thermal; no margin so receipt fills roll */
        @page {
            size: 80mm auto;
            margin: 0;
        }
        body {
            font-family: 'Courier New', Consolas, monospace;
            font-size: 11px;
            line-height: 1.35;
            color: #000;
            background: #fff;
            margin: 0;
            padding: ${PADDING_PX}px;
            width: ${WIDTH_PX}px;
            min-width: ${WIDTH_PX}px;
            max-width: ${WIDTH_PX}px;
        }
        .receipt {
            width: ${WIDTH_PX - PADDING_PX * 2}px;
        }
        @media print {
            html, body {
                margin: 0 !important;
                padding: ${PADDING_PX}px !important;
                width: ${WIDTH_PX}px !important;
                min-width: ${WIDTH_PX}px !important;
                max-width: ${WIDTH_PX}px !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .receipt { width: ${WIDTH_PX - PADDING_PX * 2}px !important; }
            .barcode-container, .receipt-end { page-break-inside: avoid; page-break-before: avoid; }
            .barcode-container, .barcode-container img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }

        .header {
            text-align: center;
            margin-bottom: 6px;
            border-bottom: 1px dashed #000;
            padding-bottom: 6px;
        }
        .store-name { font-size: 14px; font-weight: bold; margin-bottom: 3px; }
        .store-info { font-size: 9px; line-height: 1.25; }
        .receipt-title { text-align: center; font-size: 12px; font-weight: bold; margin: 6px 0; }
        .receipt-info { margin: 6px 0; font-size: 10px; }
        .info-row { display: flex; justify-content: space-between; margin: 1px 0; }
        .separator { border-top: 1px dashed #000; margin: 6px 0; }
        .items { margin: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; }
        .item { margin: 4px 0; }
        .item-name { font-weight: bold; }
        .item-details { display: flex; justify-content: space-between; font-size: 10px; margin-left: 8px; }
        .totals { margin: 6px 0; font-size: 11px; }
        .total-row { display: flex; justify-content: space-between; margin: 2px 0; }
        .grand-total { font-size: 13px; font-weight: bold; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0; margin: 4px 0; }
        .payments { margin: 6px 0; border-top: 1px dashed #000; padding-top: 4px; }
        .payment-row { display: flex; justify-content: space-between; margin: 2px 0; }
        .change { font-size: 12px; font-weight: bold; margin: 4px 0; }
        .barcode-container { text-align: center; margin: 10px 0; padding: 8px 0; border-top: 1px dashed #000; }
        .barcode-container svg, .barcode-container .barcode-img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
        .barcode-text { font-size: 9px; margin-top: 4px; font-weight: bold; }
        .footer { text-align: center; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #000; font-size: 9px; }
        .receipt-end { margin-top: 12px; padding-bottom: 12px; border-bottom: 1px dashed #ccc; text-align: center; color: #333; font-size: 8px; }
    </style>
</head>
<body>
    <div class="receipt">
        <!-- Header -->
        <div class="header">
            <div class="store-name">${this.escapeHTML(shopName)}</div>
            ${shopAddress ? `<div class="store-info">Address: ${this.escapeHTML(shopAddress)}</div>` : ''}
            ${shopPhone ? `<div class="store-info">Tel: ${this.escapeHTML(shopPhone)}</div>` : ''}
            ${data.taxId ? `<div class="store-info">Tax ID: ${this.escapeHTML(data.taxId)}</div>` : ''}
        </div>

        <div class="receipt-title">CASH RECEIPT</div>
        <div class="separator"></div>

        <!-- Receipt Info -->
        <div class="receipt-info">
            <div class="info-row">
                <span>Date: ${this.escapeHTML(data.date)}</span>
                <span>${this.escapeHTML(data.time)}</span>
            </div>
            ${terminalId ? `
            <div class="info-row">
                <span>Terminal:</span>
                <span>${this.escapeHTML(terminalId)}</span>
            </div>
            ` : ''}
            <div class="info-row">
                <span>Cashier:</span>
                <span>${this.escapeHTML(data.cashier)}</span>
            </div>
            ${data.customer ? `
            <div class="info-row">
                <span>Customer:</span>
                <span>${this.escapeHTML(data.customer)}</span>
            </div>
            ` : ''}
        </div>

        <div class="separator"></div>

        <!-- Items -->
        <div class="items">
            ${items.map(item => `
                <div class="item">
                    <div class="item-name">${this.escapeHTML(item.name)}</div>
                    <div class="item-details">
                        <span>${item.quantity} x ${this.formatCurrency(item.unitPrice)}</span>
                        <span>${this.formatCurrency(item.total)}</span>
                    </div>
                    ${item.discount && item.discount > 0 ? `
                    <div class="item-details">
                        <span>Discount:</span>
                        <span>-${this.formatCurrency(item.discount)}</span>
                    </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>

        <div class="separator"></div>

        <!-- Totals -->
        <div class="totals">
            <div class="total-row">
                <span>Subtotal:</span>
                <span>${this.formatCurrency(data.subtotal)}</span>
            </div>
            ${data.discount > 0 ? `
            <div class="total-row">
                <span>Discount:</span>
                <span>-${this.formatCurrency(data.discount)}</span>
            </div>
            ` : ''}
            <div class="total-row">
                <span>Tax:</span>
                <span>${this.formatCurrency(data.tax)}</span>
            </div>
            <div class="total-row grand-total">
                <span>TOTAL:</span>
                <span>${this.formatCurrency(data.total)}</span>
            </div>
        </div>

        <div class="separator"></div>

        <!-- Payments -->
        <div class="payments">
            ${payments.map(payment => `
                <div class="payment-row">
                    <span>${this.escapeHTML(payment.method)}:</span>
                    <span>${this.formatCurrency(payment.amount)}</span>
                </div>
            `).join('')}
            ${data.change && data.change > 0 ? `
            <div class="payment-row change">
                <span>CHANGE:</span>
                <span>${this.formatCurrency(data.change)}</span>
            </div>
            ` : ''}
        </div>

        <!-- Footer -->
        <div class="footer">
            ${footerText}
            <br>
            Please keep this receipt for your records
        </div>

        ${showBarcode ? `
        <!-- Barcode: use img + data URL so thermal drivers that skip SVG still print it -->
        <div class="barcode-container">
            <img class="barcode-img" src="${this.getBarcodeDataURL(data.receiptNumber)}" alt="${this.escapeHTML(data.receiptNumber)}" width="250" height="80" />
            <div class="barcode-text">${this.escapeHTML(data.receiptNumber)}</div>
        </div>
        ` : ''}

        <div class="receipt-end">
            *** END OF RECEIPT ***<br>[ CUT HERE ]
        </div>
        <!-- Extra feed helps cutters and manual tear-off -->
        <div style="height: 16mm;"></div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Guide for Silent Printing (Direct Print without Preview)
     * To enable this in Chrome:
     * 1. Set your Thermal Printer as the Windows Default Printer.
     * 2. Launch Chrome with the --kiosk-printing flag.
     *    Example: chrome.exe --kiosk-printing
     */
    getSilentPrintGuide(): string {
        return `
            To print without a preview dialog:
            1. Set your Thermal Printer as the Windows Default Printer.
            2. Launch Chrome with the --kiosk-printing flag.
        `;
    }

    /**
     * Generate Code128-style barcode SVG
     * Creates a simple barcode representation for receipt numbers
     */
    private generateBarcodeSVG(text: string): string {
        // Simple barcode pattern generator
        // In production, you might want to use a proper Code128 library
        const barcodeWidth = 250;
        const barcodeHeight = 60;
        const barWidth = 2;

        // Convert text to binary pattern (simplified)
        let pattern = '';
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            pattern += charCode.toString(2).padStart(8, '0');
        }

        // Generate SVG bars
        let bars = '';
        let x = 0;
        for (let i = 0; i < pattern.length && x < barcodeWidth; i++) {
            if (pattern[i] === '1') {
                bars += `<rect x="${x}" y="0" width="${barWidth}" height="${barcodeHeight}" fill="black"/>`;
            }
            x += barWidth;
        }

        return `
            <svg width="${barcodeWidth}" height="${barcodeHeight + 20}" xmlns="http://www.w3.org/2000/svg">
                <rect width="${barcodeWidth}" height="${barcodeHeight}" fill="white"/>
                ${bars}
                <text x="${barcodeWidth / 2}" y="${barcodeHeight + 15}" 
                      font-family="monospace" font-size="10" 
                      text-anchor="middle" fill="black">${text}</text>
            </svg>
        `;
    }

    /**
     * Return barcode as data URL so thermal drivers that skip inline SVG can print it via <img>
     */
    private getBarcodeDataURL(text: string): string {
        const svg = this.generateBarcodeSVG(text).replace(/\s+/g, ' ').trim();
        if (typeof btoa !== 'undefined') {
            return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        }
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    /**
     * Cut paper after printing
     * 
     * Note: Since we're using the browser's print API (not direct ESC/POS commands),
     * automatic paper cutting must be configured in the printer driver settings.
     * 
     * To enable automatic cutting:
     * 1. Open Windows Settings → Devices → Printers & Scanners
     * 2. Select your thermal printer → Manage → Printing Preferences
     * 3. Go to Device Settings tab
     * 4. Set "Cutter" option to "Cut at end of job"
     * 
     * This method serves as a placeholder and documentation for the cutting functionality.
     * The actual cutting is performed by the printer driver based on its configuration.
     */
    async cutPaper(): Promise<void> {
        // Log that cutting should occur (if printer is configured)
        console.log('📄 Receipt printed - Paper will be cut automatically if printer cutter is enabled');

        // Wait a moment to ensure print job is fully sent to printer
        await new Promise(resolve => setTimeout(resolve, 200));

        // Note: Direct ESC/POS cutting command would be: \x1D\x56\x00 (GS V 0)
        // However, browser print API doesn't support sending raw ESC/POS commands
        // The cutting must be configured in the printer driver settings
    }

    /**
     * Format currency value
     */
    private formatCurrency(amount: number): string {
        return amount.toLocaleString('en-PK', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHTML(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Test printer connection by printing a test receipt
     */
    async testPrint(): Promise<void> {
        const testData: ReceiptData = {
            storeName: 'Test Print',
            receiptNumber: 'TEST-001',
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            cashier: 'System',
            items: [
                {
                    name: 'Test Item',
                    quantity: 1,
                    unitPrice: 100,
                    total: 100
                }
            ],
            subtotal: 100,
            discount: 0,
            tax: 0,
            total: 100,
            payments: [
                {
                    method: 'Cash',
                    amount: 100
                }
            ],
            footer: 'This is a test receipt'
        };

        await this.printReceipt(testData);
    }
}

/**
 * Create a thermal printer instance
 */
export function createThermalPrinter(config?: PrinterConfig): ThermalPrinter {
    return new ThermalPrinter(config);
}
