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
    // Ensure database is initialized
    if (!dbService.isReady()) {
      await dbService.initialize();
    }
    
    const db = dbService.getDatabase();
    return await migrateRentalTenantIdToContactId(db);
  } catch (error) {
    return {
      success: false,
      message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    };
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

                if (hasContactId) {
                  // Already migrated
                  db.run('COMMIT');
                  resolve({ success: true, message: 'Migration already completed - contact_id column exists' });
                  return;
                }

                if (!hasTenantId) {
                  // No tenant_id column, nothing to migrate
                  db.run('COMMIT');
                  resolve({ success: true, message: 'No tenant_id column found, nothing to migrate' });
                  return;
                }

                // Step 1: Add contact_id column
                db.run(
                  'ALTER TABLE rental_agreements ADD COLUMN contact_id TEXT',
                  (err: Error | null) => {
                    if (err) {
                      db.run('ROLLBACK');
                      resolve({ success: false, message: `Failed to add contact_id column: ${err.message}` });
                      return;
                    }

                    // Step 2: Copy data from tenant_id to contact_id
                    db.run(
                      'UPDATE rental_agreements SET contact_id = tenant_id WHERE contact_id IS NULL',
                      (err: Error | null) => {
                        if (err) {
                          db.run('ROLLBACK');
                          reject(err);
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
                              reject(err);
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
                                  reject(err);
                                  return;
                                }

                                // Step 5: Drop old table
                                db.run('DROP TABLE rental_agreements', (err: Error | null) => {
                                  if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
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
