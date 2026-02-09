/**
 * Barcode Scanner Service
 * Handles barcode scanner input and integration
 * Supports USB barcode scanners that act as keyboard input devices
 */

export interface BarcodeScannerConfig {
    minLength?: number;
    maxLength?: number;
    timeout?: number; // Time in ms to wait for complete barcode
    prefix?: string; // Optional prefix that scanner adds
    suffix?: string; // Optional suffix (usually Enter key)
    onScan: (barcode: string) => void;
    onError?: (error: string) => void;
}

export class BarcodeScanner {
    private buffer: string = '';
    private timeout: NodeJS.Timeout | null = null;
    private config: BarcodeScannerConfig;
    private isListening: boolean = false;

    constructor(config: BarcodeScannerConfig) {
        this.config = {
            minLength: 3,
            maxLength: 50,
            timeout: 100, // 100ms timeout between characters
            ...config
        };
    }

    /**
     * Start listening for barcode scanner input
     */
    start(): void {
        if (this.isListening) return;

        this.isListening = true;
        document.addEventListener('keypress', this.handleKeyPress);
        console.log('Barcode scanner listener started');
    }

    /**
     * Stop listening for barcode scanner input
     */
    stop(): void {
        if (!this.isListening) return;

        this.isListening = false;
        document.removeEventListener('keypress', this.handleKeyPress);
        this.clearBuffer();
        console.log('Barcode scanner listener stopped');
    }

    /**
     * Handle keypress events from barcode scanner
     */
    private handleKeyPress = (event: KeyboardEvent): void => {
        // Ignore if user is typing in an input field (except our search field)
        const target = event.target as HTMLElement;
        const isSearchInput = target.id === 'pos-product-search';

        if (!isSearchInput && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            return;
        }

        // Clear existing timeout
        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        // Handle Enter key (common suffix for barcode scanners)
        if (event.key === 'Enter' || event.keyCode === 13) {
            this.processBarcode();
            return;
        }

        // Add character to buffer
        this.buffer += event.key;

        // Set timeout to process barcode if no more input
        this.timeout = setTimeout(() => {
            this.processBarcode();
        }, this.config.timeout);
    };

    /**
     * Process the buffered barcode
     */
    private processBarcode(): void {
        let barcode = this.buffer.trim();

        // Remove prefix if configured
        if (this.config.prefix && barcode.startsWith(this.config.prefix)) {
            barcode = barcode.substring(this.config.prefix.length);
        }

        // Remove suffix if configured
        if (this.config.suffix && barcode.endsWith(this.config.suffix)) {
            barcode = barcode.substring(0, barcode.length - this.config.suffix.length);
        }

        // Validate barcode length
        if (barcode.length >= (this.config.minLength || 0) &&
            barcode.length <= (this.config.maxLength || Infinity)) {
            this.config.onScan(barcode);
        } else if (barcode.length > 0) {
            this.config.onError?.(`Invalid barcode length: ${barcode.length}`);
        }

        this.clearBuffer();
    }

    /**
     * Clear the input buffer
     */
    private clearBuffer(): void {
        this.buffer = '';
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }

    /**
     * Check if scanner is currently listening
     */
    isActive(): boolean {
        return this.isListening;
    }
}

/**
 * Create a barcode scanner instance with default configuration
 */
export function createBarcodeScanner(onScan: (barcode: string) => void): BarcodeScanner {
    return new BarcodeScanner({
        minLength: 3,
        maxLength: 50,
        timeout: 100,
        onScan,
        onError: (error) => console.warn('Barcode scanner error:', error)
    });
}
