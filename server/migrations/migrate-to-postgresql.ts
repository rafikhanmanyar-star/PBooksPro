import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDatabaseService } from '../services/databaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function migrateToPostgreSQL() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Validate DATABASE_URL format
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    throw new Error(`Invalid DATABASE_URL format. Expected postgresql:// or postgres://, got: ${dbUrl.substring(0, 20)}...`);
  }

  // Parse and validate connection string
  try {
    const url = new URL(dbUrl);
    if (!url.hostname || url.hostname === 'base' || url.hostname === 'localhost' && !url.port) {
      console.error('⚠️  Invalid DATABASE_URL format detected');
      console.error('   Current value:', dbUrl.replace(/:[^:@]+@/, ':****@')); // Hide password
      console.error('   Expected format: postgresql://username:password@host:port/database');
      throw new Error('Invalid DATABASE_URL: hostname is invalid or missing port');
    }
  } catch (urlError: any) {
    if (urlError.message.includes('Invalid URL')) {
      throw new Error(`Invalid DATABASE_URL format: ${urlError.message}`);
    }
    throw urlError;
  }

  console.log('🔗 Connecting to database...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔄 Starting PostgreSQL migration...');

    // 1. Read and execute PostgreSQL schema
    console.log('📋 Creating database schema...');
    const schemaSQL = readFileSync(join(__dirname, 'postgresql-schema.sql'), 'utf8');
    
    // Execute schema - DROP IF EXISTS and CREATE IF NOT EXISTS handle idempotency
    await pool.query(schemaSQL);
    console.log('✅ Database schema created/verified');

    // 2. Create default admin user (if not exists)
    console.log('👤 Creating default admin user...');
    const bcrypt = await import('bcryptjs');
    const defaultPassword = await bcrypt.default.hash('admin123', 10);
    
    await pool.query(
      `INSERT INTO admin_users (id, username, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO NOTHING`,
      [
        'admin_1',
        'admin',
        'Super Admin',
        'admin@pbookspro.com',
        defaultPassword,
        'super_admin'
      ]
    );
    console.log('✅ Default admin user created (username: admin, password: admin123)');

    // 3. If you have existing SQLite data, export and import it here
    // This would require reading from your SQLite database
    // For now, we'll just create the schema

    console.log('✅ Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update DATABASE_URL in .env file');
    console.log('   2. Run the server: npm run server');
    console.log('   3. Access admin panel at: http://localhost:3000/api/admin');
    console.log('   4. Login with: admin / admin123');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('migrate-to-postgresql.ts') ||
                     process.argv[1]?.endsWith('migrate-to-postgresql.js');

if (isMainModule || import.meta.url.endsWith('migrate-to-postgresql.ts')) {
  migrateToPostgreSQL()
    .then(() => {
      console.log('✅ Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

export { migrateToPostgreSQL };

