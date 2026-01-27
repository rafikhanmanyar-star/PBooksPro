/**
 * SQL.js Loader
 * 
 * Handles loading sql.js in a way that works with Vite's module system
 */

let sqlJsModule: any = null;
let loadPromise: Promise<any> | null = null;

export async function loadSqlJs(): Promise<any> {
    if (sqlJsModule) {
        return sqlJsModule;
    }

    if (loadPromise) {
        return loadPromise;
    }

    loadPromise = (async () => {
        let module: any = null;
        let initSqlJs: any = null;
        
        // Check if we're in Electron
        const isElectron = typeof window !== 'undefined' && 
            (window.location.protocol === 'file:' || !!(window as any).electronAPI);
        
        // Strategy 1: Try importing from package root
        try {
            console.log('📦 Attempting to import sql.js from package...');
            module = await import('sql.js');
            console.log('✅ Imported from package, type:', typeof module);
            console.log('Module keys:', Object.keys(module || {}));
            
            // Check if module is empty (Vite CommonJS issue)
            const keys = Object.keys(module || {});
            const hasDefault = !!(module as any).default;
            const hasInitSqlJs = !!(module as any).initSqlJs;
            const isFunction = typeof module === 'function';
            
            console.log('Module check:', { keys: keys.length, hasDefault, hasInitSqlJs, isFunction });
            
            // If module is empty or has no usable exports
            if (keys.length === 0 || (!hasDefault && !hasInitSqlJs && !isFunction)) {
                if (isElectron) {
                    // In Electron, CDN won't work - throw error immediately
                    throw new Error('sql.js module is empty and CDN is not available in Electron. Ensure sql.js is properly bundled.');
                } else {
                    // In browser, try CDN fallback
                console.warn('⚠️ Module appears empty or unusable, falling back to CDN...');
                throw new Error('Module is empty - Vite CommonJS issue');
                }
            }
        } catch (e1) {
            if (isElectron) {
                // In Electron, don't try CDN - it won't work
                throw new Error(`Failed to import sql.js in Electron: ${e1 instanceof Error ? e1.message : String(e1)}. Ensure sql.js and sql-wasm.wasm are bundled correctly.`);
            }
            
            console.log('⚠️ Failed to import from package, trying CDN...', e1);
            // Strategy 2: Try CDN as fallback (only in browser)
            try {
                // Load from CDN using script tag
                return await loadFromCDN();
            } catch (e2) {
                throw new Error(`Failed to import sql.js from all sources. Package error: ${e1 instanceof Error ? e1.message : String(e1)}, CDN error: ${e2 instanceof Error ? e2.message : String(e2)}`);
            }
        }
        
        if (!module) {
            throw new Error('sql.js module is null or undefined');
        }
        
        // Debug: Log the module structure
        console.log('Module structure:', {
            type: typeof module,
            isFunction: typeof module === 'function',
            hasDefault: !!(module as any).default,
            keys: Object.keys(module),
            defaultType: typeof (module as any)?.default
        });
        
        // Try to find initSqlJs function
        // Check if module itself is the function
        if (typeof module === 'function') {
            initSqlJs = module;
            console.log('✅ Found initSqlJs as module function');
        }
        // Check default export
        else if ((module as any).default) {
            const defaultExport = (module as any).default;
            if (typeof defaultExport === 'function') {
                initSqlJs = defaultExport;
                console.log('✅ Found initSqlJs as default export function');
            } else if (defaultExport && typeof defaultExport.initSqlJs === 'function') {
                initSqlJs = defaultExport.initSqlJs;
                console.log('✅ Found initSqlJs in default export object');
            } else if (defaultExport && typeof defaultExport.default === 'function') {
                initSqlJs = defaultExport.default;
                console.log('✅ Found initSqlJs as default.default');
            } else if (defaultExport && typeof (defaultExport as any).initSqlJs === 'function') {
                initSqlJs = (defaultExport as any).initSqlJs;
                console.log('✅ Found initSqlJs in default.initSqlJs');
            }
        }
        // Check for named export
        else if ((module as any).initSqlJs && typeof (module as any).initSqlJs === 'function') {
            initSqlJs = (module as any).initSqlJs;
            console.log('✅ Found initSqlJs as named export');
        }
        // Check all keys for any function
        else if (module && typeof module === 'object') {
            const keys = Object.keys(module);
            console.log('Checking all module keys for functions:', keys);
            for (const key of keys) {
                const value = (module as any)[key];
                if (typeof value === 'function') {
                    console.log(`Found function in key "${key}"`);
                    if (key === 'initSqlJs') {
                        initSqlJs = value;
                        break; // Exact match, use it
                    } else if (!initSqlJs) {
                        initSqlJs = value; // Use first function found
                    }
                } else if (value && typeof value === 'object' && typeof (value as any).initSqlJs === 'function') {
                    initSqlJs = (value as any).initSqlJs;
                    console.log(`✅ Found initSqlJs in nested object "${key}"`);
                    break;
                }
            }
        }
        
        // If we still haven't found it
        if (!initSqlJs || typeof initSqlJs !== 'function') {
            if (isElectron) {
                // In Electron, don't try CDN - it won't work
                const errorDetails = {
                    moduleType: typeof module,
                    moduleKeys: module && typeof module === 'object' ? Object.keys(module) : [],
                    hasDefault: !!(module as any)?.default,
                    defaultType: typeof (module as any)?.default,
                    defaultKeys: (module as any)?.default && typeof (module as any).default === 'object' ? Object.keys((module as any).default) : []
                };
                console.error('❌ Could not find initSqlJs function in Electron. Details:', errorDetails);
                throw new Error(`Could not find initSqlJs function in Electron. Module type: ${typeof module}, Keys: ${errorDetails.moduleKeys.join(', ') || 'none'}, Default keys: ${errorDetails.defaultKeys.join(', ') || 'none'}. Ensure sql.js is properly bundled.`);
            }
            
            console.warn('⚠️ Could not find initSqlJs in module, falling back to CDN...');
            try {
                return await loadFromCDN();
            } catch (cdnError) {
                const errorDetails = {
                    moduleType: typeof module,
                    moduleKeys: module && typeof module === 'object' ? Object.keys(module) : [],
                    hasDefault: !!(module as any)?.default,
                    defaultType: typeof (module as any)?.default,
                    defaultKeys: (module as any)?.default && typeof (module as any).default === 'object' ? Object.keys((module as any).default) : []
                };
                console.error('❌ Could not find initSqlJs function. Details:', errorDetails);
                throw new Error(`Could not find initSqlJs function. Module type: ${typeof module}, Keys: ${errorDetails.moduleKeys.join(', ') || 'none'}, Default keys: ${errorDetails.defaultKeys.join(', ') || 'none'}. CDN fallback also failed: ${cdnError instanceof Error ? cdnError.message : String(cdnError)}`);
            }
        }
        
        sqlJsModule = initSqlJs;
        console.log('✅ initSqlJs function loaded successfully');
        return initSqlJs;
    })();

    return loadPromise;
}

/**
 * Load sql.js from CDN as a fallback
 */
async function loadFromCDN(): Promise<any> {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if ((window as any).initSqlJs) {
            console.log('✅ sql.js already loaded from CDN');
            resolve((window as any).initSqlJs);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://sql.js.org/dist/sql-wasm.js';
        script.async = true;
        
        script.onload = () => {
            if ((window as any).initSqlJs) {
                console.log('✅ sql.js loaded from CDN');
                resolve((window as any).initSqlJs);
            } else {
                reject(new Error('sql.js loaded from CDN but initSqlJs not found on window object'));
            }
        };
        
        script.onerror = (error) => {
            reject(new Error(`Failed to load sql.js from CDN: ${error}`));
        };
        
        document.head.appendChild(script);
    });
}
