
import { BaseAdapter } from './baseAdapter';
import { ExcelAdapter } from './excelAdapter';
import { CSVAdapter } from './csvAdapter';

/**
 * Adapter registry - manages all available adapters
 */
export class AdapterRegistry {
    private adapters: BaseAdapter[] = [];
    private initialized = false;

    /**
     * Lazily initialize default adapters
     * This avoids TDZ errors caused by circular dependencies during module load
     */
    private ensureInitialized(): void {
        if (!this.initialized) {
            this.initialized = true;
            // Register default adapters
            this.register(new ExcelAdapter());
            this.register(new CSVAdapter());
        }
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
        this.ensureInitialized();
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
        this.ensureInitialized();
        return [...this.adapters];
    }

    /**
     * Get adapter by name
     */
    getAdapterByName(name: string): BaseAdapter | null {
        this.ensureInitialized();
        return this.adapters.find(a => a.getName() === name) || null;
    }
}

// Lazy singleton instance - avoids TDZ errors during module initialization
let adapterRegistryInstance: AdapterRegistry | null = null;

export const adapterRegistry = {
    get instance(): AdapterRegistry {
        if (!adapterRegistryInstance) {
            adapterRegistryInstance = new AdapterRegistry();
        }
        return adapterRegistryInstance;
    },
    findAdapter(file: File): BaseAdapter | null {
        return this.instance.findAdapter(file);
    },
    getAllAdapters(): BaseAdapter[] {
        return this.instance.getAllAdapters();
    },
    getAdapterByName(name: string): BaseAdapter | null {
        return this.instance.getAdapterByName(name);
    },
    register(adapter: BaseAdapter): void {
        this.instance.register(adapter);
    }
};

// Export adapter classes for direct use
export { BaseAdapter } from './baseAdapter';
export type { AdapterResult, AdapterConfig } from './baseAdapter';
export { ExcelAdapter } from './excelAdapter';
export { CSVAdapter } from './csvAdapter';

