/**
 * Extracts CREATE_SCHEMA_SQL from schema.ts into electron/schema.sql
 */
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../services/database/schema.ts');
const outPath = path.join(__dirname, '../electron/schema.sql');

const content = fs.readFileSync(schemaPath, 'utf8');
// Match template literal content - from ` to `;
const start = content.indexOf('CREATE_SCHEMA_SQL = `') + 'CREATE_SCHEMA_SQL = `'.length;
const end = content.lastIndexOf('`;');
if (start <= 0 || end <= start) {
  console.error('Could not extract schema');
  process.exit(1);
}
const sql = content.substring(start, end);
fs.writeFileSync(outPath, sql);
console.log('Extracted schema:', sql.length, 'chars to electron/schema.sql');

const verMatch = content.match(/export const SCHEMA_VERSION = (\d+)/);
const schemaVersion = verMatch ? parseInt(verMatch[1], 10) : 1;
const verPath = path.join(__dirname, '../electron/schemaVersion.json');
fs.writeFileSync(verPath, JSON.stringify({ version: schemaVersion }, null, 0) + '\n');
console.log('Wrote electron/schemaVersion.json version:', schemaVersion);
