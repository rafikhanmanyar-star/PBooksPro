/**
 * Migration: Add document_path and version columns to bills and contracts tables
 * 
 * This migration adds the document_path column to the bills and contracts tables,
 * and the version column to the bills table in the local SQLite database 
 * to match the cloud PostgreSQL schema.
 * 
 * Schema Version: 2 -> 3
 */

import { getDatabaseService } from '../databaseService';

export async function migrateAddDocumentPathToBills(): Promise<void> {
    const dbService = getDatabaseService();
    
    if (!dbService.isReady()) {
        throw new Error('Database not ready for migration');
    }

    console.log('[Migration] Starting: Add document_path and version to bills, document_path to contracts');

    try {
        // Add document_path to bills table
        const billsColumns = dbService.query<{ name: string }>(
            `PRAGMA table_info(bills)`
        );
        
        const billsHasDocumentPath = billsColumns.some(col => col.name === 'document_path');
        
        if (!billsHasDocumentPath) {
            dbService.execute(`
                ALTER TABLE bills ADD COLUMN document_path TEXT
            `);
            console.log('[Migration] ✅ Added document_path column to bills table');
        } else {
            console.log('[Migration] Column document_path already exists in bills table, skipping');
        }

        // Add version to bills table (for optimistic locking)
        const billsHasVersion = billsColumns.some(col => col.name === 'version');
        
        if (!billsHasVersion) {
            dbService.execute(`
                ALTER TABLE bills ADD COLUMN version INTEGER NOT NULL DEFAULT 1
            `);
            console.log('[Migration] ✅ Added version column to bills table');
        } else {
            console.log('[Migration] Column version already exists in bills table, skipping');
        }

        // Add document_path to contracts table
        const contractsColumns = dbService.query<{ name: string }>(
            `PRAGMA table_info(contracts)`
        );
        
        const contractsHasDocumentPath = contractsColumns.some(col => col.name === 'document_path');
        
        if (!contractsHasDocumentPath) {
            dbService.execute(`
                ALTER TABLE contracts ADD COLUMN document_path TEXT
            `);
            console.log('[Migration] ✅ Added document_path column to contracts table');
        } else {
            console.log('[Migration] Column document_path already exists in contracts table, skipping');
        }

        console.log('[Migration] ✅ Successfully completed schema migration');
        
        // Save changes
        dbService.save();
        
    } catch (error) {
        console.error('[Migration] ❌ Failed to add columns:', error);
        throw error;
    }
}
