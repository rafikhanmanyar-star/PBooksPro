
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './server/.env' });

async function checkLoyalty() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const members = await client.query('SELECT * FROM shop_loyalty_members');
        console.log(`Found ${members.rowCount} loyalty members in total`);
        if (members.rowCount > 0) {
            console.log('Sample Member:', members.rows[0]);
        }

        const contacts = await client.query('SELECT * FROM contacts WHERE type = \'Customer\'');
        console.log(`Found ${contacts.rowCount} customer contacts`);

        const tenants = await client.query('SELECT id, name FROM tenants');
        console.log('Tenants:', tenants.rows);

        const joined = await client.query(`
            SELECT m.*, c.name, c.tenant_id as contact_tenant
            FROM shop_loyalty_members m
            JOIN contacts c ON m.customer_id = c.id
        `);
        console.log(`Successfully joined ${joined.rowCount} members with contacts`);
        if (joined.rowCount > 0) {
            console.log('Sample Joined Record:', joined.rows[0]);
        }

    } catch (err) {
        console.error('Error checking loyalty:', err);
    } finally {
        await client.end();
    }
}

checkLoyalty();
