/**
 * Run database migrations on server startup
 * This ensures the database schema is always up to date
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔄 Running database migrations...');
    
    // Read and execute PostgreSQL schema
    // Try multiple paths to find the SQL file (works in both dev and production)
    const possiblePaths = [
      join(__dirname, '../migrations/postgresql-schema.sql'),      // dist/scripts -> dist/migrations
      join(__dirname, '../../migrations/postgresql-schema.sql'),  // dist/scripts -> migrations (source)
      join(process.cwd(), 'server/migrations/postgresql-schema.sql'), // From project root
      join(process.cwd(), 'migrations/postgresql-schema.sql'),    // From project root (if in server/)
    ];
    
    let schemaPath: string | null = null;
    for (const path of possiblePaths) {
      try {
        readFileSync(path, 'utf8'); // Test if file exists
        schemaPath = path;
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (!schemaPath) {
      throw new Error(`Could not find postgresql-schema.sql. Tried: ${possiblePaths.join(', ')}`);
    }
    
    console.log('📋 Reading schema from:', schemaPath);
    const schemaSQL = readFileSync(schemaPath, 'utf8');
    
    // Execute schema - DROP IF EXISTS and CREATE IF NOT EXISTS ensure idempotency
    try {
      await pool.query(schemaSQL);
    } catch (error: any) {
      // If it's a policy error, it's likely already exists - that's okay
      if (error.code === '42710' && error.message.includes('policy')) {
        console.log('   ⚠️  Some policies already exist (this is normal)');
      } else {
        throw error;
      }
    }
    
    console.log('✅ Database migrations completed successfully');
    
    // Create default admin user if it doesn't exist
    console.log('👤 Ensuring admin user exists...');
    const bcrypt = await import('bcryptjs');
    const defaultPassword = await bcrypt.default.hash('admin123', 10);
    
    await pool.query(
      `INSERT INTO admin_users (id, username, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO NOTHING`,
      [
        'admin_1',
        'Admin',
        'Super Admin',
        'admin@pbookspro.com',
        defaultPassword,
        'super_admin'
      ]
    );
    
    console.log('✅ Admin user ready (username: Admin, password: admin123)');
    console.log('   ⚠️  Please change the password after first login!');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    // Don't exit - let the server start anyway (schema might already exist)
    console.warn('⚠️  Continuing startup despite migration error...');
  } finally {
    await pool.end();
  }
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { runMigrations };

