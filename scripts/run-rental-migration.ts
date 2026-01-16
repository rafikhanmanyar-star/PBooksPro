/**
 * Script to run the rental_agreements tenant_id to contact_id migration
 * 
 * Usage:
 *   npx ts-node scripts/run-rental-migration.ts
 * 
 * Or in browser console:
 *   import { runRentalTenantIdToContactIdMigration } from './services/database/migrations/migrate-rental-tenant-id-to-contact-id';
 *   const result = await runRentalTenantIdToContactIdMigration();
 *   console.log(result);
 */

import { runRentalTenantIdToContactIdMigration } from '../services/database/migrations/migrate-rental-tenant-id-to-contact-id';
import { getDatabaseService } from '../services/database/databaseService';

async function main() {
  console.log('🔄 Starting rental_agreements migration (tenant_id → contact_id)...\n');
  
  try {
    // Ensure database is initialized
    const dbService = getDatabaseService();
    if (!dbService.isReady()) {
      console.log('📦 Initializing database...');
      await dbService.initialize();
      console.log('✅ Database initialized\n');
    }
    
    // Run the migration
    console.log('🔄 Running migration...');
    const result = await runRentalTenantIdToContactIdMigration();
    
    if (result.success) {
      console.log(`✅ ${result.message}`);
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.error(`❌ ${result.message}`);
      console.error('\n❌ Migration failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
