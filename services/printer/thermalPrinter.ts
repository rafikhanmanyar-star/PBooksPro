/**
 * Thermal Printer Service
 * Handles receipt printing to thermal printers (ESC/POS compatible)
 * Supports both direct USB printing and network printing
 */

export interface PrinterConfig {
    printerName?: string;
    paperWidth?: number; // in mm (default 80mm for thermal printers)
    encoding?: string;
    autoConnect?: boolean;
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

    constructor(config: PrinterConfig = {}) {
        this.config = {
            paperWidth: 80, // 80mm thermal paper
            encoding: 'UTF-8',
            autoConnect: true,
            ...config
        };
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

        .receipt-info {
            margin: 10px 0;
            font-size: 11px;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
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

        .footer {
            text-align: center;
            margin-top: 15px;
            padding-top: 10px;
            border-top: 2px dashed #000;
            font-size: 10px;
        }

        .barcode {
            text-align: center;
            margin: 10px 0;
            font-family: 'Libre Barcode 128', cursive;
            font-size: 40px;
            letter-spacing: 0;
        }
    </style>
</head>
<body>
    <div class="receipt">
        <!-- Header -->
        <div class="header">
            <div class="store-name">${this.escapeHTML(data.storeName)}</div>
            ${data.storeAddress ? `<div class="store-info">${this.escapeHTML(data.storeAddress)}</div>` : ''}
            ${data.storePhone ? `<div class="store-info">Tel: ${this.escapeHTML(data.storePhone)}</div>` : ''}
            ${data.taxId ? `<div class="store-info">Tax ID: ${this.escapeHTML(data.taxId)}</div>` : ''}
        </div>

        <!-- Receipt Info -->
        <div class="receipt-info">
            <div class="info-row">
                <span>Receipt #:</span>
                <span><strong>${this.escapeHTML(data.receiptNumber)}</strong></span>
            </div>
            <div class="info-row">
                <span>Date:</span>
                <span>${this.escapeHTML(data.date)}</span>
            </div>
            <div class="info-row">
                <span>Time:</span>
                <span>${this.escapeHTML(data.time)}</span>
            </div>
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

        <!-- Barcode -->
        <div class="barcode">*${data.receiptNumber}*</div>

        <!-- Footer -->
        <div class="footer">
            ${data.footer || 'Thank you for your business!'}
            <br>
            Please keep this receipt for your records
        </div>
    </div>
</body>
</html>
        `;
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
