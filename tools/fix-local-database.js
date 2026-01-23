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
        
        // Step 2: Clear local database
        console.log('🗑️ Removing old database...');
        localStorage.removeItem('finance_db');
        
        // Also clear OPFS if supported
        if (navigator.storage && navigator.storage.getDirectory) {
            try {
                const root = await navigator.storage.getDirectory();
                const handle = await root.getFileHandle('finance_db.sqlite', { create: false });
                await handle.remove();
                console.log('✅ OPFS database removed');
            } catch (e) {
                // File might not exist, that's okay
            }
        }
        
        console.log('✅ Old database cleared');
        
        // Step 3: Reload page to recreate database
        console.log('🔄 Reloading page to recreate database with all tables...');
        console.log('📥 After reload, all data will be re-fetched from cloud');
        
        setTimeout(() => {
            location.reload();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error during database fix:', error);
        console.log('💡 Manual fix: Run these commands one by one:');
        console.log('   localStorage.removeItem("finance_db");');
        console.log('   location.reload();');
    }
})();
