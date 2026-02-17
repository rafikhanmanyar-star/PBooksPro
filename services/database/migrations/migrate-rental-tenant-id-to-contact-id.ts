/**
 * Migration: Rename tenant_id to contact_id in rental_agreements table (SQLite)
 * 
 * This migration renames the tenant_id column to contact_id in the rental_agreements table
 * to eliminate confusion with organization tenant_id used for multi-tenancy.
 */

import { getDatabaseService } from '../databaseService';

/**
 * Run the migration using databaseService API
 */
export async function runRentalTenantIdToContactIdMigration(): Promise<{ success: boolean; message: string }> {
  const dbService = getDatabaseService();
  
  try {
    if (!dbService.isReady()) {
      await dbService.initialize();
    }
    
    const db = dbService.getDatabase();
    if (typeof (db as any).serialize !== 'function') {
      return migrateWithServiceApi(dbService);
    }
    return await migrateRentalTenantIdToContactId(db);
  } catch (error) {
    return {
      success: false,
      message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function migrateWithServiceApi(dbService: any): { success: boolean; message: string } {
  const tableExists = dbService.query("SELECT name FROM sqlite_master WHERE type='table' AND name='rental_agreements'");
  if (tableExists.length === 0) {
    return { success: true, message: 'Table rental_agreements does not exist, nothing to migrate' };
  }
  const columns = dbService.query('PRAGMA table_info(rental_agreements)');
  const hasContactId = columns.some((c: any) => c.name === 'contact_id');
  const hasTenantId = columns.some((c: any) => c.name === 'tenant_id');
  if (hasContactId && !hasTenantId) {
    return { success: true, message: 'Migration already completed' };
  }
  if (hasContactId && hasTenantId) {
    return { success: true, message: 'Both columns exist (current schema)' };
  }
  try {
    dbService.transaction([
      () => {
        if (!hasContactId) dbService.execute('ALTER TABLE rental_agreements ADD COLUMN contact_id TEXT');
        if (hasTenantId) dbService.execute('UPDATE rental_agreements SET contact_id = tenant_id WHERE tenant_id IS NOT NULL');
      }
    ]);
    return { success: true, message: 'Successfully migrated tenant_id to contact_id in rental_agreements table' };
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

/**
 * Internal migration function that works with raw sql.js database
 */
export async function migrateRentalTenantIdToContactId(db: any): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err: Error | null) => {
        if (err) {
          resolve({ success: false, message: `Failed to start transaction: ${err.message}` });
          return;
        }

        // Check if contact_id column already exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='rental_agreements'",
          (err: Error | null, row: any) => {
            if (err) {
              db.run('ROLLBACK');
              resolve({ success: false, message: `Failed to check table: ${err.message}` });
              return;
            }

            if (!row) {
              // Table doesn't exist, nothing to migrate
              db.run('COMMIT');
              resolve({ success: true, message: 'Table rental_agreements does not exist, nothing to migrate' });
              return;
            }

            // Check if contact_id already exists
            db.all(
              "PRAGMA table_info(rental_agreements)",
              (err: Error | null, columns: any[]) => {
                if (err) {
                  db.run('ROLLBACK');
                  resolve({ success: false, message: `Failed to check columns: ${err.message}` });
                  return;
                }

                const hasContactId = columns.some((col: any) => col.name === 'contact_id');
                const hasTenantId = columns.some((col: any) => col.name === 'tenant_id');
                const hasOrgId = columns.some((col: any) => col.name === 'org_id');

                if (hasContactId && !hasTenantId) {
                  // Already migrated - table has contact_id but not tenant_id
                  db.run('COMMIT');
                  resolve({ success: true, message: 'Migration already completed - contact_id column exists, tenant_id not found' });
                  return;
                }

                if (hasContactId && hasTenantId) {
                  // Both columns exist - table is already in the correct final state
                  // (contact_id for renter/contact, tenant_id for org multi-tenancy)
                  // No migration needed.
                  db.run('COMMIT');
                  resolve({ success: true, message: 'Migration not needed - both contact_id and tenant_id exist (current schema)' });
                  return;
                }

                if (!hasContactId && !hasTenantId) {
                  // Neither column exists - table might be empty or using different schema
                  // Try to add contact_id column if table has rows
                  db.run(
                    'ALTER TABLE rental_agreements ADD COLUMN contact_id TEXT',
                    (err: Error | null) => {
                      if (err) {
                        db.run('ROLLBACK');
                        resolve({ success: false, message: `Failed to add contact_id column: ${err.message}` });
                        return;
                      }
                      db.run('COMMIT');
                      resolve({ success: true, message: 'Added contact_id column - no tenant_id found to migrate' });
                    }
                  );
                  return;
                }

                if (!hasTenantId) {
                  // No tenant_id column, nothing to migrate (but contact_id might already exist)
                  db.run('COMMIT');
                  resolve({ success: true, message: 'No tenant_id column found, nothing to migrate' });
                  return;
                }

                // Migration needed: table has tenant_id, need to convert to contact_id
                // Double-check that tenant_id actually exists before proceeding
                if (!hasTenantId) {
                  // Should not reach here, but double-check for safety
                  db.run('COMMIT');
                  resolve({ success: true, message: 'No tenant_id column found (double-check), nothing to migrate' });
                  return;
                }

                // Step 1: Add contact_id column if it doesn't exist
                const addColumnQuery = hasContactId 
                  ? 'SELECT 1' // Skip if already exists - use a no-op query
                  : 'ALTER TABLE rental_agreements ADD COLUMN contact_id TEXT';
                
                db.run(addColumnQuery, (err: Error | null) => {
                  if (err && !hasContactId) {
                    db.run('ROLLBACK');
                    resolve({ success: false, message: `Failed to add contact_id column: ${err.message}` });
                    return;
                  }

                  // Step 2: Copy data from tenant_id to contact_id (only if contact_id is NULL or doesn't exist)
                  // Only execute if tenant_id exists (should always be true at this point, but double-check)
                  if (!hasTenantId) {
                    db.run('COMMIT');
                    resolve({ success: true, message: 'Skipping data copy - tenant_id column not found' });
                    return;
                  }

                  const copyQuery = hasContactId
                    ? 'UPDATE rental_agreements SET contact_id = tenant_id WHERE contact_id IS NULL AND tenant_id IS NOT NULL'
                    : 'UPDATE rental_agreements SET contact_id = tenant_id WHERE tenant_id IS NOT NULL';
                  
                  db.run(copyQuery, (err: Error | null) => {
                    if (err) {
                      // If error is "no such column: tenant_id", the column check was wrong - skip migration
                      if (err.message && err.message.includes('no such column: tenant_id')) {
                        db.run('COMMIT');
                        resolve({ success: true, message: 'Skipped migration - tenant_id column does not exist (detected during copy)' });
                        return;
                      }
                      db.run('ROLLBACK');
                      resolve({ success: false, message: `Failed to copy data from tenant_id to contact_id: ${err.message}` });
                      return;
                    }

                        // Step 3: Drop old foreign key constraint (SQLite doesn't support DROP CONSTRAINT directly)
                        // We need to recreate the table
                        db.run(
                          `CREATE TABLE rental_agreements_new (
                            id TEXT PRIMARY KEY,
                            agreement_number TEXT NOT NULL UNIQUE,
                            contact_id TEXT NOT NULL,
                            property_id TEXT NOT NULL,
                            start_date TEXT NOT NULL,
                            end_date TEXT NOT NULL,
                            monthly_rent REAL NOT NULL,
                            rent_due_date INTEGER NOT NULL,
                            status TEXT NOT NULL,
                            description TEXT,
                            security_deposit REAL,
                            broker_id TEXT,
                            broker_fee REAL,
                            org_id TEXT,
                            user_id TEXT,
                            created_at TEXT NOT NULL DEFAULT (datetime('now')),
                            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
                            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT,
                            FOREIGN KEY (broker_id) REFERENCES contacts(id) ON DELETE SET NULL
                          )`,
                          (err: Error | null) => {
                            if (err) {
                              db.run('ROLLBACK');
                              resolve({ success: false, message: `Failed to create new table: ${err.message}` });
                              return;
                            }

                            // Step 4: Copy data to new table
                            db.run(
                              `INSERT INTO rental_agreements_new 
                               SELECT id, agreement_number, contact_id, property_id, start_date, end_date,
                                      monthly_rent, rent_due_date, status, description, security_deposit,
                                      broker_id, broker_fee, org_id, user_id, created_at, updated_at
                               FROM rental_agreements`,
                              (err: Error | null) => {
                                if (err) {
                                  db.run('ROLLBACK');
                                  resolve({ success: false, message: `Failed to copy data to new table: ${err.message}` });
                                  return;
                                }

                                // Step 5: Drop old table
                                db.run('DROP TABLE rental_agreements', (err: Error | null) => {
                                  if (err) {
                                    db.run('ROLLBACK');
                                    resolve({ success: false, message: `Failed to drop old table: ${err.message}` });
                                    return;
                                  }

                                  // Step 6: Rename new table
                                  db.run(
                                    'ALTER TABLE rental_agreements_new RENAME TO rental_agreements',
                                    (err: Error | null) => {
                                      if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                        return;
                                      }

                                      // Step 7: Recreate indexes
                                      db.run(
                                        'CREATE INDEX IF NOT EXISTS idx_rental_agreements_org_id ON rental_agreements(org_id)',
                                        (err: Error | null) => {
                                          if (err) {
                                            db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                          }

                                          db.run('COMMIT', (err: Error | null) => {
                                            if (err) {
                                              resolve({ success: false, message: `Failed to commit transaction: ${err.message}` });
                                            } else {
                                              resolve({ success: true, message: 'Successfully migrated tenant_id to contact_id in rental_agreements table' });
                                            }
                                          });
                                        }
                                      );
                                    }
                                  );
                                });
                              }
                            );
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    });
  });
}
