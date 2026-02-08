import React, { useState } from 'react';
import { createBarcodeScanner } from '../../services/barcode/barcodeScanner';
import { createThermalPrinter, ReceiptData } from '../../services/printer/thermalPrinter';
import Card from '../ui/Card';

/**
 * Test component for barcode scanner and thermal printer
 * This component helps test the hardware integration
 */
const POSHardwareTest: React.FC = () => {
    const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);
    const [scannerActive, setScannerActive] = useState(false);
    const [testStatus, setTestStatus] = useState<string>('');

    // Test barcode scanner
    const testBarcodeScanner = () => {
        const scanner = createBarcodeScanner((barcode) => {
            setScannedBarcodes(prev => [...prev, barcode]);
            setTestStatus(`Scanned: ${barcode}`);
        });

        scanner.start();
        setScannerActive(true);
        setTestStatus('Scanner active - Please scan a barcode');

        // Auto-stop after 30 seconds
        setTimeout(() => {
            scanner.stop();
            setScannerActive(false);
            setTestStatus('Scanner test completed');
        }, 30000);
    };

    // Test thermal printer
    const testThermalPrinter = async () => {
        try {
            setTestStatus('Preparing test receipt...');

            const printer = createThermalPrinter();

            const testReceipt: ReceiptData = {
                storeName: 'PBooks Pro - TEST RECEIPT',
                storeAddress: 'Test Address, Karachi, Pakistan',
                storePhone: '+92-XXX-XXXXXXX',
                taxId: 'TEST-TAX-ID',
                receiptNumber: `TEST-${Date.now()}`,
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                cashier: 'Test Cashier',
                customer: 'Test Customer',
                items: [
                    {
                        name: 'Test Item 1',
                        quantity: 2,
                        unitPrice: 100,
                        total: 200
                    },
                    {
                        name: 'Test Item 2',
                        quantity: 1,
                        unitPrice: 500,
                        discount: 50,
                        total: 450
                    }
                ],
                subtotal: 650,
                discount: 50,
                tax: 104,
                total: 704,
                payments: [
                    {
                        method: 'Cash',
                        amount: 1000
                    }
                ],
                change: 296,
                footer: 'This is a test receipt - Thank you!'
            };

            await printer.printReceipt(testReceipt);
            setTestStatus('Test receipt sent to printer successfully!');
        } catch (error: any) {
            setTestStatus(`Printer error: ${error.message}`);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-8">POS Hardware Test</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Barcode Scanner Test */}
                <Card>
                    <div className="p-6">
                        <h2 className="text-xl font-bold mb-4">Barcode Scanner Test</h2>

                        <button
                            onClick={testBarcodeScanner}
                            disabled={scannerActive}
                            className={`w-full py-3 px-6 rounded-lg font-bold text-white transition-all ${scannerActive
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                        >
                            {scannerActive ? 'Scanner Active...' : 'Start Scanner Test'}
                        </button>

                        <div className="mt-4">
                            <h3 className="font-semibold mb-2">Scanned Barcodes:</h3>
                            <div className="bg-gray-100 rounded p-3 max-h-40 overflow-y-auto">
                                {scannedBarcodes.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No barcodes scanned yet</p>
                                ) : (
                                    <ul className="space-y-1">
                                        {scannedBarcodes.map((barcode, index) => (
                                            <li key={index} className="text-sm font-mono bg-white p-2 rounded">
                                                {index + 1}. {barcode}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 p-3 bg-blue-50 rounded">
                            <p className="text-sm text-blue-800">
                                <strong>Instructions:</strong>
                                <br />
                                1. Click "Start Scanner Test"
                                <br />
                                2. Scan any barcode with your scanner
                                <br />
                                3. Scanned codes will appear above
                                <br />
                                4. Test runs for 30 seconds
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Thermal Printer Test */}
                <Card>
                    <div className="p-6">
                        <h2 className="text-xl font-bold mb-4">Thermal Printer Test</h2>

                        <button
                            onClick={testThermalPrinter}
                            className="w-full py-3 px-6 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-all"
                        >
                            Print Test Receipt
                        </button>

                        <div className="mt-4 p-3 bg-green-50 rounded">
                            <p className="text-sm text-green-800">
                                <strong>Instructions:</strong>
                                <br />
                                1. Ensure printer is connected and on
                                <br />
                                2. Click "Print Test Receipt"
                                <br />
                                3. Select your thermal printer
                                <br />
                                4. Verify the receipt prints correctly
                            </p>
                        </div>

                        <div className="mt-4">
                            <h3 className="font-semibold mb-2">Expected Receipt:</h3>
                            <div className="bg-gray-100 rounded p-3 text-xs font-mono">
                                <div className="text-center border-b pb-2 mb-2">
                                    <div className="font-bold">PBooks Pro - TEST RECEIPT</div>
                                    <div>Test Address, Karachi</div>
                                </div>
                                <div className="space-y-1">
                                    <div>Receipt #: TEST-XXXXX</div>
                                    <div>Cashier: Test Cashier</div>
                                    <div className="border-t border-b py-2 my-2">
                                        <div>Test Item 1</div>
                                        <div className="flex justify-between">
                                            <span>2 x 100.00</span>
                                            <span>200.00</span>
                                        </div>
                                        <div>Test Item 2</div>
                                        <div className="flex justify-between">
                                            <span>1 x 500.00</span>
                                            <span>450.00</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>TOTAL:</span>
                                        <span>704.00</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Cash:</span>
                                        <span>1000.00</span>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>CHANGE:</span>
                                        <span>296.00</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Status Display */}
            {testStatus && (
                <div className="mt-6">
                    <Card>
                        <div className="p-4 bg-yellow-50">
                            <h3 className="font-semibold mb-2">Status:</h3>
                            <p className="text-sm">{testStatus}</p>
                        </div>
                    </Card>
                </div>
            )}

            {/* Troubleshooting Guide */}
            <div className="mt-8">
                <Card>
                    <div className="p-6">
                        <h2 className="text-xl font-bold mb-4">Troubleshooting</h2>

                        <div className="space-y-4">
                            <div>
                                <h3 className="font-semibold text-red-600">Barcode Scanner Not Working?</h3>
                                <ul className="list-disc list-inside text-sm mt-2 space-y-1">
                                    <li>Check USB connection</li>
                                    <li>Ensure scanner is in HID keyboard mode</li>
                                    <li>Test scanner in a text editor (Notepad)</li>
                                    <li>Check browser console for errors</li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="font-semibold text-red-600">Thermal Printer Not Working?</h3>
                                <ul className="list-disc list-inside text-sm mt-2 space-y-1">
                                    <li>Check printer is on and connected</li>
                                    <li>Verify printer is installed in Windows</li>
                                    <li>Check paper is loaded correctly</li>
                                    <li>Try printing a test page from Windows</li>
                                    <li>Ensure browser has print permissions</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default POSHardwareTest;
