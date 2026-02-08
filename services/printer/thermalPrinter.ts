/**
 * Thermal Printer Service
 * Handles receipt printing to thermal printers (ESC/POS compatible)
 * Supports both direct USB printing and network printing
 */

import { PrintSettings } from '../../types';

export interface PrinterConfig {
    printerName?: string;
    paperWidth?: number; // in mm (default 80mm for thermal printers)
    encoding?: string;
    autoConnect?: boolean;
    printSettings?: PrintSettings; // Optional print settings for configurable templates
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
            printFrame.style.position = 'absolute';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
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

            // Wait for content to load
            await new Promise(resolve => setTimeout(resolve, 100));

            // Print
            printFrame.contentWindow?.print();

            // Automatically cut paper after printing
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

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Receipt ${data.receiptNumber}</title>
    <style>
        @page {
            size: 80mm auto;
            margin: 0;
        }
        
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
        }

        body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            color: #000;
            background: #fff;
            width: 80mm;
            margin: 0 auto;
            padding: 5mm;
        }

        .receipt {
            width: 100%;
        }

        .header {
            text-align: center;
            margin-bottom: 10px;
            border-bottom: 2px dashed #000;
            padding-bottom: 10px;
        }

        .store-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .store-info {
            font-size: 10px;
            line-height: 1.3;
        }

        .receipt-title {
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            margin: 10px 0;
        }

        .receipt-info {
            margin: 10px 0;
            font-size: 11px;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
        }

        .separator {
            border-top: 1px dashed #000;
            margin: 10px 0;
        }

        .items {
            margin: 10px 0;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 5px 0;
        }

        .item {
            margin: 5px 0;
        }

        .item-name {
            font-weight: bold;
        }

        .item-details {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin-left: 10px;
        }

        .totals {
            margin: 10px 0;
            font-size: 12px;
        }

        .total-row {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
        }

        .grand-total {
            font-size: 16px;
            font-weight: bold;
            border-top: 2px solid #000;
            border-bottom: 2px solid #000;
            padding: 5px 0;
            margin: 5px 0;
        }

        .payments {
            margin: 10px 0;
            border-top: 1px dashed #000;
            padding-top: 5px;
        }

        .payment-row {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
        }

        .change {
            font-size: 14px;
            font-weight: bold;
            margin: 5px 0;
        }

        .barcode-container {
            text-align: center;
            margin: 15px 0;
            padding: 10px 0;
            border-top: 1px dashed #000;
        }

        .barcode-container svg {
            max-width: 100%;
            height: auto;
        }

        .footer {
            text-align: center;
            margin-top: 15px;
            padding-top: 10px;
            border-top: 2px dashed #000;
            font-size: 10px;
        }
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
        <!-- Barcode -->
        <div class="barcode-container">
            ${this.generateBarcodeSVG(data.receiptNumber)}
        </div>
        ` : ''}

        <div style="margin-top: 50px; border-bottom: 2px dashed #eee; padding-bottom: 50px; text-align: center; color: #666; font-size: 8px;">
            *** END OF RECEIPT ***
            <br>
            [ CUT HERE ]
        </div>
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
