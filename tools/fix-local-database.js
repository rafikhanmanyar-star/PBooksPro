/**
 * Fix Local Database - Missing Tables
 * 
 * Run this script in the browser console if you encounter:
 * - "no such table: plan_amenities" error
 * - Plans disappearing after creation
 * - State save failures
 * 
 * What this does:
 * 1. Backs up current database to download
 * 2. Clears the local database
 * 3. Forces app to recreate database with all tables
 * 4. Re-fetches all data from cloud
 */

(async function fixLocalDatabase() {
    console.log('🔧 Starting database fix...');
    
    try {
        // Step 1: Backup current database (optional but recommended)
        const existingDb = localStorage.getItem('finance_db');
        if (existingDb) {
            console.log('📦 Creating backup...');
            const backup = {
                timestamp: new Date().toISOString(),
                database: existingDb
            };
            
            // Create downloadable backup
            const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `database-backup-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('✅ Backup downloaded');
        }
        
        // Step 2: Clear local database from localStorage
        console.log('🗑️ Removing old database from localStorage...');
        localStorage.removeItem('finance_db');
        console.log('✅ localStorage cleared');
        
        // Step 3: Clear OPFS if supported (THIS IS CRITICAL!)
        if (navigator.storage && navigator.storage.getDirectory) {
            try {
                console.log('🗑️ Removing old database from OPFS...');
                const root = await navigator.storage.getDirectory();
                
                // Try to remove the file
                try {
                    await root.removeEntry('finance_db.sqlite');
                    console.log('✅ OPFS database file removed');
                } catch (removeError) {
                    // Try alternative method - get handle and remove
                    try {
                        const handle = await root.getFileHandle('finance_db.sqlite', { create: false });
                        await root.removeEntry('finance_db.sqlite');
                        console.log('✅ OPFS database removed (alternative method)');
                    } catch (e) {
                        console.log('ℹ️ OPFS file not found (might not exist, that\'s okay)');
                    }
                }
            } catch (opfsError) {
                console.warn('⚠️ Could not access OPFS:', opfsError);
                console.log('ℹ️ Continuing anyway - database should recreate on reload');
            }
        } else {
            console.log('ℹ️ OPFS not supported in this browser');
        }
        
        console.log('✅ All old database storage cleared');
        
        // Step 4: Reload page to recreate database
        console.log('🔄 Reloading page to recreate database with all tables...');
        console.log('📥 After reload, all data will be re-fetched from cloud');
        
        setTimeout(() => {
            location.reload();
        }, 1000);
        
    } catch (error) {
        console.error('❌ Error during database fix:', error);
        console.log('💡 Manual fix: Copy and paste this entire code block:');
        console.log(`
(async function() {
    localStorage.removeItem('finance_db');
    if (navigator.storage && navigator.storage.getDirectory) {
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry('finance_db.sqlite').catch(() => {});
        } catch (e) {}
    }
    setTimeout(() => location.reload(), 1000);
})();
        `);
    }
})();
