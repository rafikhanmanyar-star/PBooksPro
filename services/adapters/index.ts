
import { BaseAdapter } from './baseAdapter';
import { ExcelAdapter } from './excelAdapter';
import { CSVAdapter } from './csvAdapter';

/**
 * Adapter registry - manages all available adapters
 */
export class AdapterRegistry {
    private adapters: BaseAdapter[] = [];

    constructor() {
        // Register default adapters
        this.register(new ExcelAdapter());
        this.register(new CSVAdapter());
    }

    /**
     * Register a new adapter
     */
    register(adapter: BaseAdapter): void {
        this.adapters.push(adapter);
    }

    /**
     * Find the best adapter for a given file
     */
    findAdapter(file: File): BaseAdapter | null {
        // Try each adapter to see if it can handle the file
        for (const adapter of this.adapters) {
            if (adapter.canHandle(file)) {
                return adapter;
            }
        }
        return null;
    }

    /**
     * Get all registered adapters
     */
    getAllAdapters(): BaseAdapter[] {
        return [...this.adapters];
    }

    /**
     * Get adapter by name
     */
    getAdapterByName(name: string): BaseAdapter | null {
        return this.adapters.find(a => a.getName() === name) || null;
    }
}

// Export singleton instance
export const adapterRegistry = new AdapterRegistry();

// Export adapter classes for direct use
export { BaseAdapter } from './baseAdapter';
export type { AdapterResult, AdapterConfig } from './baseAdapter';
export { ExcelAdapter } from './excelAdapter';
export { CSVAdapter } from './csvAdapter';

