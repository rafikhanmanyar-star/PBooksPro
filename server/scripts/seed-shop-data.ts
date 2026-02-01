import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from server directory
dotenv.config({ path: join(__dirname, '../.env') });

async function seedShopData() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL environment variable is not set');
        process.exit(1);
    }

    const dbUrl = process.env.DATABASE_URL;
    const shouldUseSSL = process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        (dbUrl && dbUrl.includes('.render.com'));

    console.log('🔗 Connecting to database...');
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('🌱 Seeding Shop Data...');

        // 1. Seed Tenant (if not exists, though usually it should. Using a default ID for simplicity or querying first)
        // Assuming 'default-tenant' or similar. For now, let's use a known Tenant ID or query one.
        // For this environment, we might need to fetch the first available tenant or create one.
        const tenantRes = await pool.query('SELECT id FROM tenants LIMIT 1');
        let tenantId;

        if (tenantRes.rows.length === 0) {
            console.log('Creating default tenant...');
            const newTenant = await pool.query("INSERT INTO tenants (name, type) VALUES ('Default Tenant', 'Company') RETURNING id");
            tenantId = newTenant.rows[0].id;
        } else {
            tenantId = tenantRes.rows[0].id;
        }

        // 2. Seed Branch (st-1)
        console.log('Creating Branch (st-1)...');
        await pool.query(`
      INSERT INTO shop_branches (id, tenant_id, name, code, type, status, location, timezone)
      VALUES ($1, $2, 'Karachi Flagship', 'KHI-01', 'Flagship', 'Active', 'DHA Phase 6', 'GMT+5')
      ON CONFLICT (id) DO NOTHING
    `, ['st-1', tenantId]);

        // 3. Seed Terminal (t-1)
        console.log('Creating Terminal (t-1)...');
        await pool.query(`
      INSERT INTO shop_terminals (id, tenant_id, branch_id, name, code, status)
      VALUES ($1, $2, $3, 'Main Counter 01', 'KHI-T1', 'Online')
      ON CONFLICT (id) DO NOTHING
    `, ['t-1', tenantId, 'st-1']);

        // 4. Seed Warehouse (wh-1) linked to branch logically (though schema is loose)
        console.log('Creating Warehouse (wh-1)...');
        await pool.query(`
      INSERT INTO shop_warehouses (id, tenant_id, name, code, location)
      VALUES ($1, $2, 'Karachi Main Warehouse', 'WH-KHI', 'Backroom')
      ON CONFLICT (id) DO NOTHING
    `, ['wh-1', tenantId]);

        // 5. Seed User (default-user) - Ensure user exists for foreign key
        // Checking if 'default-user' exists, if not, create or fallback to an existing user
        // The POSContext uses 'default-user'.
        const userRes = await pool.query("SELECT id FROM users WHERE id = 'default-user'");
        if (userRes.rows.length === 0) {
            // Try to find ANY user to alias, or create a dummy one
            const anyUser = await pool.query('SELECT id FROM users LIMIT 1');

            if (anyUser.rows.length > 0) {
                // We can't easily insert with a specific ID if it's auto-generated usually, but here ID is text.
                // We'll skip creating 'default-user' if we can't, but let's try inserting it if users table allows.
                // If users table is linked to auth, this might be tricky.
                // Let's assume for this specific seed we might need to adjust the payload in POSContext or insert a mock user.
                // Attempting insert:
                try {
                    await pool.query(`
                    INSERT INTO users (id, tenant_id, name, username, email, password, role)
                    VALUES ($1, $2, 'POS User', 'pos_user', 'pos@example.com', 'hash', 'cashier')
                `, ['default-user', tenantId]);
                } catch (e: any) {
                    console.warn("Could not create 'default-user'. Error:", e.message);
                }
            } else {
                // Create one
                await pool.query(`
                INSERT INTO users (id, tenant_id, name, username, email, password, role)
                VALUES ($1, $2, 'POS User', 'pos_user', 'pos@example.com', 'hash', 'cashier')
            `, ['default-user', tenantId]);
            }
        }

        console.log('✅ Seed completed successfully');

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

seedShopData();
