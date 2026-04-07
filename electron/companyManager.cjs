/**
 * PBooks Pro - Company Manager
 * Manages multi-company SQLite databases via a central master_index.db.
 * Each company gets its own isolated .db file under data/companies/.
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let masterDb = null;
let activeCompanyId = null;
let activeCompanyInfo = null;
let sqliteBridge = null;

// ---------------------------------------------------------------------------
// Paths — same folder for test (npm run test:local-only) and installed app
// Company files: <base>/data/companies/*.db, master_index.db in <base>
// Windows: C:\Users\<user>\AppData\Roaming\pbooks-pro\pbookspro
// ---------------------------------------------------------------------------
function getBaseDir() {
  const { app } = require('electron');
  const isWindows = process.platform === 'win32';
  if (isWindows && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'pbooks-pro', 'pbookspro');
  }
  const appData = app.getPath('appData');
  const parent = path.dirname(appData);
  return path.join(parent, 'pbooks-pro', 'pbookspro');
}

function getMasterDbPath() {
  return path.join(getBaseDir(), 'master_index.db');
}

function getCompaniesDir() {
  const dir = path.join(getBaseDir(), 'data', 'companies');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getBackupsDir() {
  const dir = path.join(getBaseDir(), 'data', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Schema file resolution (for create company and restore)
// Tries: __dirname, process.cwd()/electron, then generates from schema.ts if in dev
// ---------------------------------------------------------------------------
function getSchemaPath() {
  const nextToElectron = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(nextToElectron)) return nextToElectron;

  const fromCwd = path.join(process.cwd(), 'electron', 'schema.sql');
  if (fs.existsSync(fromCwd)) return fromCwd;

  // Dev fallback: generate from services/database/schema.ts if present
  const schemaTsPath = path.join(process.cwd(), 'services', 'database', 'schema.ts');
  if (fs.existsSync(schemaTsPath)) {
    try {
      const content = fs.readFileSync(schemaTsPath, 'utf8');
      const start = content.indexOf('CREATE_SCHEMA_SQL = `') + 'CREATE_SCHEMA_SQL = `'.length;
      const end = content.lastIndexOf('`;');
      if (start > 0 && end > start) {
        const sql = content.substring(start, end);
        const outPath = path.join(process.cwd(), 'electron', 'schema.sql');
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, sql);
        console.log('[CompanyManager] Generated electron/schema.sql from schema.ts');
        return outPath;
      }
    } catch (e) {
      console.warn('[CompanyManager] Could not generate schema from schema.ts:', e.message);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Slug / sanitization helpers
// ---------------------------------------------------------------------------

function slugify(name) {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
  if (!slug) slug = 'company';
  return slug;
}

function validateSlug(slug) {
  if (!slug || slug.length === 0) return false;
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) return false;
  if (/^[.\s]/.test(slug)) return false;
  return true;
}

function generateId() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Password hashing (Node.js built-in scrypt, no external deps)
// ---------------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

// ---------------------------------------------------------------------------
// Master index DB
// ---------------------------------------------------------------------------

function getMasterDb() {
  if (masterDb) return masterDb;
  const Database = require('better-sqlite3');
  const dbPath = getMasterDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  masterDb = new Database(dbPath);
  masterDb.pragma('journal_mode = WAL');
  masterDb.pragma('foreign_keys = ON');

  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      db_file_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_opened_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      schema_version INTEGER NOT NULL DEFAULT 13
    );
  `);

  return masterDb;
}

// ---------------------------------------------------------------------------
// Company CRUD
// ---------------------------------------------------------------------------

/** Normalize path for comparison (resolve and use forward slashes on Windows for consistency) */
function normalizeDbPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

/**
 * Discover .db files in data/companies that are not yet in master_index
 * and register them so they appear in the company list.
 */
function discoverCompaniesFromFolder() {
  const db = getMasterDb();
  const companiesDir = getCompaniesDir();
  let added = 0;

  if (!fs.existsSync(companiesDir)) return added;

  const files = fs.readdirSync(companiesDir);
  const existingPaths = new Set(
    db.prepare('SELECT db_file_path FROM companies WHERE is_active = 1').all()
      .map((row) => normalizeDbPath(row.db_file_path))
  );

  for (const file of files) {
    if (!file.endsWith('.db') || file === 'master_index.db') continue;
    const fullPath = path.join(companiesDir, file);
    if (!fs.statSync(fullPath).isFile()) continue;

    const normalized = normalizeDbPath(fullPath);
    if (existingPaths.has(normalized)) continue;

    const slug = path.basename(file, '.db');
    if (!validateSlug(slug)) continue;

    // Avoid duplicate slug
    let uniqueSlug = slug;
    let suffix = 0;
    while (db.prepare('SELECT id FROM companies WHERE slug = ?').get(uniqueSlug)) {
      suffix += 1;
      uniqueSlug = `${slug}_${suffix}`;
    }

    const companyName = uniqueSlug
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');

    const companyId = generateId();
    db.prepare(
      `INSERT INTO companies (id, company_name, slug, db_file_path, created_at, last_opened_at, schema_version)
       VALUES (?, ?, ?, ?, datetime('now'), NULL, 13)`
    ).run(companyId, companyName, uniqueSlug, fullPath);
    existingPaths.add(normalized);
    added += 1;
    console.log('[CompanyManager] Discovered company from folder:', fullPath, '→', companyName);
  }

  return added;
}

function listCompanies() {
  discoverCompaniesFromFolder();
  const db = getMasterDb();
  return db.prepare(
    'SELECT id, company_name, slug, db_file_path, created_at, last_opened_at, is_active, schema_version FROM companies WHERE is_active = 1 ORDER BY last_opened_at DESC, company_name ASC'
  ).all();
}

function getCompanyById(id) {
  const db = getMasterDb();
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
}

function createCompany(companyName) {
  if (!companyName || !companyName.trim()) {
    return { ok: false, error: 'Company name is required.' };
  }
  const name = companyName.trim();
  const db = getMasterDb();

  // Duplicate check
  const existing = db.prepare('SELECT id FROM companies WHERE LOWER(company_name) = LOWER(?)').get(name);
  if (existing) {
    return { ok: false, error: 'A company with this name already exists.' };
  }

  let slug = slugify(name);
  if (!validateSlug(slug)) {
    return { ok: false, error: 'Company name produces an invalid file name. Use alphanumeric characters.' };
  }

  // Ensure slug uniqueness by appending a counter
  const slugBase = slug;
  let counter = 1;
  while (db.prepare('SELECT id FROM companies WHERE slug = ?').get(slug)) {
    slug = `${slugBase}_${counter}`;
    counter++;
  }

  const companyId = generateId();
  const dbFileName = `${slug}.db`;
  const dbFilePath = path.join(getCompaniesDir(), dbFileName);

  // Atomic creation: build in temp, move to final on success
  const tmpPath = dbFilePath + '.tmp';
  try {
    // Clean up any leftover temp file
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

    const Database = require('better-sqlite3');
    const companyDb = new Database(tmpPath);
    companyDb.pragma('journal_mode = WAL');
    companyDb.pragma('synchronous = NORMAL');
    companyDb.pragma('foreign_keys = ON');
    companyDb.pragma('wal_autocheckpoint = 1000');

    // Load and execute the full application schema
    const schemaPath = getSchemaPath();
    if (!schemaPath) {
      companyDb.close();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      return { ok: false, error: 'Schema file not found. Run npm run electron:extract-schema first, or run the app via npm run test:local-only.' };
    }
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const stripped = schema.replace(/--[^\n]*/g, '');
    const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      try {
        companyDb.exec(stmt + ';');
      } catch (e) {
        if (!e.message.includes('already exists') && !e.message.includes('duplicate column')) {
          console.warn('[CompanyManager] Schema statement skipped:', e.message);
        }
      }
    }

    // Insert company_settings
    companyDb.exec(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        company_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    companyDb.prepare(
      "INSERT OR REPLACE INTO company_settings (id, company_name) VALUES ('default', ?)"
    ).run(name);

    // Set schema version
    companyDb.prepare(
      "INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES ('schema_version', '13', datetime('now'))"
    ).run();

    // Insert default admin user (no password, force change on first use)
    const adminId = generateId();
    companyDb.prepare(
      `INSERT OR IGNORE INTO users (id, tenant_id, username, name, role, password, is_active, force_password_change, created_at, updated_at)
       VALUES (?, 'local', 'admin', 'Administrator', 'SUPER_ADMIN', NULL, 1, 1, datetime('now'), datetime('now'))`
    ).run(adminId);

    // Normalize tenant_ids to 'local'
    const tenantTables = [
      'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
      'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
      'quotations', 'plan_amenities', 'installment_plans', 'documents',
      'rental_agreements', 'project_agreements', 'sales_returns', 'contracts',
      'recurring_invoice_templates', 'pm_cycle_allocations', 'users',
    ];
    for (const table of tenantTables) {
      try {
        const cols = companyDb.prepare(`PRAGMA table_info("${table}")`).all();
        if (cols.some(c => c.name === 'tenant_id')) {
          companyDb.prepare(`UPDATE OR IGNORE "${table}" SET tenant_id = 'local' WHERE tenant_id != 'local'`).run();
        }
      } catch (_) {}
    }

    companyDb.close();

    // WAL checkpoint the temp file to collapse WAL/SHM into main file before move
    const checkpointDb = new Database(tmpPath);
    checkpointDb.pragma('wal_checkpoint(TRUNCATE)');
    checkpointDb.close();

    // Move temp to final (atomic on same filesystem)
    fs.renameSync(tmpPath, dbFilePath);
    // Clean up WAL/SHM from temp
    if (fs.existsSync(tmpPath + '-wal')) fs.unlinkSync(tmpPath + '-wal');
    if (fs.existsSync(tmpPath + '-shm')) fs.unlinkSync(tmpPath + '-shm');

    // Register in master_index
    db.prepare(
      `INSERT INTO companies (id, company_name, slug, db_file_path, created_at, schema_version)
       VALUES (?, ?, ?, ?, datetime('now'), 13)`
    ).run(companyId, name, slug, dbFilePath);

    console.log(`[CompanyManager] Created company "${name}" → ${dbFilePath}`);
    return { ok: true, company: getCompanyById(companyId) };
  } catch (err) {
    // Cleanup on failure
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    try { if (fs.existsSync(tmpPath + '-wal')) fs.unlinkSync(tmpPath + '-wal'); } catch (_) {}
    try { if (fs.existsSync(tmpPath + '-shm')) fs.unlinkSync(tmpPath + '-shm'); } catch (_) {}
    console.error('[CompanyManager] Create company failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Open / close / switch
// ---------------------------------------------------------------------------

function openCompany(companyId) {
  if (!sqliteBridge) {
    return { ok: false, error: 'SQLite bridge not initialized.' };
  }
  const company = getCompanyById(companyId);
  if (!company) {
    return { ok: false, error: 'Company not found.' };
  }
  if (!fs.existsSync(company.db_file_path)) {
    return { ok: false, error: `Database file not found: ${company.db_file_path}` };
  }

  // Close current connection
  sqliteBridge.close();

  // Open the company DB via the bridge
  sqliteBridge.openDb(company.db_file_path);

  // Update last_opened_at
  const db = getMasterDb();
  db.prepare('UPDATE companies SET last_opened_at = datetime(\'now\') WHERE id = ?').run(companyId);

  activeCompanyId = companyId;
  activeCompanyInfo = getCompanyById(companyId);

  console.log(`[CompanyManager] Opened company "${company.company_name}"`);
  return { ok: true, company: activeCompanyInfo };
}

function closeActiveCompany() {
  if (sqliteBridge) {
    sqliteBridge.close();
  }
  activeCompanyId = null;
  activeCompanyInfo = null;
}

function getActiveCompany() {
  if (!activeCompanyId) return null;
  return activeCompanyInfo || getCompanyById(activeCompanyId);
}

/**
 * Returns true if filePath is inside the app's data/companies directory.
 */
function isPathInsideCompaniesDir(filePath) {
  const resolved = path.resolve(filePath);
  const companiesDirNorm = path.resolve(getCompaniesDir());
  const rel = path.relative(companiesDirNorm, path.dirname(resolved));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Open a company by its database file path. If the path is not in master_index, register it first.
 * Used when the user browses and selects a .db file from anywhere on the PC.
 *
 * When the selected file is OUTSIDE the app's data/companies/ folder (e.g. a backup on USB or
 * another folder), we COPY it into data/companies/ and open the copy. This ensures:
 * - The original backup file is never modified (saves go to the copy).
 * - A full, consistent copy is used (we run WAL checkpoint on source before copy so all data
 *   is in the main .db file), avoiding incomplete data when opening backups on another desktop.
 */
function openCompanyByPath(filePath) {
  if (!sqliteBridge) {
    return { ok: false, error: 'SQLite bridge not initialized.' };
  }
  let fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    return { ok: false, error: 'File not found.' };
  }

  const companiesDir = getCompaniesDir();
  const db = getMasterDb();

  // If the file is outside our companies folder (e.g. backup on another drive), copy it in first.
  if (!isPathInsideCompaniesDir(fullPath)) {
    try {
      const Database = require('better-sqlite3');
      const srcDb = new Database(fullPath, { readonly: true });
      try {
        srcDb.pragma('wal_checkpoint(TRUNCATE)');
      } catch (_) {}
      srcDb.close();
      const baseName = path.basename(fullPath, '.db');
      const baseSlug = slugify(baseName) || 'company';
      const safeSlug = validateSlug(baseSlug) ? baseSlug : 'company';
      let uniqueSlug = safeSlug;
      let suffix = 0;
      while (db.prepare('SELECT id FROM companies WHERE slug = ?').get(uniqueSlug)) {
        suffix += 1;
        uniqueSlug = `${safeSlug}_${suffix}`;
      }
      const targetPath = path.join(companiesDir, `${uniqueSlug}.db`);
      fs.copyFileSync(fullPath, targetPath);
      if (fs.existsSync(fullPath + '-wal')) fs.copyFileSync(fullPath + '-wal', targetPath + '-wal');
      if (fs.existsSync(fullPath + '-shm')) fs.copyFileSync(fullPath + '-shm', targetPath + '-shm');
      const copyDb = new Database(targetPath);
      copyDb.pragma('wal_checkpoint(TRUNCATE)');
      copyDb.close();
      try { if (fs.existsSync(targetPath + '-wal')) fs.unlinkSync(targetPath + '-wal'); } catch (_) {}
      try { if (fs.existsSync(targetPath + '-shm')) fs.unlinkSync(targetPath + '-shm'); } catch (_) {}
      fullPath = targetPath;
      console.log('[CompanyManager] Copied external company file into data/companies and will open:', uniqueSlug + '.db');
    } catch (err) {
      console.error('[CompanyManager] Copy external file failed:', err);
      return { ok: false, error: `Could not copy company file: ${err.message}` };
    }
  }

  const normalized = normalizeDbPath(fullPath);

  // Find existing company with this path (any active row matching normalized path)
  const allActive = db.prepare(
    'SELECT id, company_name, slug, db_file_path, created_at, last_opened_at, is_active, schema_version FROM companies WHERE is_active = 1'
  ).all();
  const existing = allActive.find((row) => normalizeDbPath(row.db_file_path) === normalized);

  let companyId;
  if (existing) {
    companyId = existing.id;
  } else {
    const baseName = path.basename(fullPath, '.db');
    const slug = slugify(baseName) || 'company';
    if (!validateSlug(slug)) {
      return { ok: false, error: 'Invalid file name for company database.' };
    }
    let uniqueSlug = slug;
    let suffix = 0;
    while (db.prepare('SELECT id FROM companies WHERE slug = ?').get(uniqueSlug)) {
      suffix += 1;
      uniqueSlug = `${slug}_${suffix}`;
    }
    const companyName = uniqueSlug
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
    companyId = generateId();
    db.prepare(
      `INSERT INTO companies (id, company_name, slug, db_file_path, created_at, last_opened_at, schema_version)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 13)`
    ).run(companyId, companyName, uniqueSlug, fullPath);
    console.log('[CompanyManager] Registered company from file:', fullPath, '→', companyName);
  }

  return openCompany(companyId);
}

/**
 * Show file picker for selecting a company .db file. Returns the selected path or canceled.
 */
async function selectCompanyFile() {
  const result = await dialog.showOpenDialog({
    title: 'Select Company Database',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  return { ok: true, filePath: result.filePaths[0] };
}

/**
 * Read company name from a company .db file (read-only). Used before opening/browsed file to show in rename modal.
 */
function getCompanyNameFromFile(filePath) {
  let fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    return { ok: false, error: 'File not found.' };
  }
  try {
    const Database = require('better-sqlite3');
    const db = new Database(fullPath, { readonly: true });
    let companyName = null;
    try {
      const cs = db.prepare("SELECT company_name FROM company_settings WHERE id = 'default'").get();
      if (cs) companyName = cs.company_name;
    } catch (_) {}
    if (!companyName) {
      try {
        const ps = db.prepare("SELECT value FROM app_settings WHERE key = 'printSettings'").get();
        if (ps && ps.value) {
          const parsed = JSON.parse(ps.value);
          if (parsed.companyName) companyName = parsed.companyName;
        }
      } catch (_) {}
    }
    if (!companyName) {
      const baseName = path.basename(fullPath, '.db');
      companyName = baseName.replace(/_/g, ' ');
    }
    db.close();
    return { ok: true, companyName: companyName || 'Company' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Copy an external company DB into data/companies with a new company name. Registers in master_index.
 * Does NOT open the company. Source file is never written to.
 * If a company with the same name (or slug) already exists at default folder, returns error and does not overwrite.
 */
function copyExternalCompanyWithNewName(sourceFilePath, newCompanyName) {
  const name = typeof newCompanyName === 'string' ? newCompanyName.trim() : '';
  if (!name) return { ok: false, error: 'Company name is required.' };

  let fullPath = path.resolve(sourceFilePath);
  if (!fs.existsSync(fullPath)) {
    return { ok: false, error: 'File not found.' };
  }

  const companiesDir = getCompaniesDir();
  const db = getMasterDb();

  const slug = slugify(name);
  if (!validateSlug(slug)) {
    return { ok: false, error: 'Company name produces an invalid file name. Use alphanumeric characters.' };
  }

  // Duplicate-name check: master index (slug or company_name) and filesystem
  const existingBySlug = db.prepare('SELECT id FROM companies WHERE slug = ? AND is_active = 1').get(slug);
  const existingByName = db.prepare('SELECT id FROM companies WHERE LOWER(company_name) = LOWER(?) AND is_active = 1').get(name);
  const targetPath = path.join(companiesDir, `${slug}.db`);
  const fileExists = fs.existsSync(targetPath);

  if (existingBySlug || existingByName || fileExists) {
    return { ok: false, error: 'A company with this name already exists at the default location. Please choose a different name.' };
  }

  try {
    const Database = require('better-sqlite3');
    const srcDb = new Database(fullPath, { readonly: true });
    try {
      srcDb.pragma('wal_checkpoint(TRUNCATE)');
    } catch (_) {}
    srcDb.close();

    fs.copyFileSync(fullPath, targetPath);
    if (fs.existsSync(fullPath + '-wal')) fs.copyFileSync(fullPath + '-wal', targetPath + '-wal');
    if (fs.existsSync(fullPath + '-shm')) fs.copyFileSync(fullPath + '-shm', targetPath + '-shm');

    const copyDb = new Database(targetPath);
    copyDb.pragma('wal_checkpoint(TRUNCATE)');
    copyDb.exec(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        company_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    copyDb.prepare(
      "INSERT OR REPLACE INTO company_settings (id, company_name, updated_at) VALUES ('default', ?, datetime('now'))"
    ).run(name);
    copyDb.close();

    try { if (fs.existsSync(targetPath + '-wal')) fs.unlinkSync(targetPath + '-wal'); } catch (_) {}
    try { if (fs.existsSync(targetPath + '-shm')) fs.unlinkSync(targetPath + '-shm'); } catch (_) {}

    const companyId = generateId();
    db.prepare(
      `INSERT INTO companies (id, company_name, slug, db_file_path, created_at, last_opened_at, schema_version)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 13)`
    ).run(companyId, name, slug, targetPath);

    console.log('[CompanyManager] Created company from external file with new name:', name, '→', targetPath);
    return { ok: true, companyId, company: getCompanyById(companyId) };
  } catch (err) {
    console.error('[CompanyManager] copyExternalCompanyWithNewName failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

function deleteCompany(companyId) {
  const db = getMasterDb();
  const company = getCompanyById(companyId);
  if (!company) return { ok: false, error: 'Company not found.' };

  // If this is the active company, close it first
  if (activeCompanyId === companyId) {
    closeActiveCompany();
  }

  // Soft-delete
  db.prepare('UPDATE companies SET is_active = 0 WHERE id = ?').run(companyId);
  console.log(`[CompanyManager] Soft-deleted company "${company.company_name}"`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Credentials check / login
// ---------------------------------------------------------------------------

function checkCredentials(companyId) {
  const company = getCompanyById(companyId);
  if (!company) return { ok: false, error: 'Company not found.' };
  if (!fs.existsSync(company.db_file_path)) return { ok: false, error: 'DB file not found.' };

  try {
    const Database = require('better-sqlite3');
    const tmpDb = new Database(company.db_file_path, { readonly: true });
    // Return all active users so any company user can log in; credentials checked at login
    const users = tmpDb.prepare(
      'SELECT id, username, password, force_password_change FROM users WHERE is_active = 1 LIMIT 50'
    ).all();
    tmpDb.close();

    const hasPassword = users.some(u => u.password && u.password.length > 0);
    return { ok: true, requiresLogin: hasPassword, users: users.map(u => ({ id: u.id, username: u.username })) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function loginToCompany(companyId, username, password) {
  const company = getCompanyById(companyId);
  if (!company) return { ok: false, error: 'Company not found.' };

  try {
    const Database = require('better-sqlite3');
    const tmpDb = new Database(company.db_file_path, { readonly: true });
    const user = tmpDb.prepare(
      "SELECT id, username, password, name, role, force_password_change FROM users WHERE username = ? AND is_active = 1"
    ).get(username);
    tmpDb.close();

    if (!user) return { ok: false, error: 'Invalid username or password.' };

    // NULL password means no password set yet - allow access
    if (!user.password) {
      return {
        ok: true,
        user: { id: user.id, username: user.username, name: user.name, role: user.role },
        forcePasswordChange: true,
      };
    }

    if (!verifyPassword(password, user.password)) {
      return { ok: false, error: 'Invalid username or password.' };
    }

    return {
      ok: true,
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
      forcePasswordChange: !!user.force_password_change,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Set password (for force_password_change flow)
// ---------------------------------------------------------------------------

function setUserPassword(companyId, userId, newPassword) {
  const company = getCompanyById(companyId);
  if (!company) return { ok: false, error: 'Company not found.' };
  if (!newPassword || newPassword.length < 4) return { ok: false, error: 'Password must be at least 4 characters.' };

  try {
    const Database = require('better-sqlite3');
    const companyDb = new Database(company.db_file_path);
    const hashed = hashPassword(newPassword);
    companyDb.prepare('UPDATE users SET password = ?, force_password_change = 0, updated_at = datetime(\'now\') WHERE id = ?').run(hashed, userId);
    companyDb.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Prepare for backup — flush WAL into main DB so in-memory transactions are on disk before backup
// Call after renderer has flushed app state (save-state-before-backup); ensures main process has committed and checkpointed.
// ---------------------------------------------------------------------------
function prepareForBackup(companyId) {
  if (activeCompanyId !== companyId || !sqliteBridge) {
    return { ok: false, error: 'Company not open or bridge not ready.' };
  }
  const srcDb = sqliteBridge.getDb();
  if (!srcDb) {
    return { ok: false, error: 'No database connection.' };
  }
  try {
    srcDb.pragma('wal_checkpoint(TRUNCATE)');
    return { ok: true };
  } catch (err) {
    console.error('[CompanyManager] prepareForBackup checkpoint failed:', err);
    return { ok: false, error: err?.message || 'Checkpoint failed.' };
  }
}

// ---------------------------------------------------------------------------
// Backup — full snapshot of all company data (DB + WAL checkpoint; callers should flush subsystems e.g. payroll first)
// ---------------------------------------------------------------------------

async function backupCompany(companyId) {
  const company = getCompanyById(companyId);
  if (!company) return { ok: false, error: 'Company not found.' };
  if (!fs.existsSync(company.db_file_path)) return { ok: false, error: 'DB file not found.' };

  const backupsDir = getBackupsDir();
  const now = new Date();
  const ts = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + '_'
    + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0');
  const backupName = `${company.slug}_backup_${ts}.db`;
  const backupPath = path.join(backupsDir, backupName);
  const tmpBackupPath = backupPath + '.tmp';

  try {
    // Force WAL checkpoint to merge all pending WAL data into the main DB file before backup
    if (activeCompanyId === companyId && sqliteBridge) {
      const srcDb = sqliteBridge.getDb();
      if (srcDb) {
        try {
          srcDb.pragma('wal_checkpoint(TRUNCATE)');
          // Log source DB counts for verification (include project_agreements and pm_cycle_allocations for backup completeness)
          const tables = ['accounts', 'contacts', 'transactions', 'invoices', 'bills', 'project_agreements', 'pm_cycle_allocations'];
          const srcCounts = {};
          for (const t of tables) {
            try {
              const r = srcDb.prepare(`SELECT count(*) as cnt FROM "${t}"`).get();
              srcCounts[t] = r ? r.cnt : 0;
            } catch (_) {}
          }
          console.log('[CompanyManager] Source DB data counts:', JSON.stringify(srcCounts));
        } catch (_) {}
      }
      if (srcDb && typeof srcDb.backup === 'function') {
        await srcDb.backup(tmpBackupPath);
        fs.renameSync(tmpBackupPath, backupPath);
      } else {
        fs.copyFileSync(company.db_file_path, tmpBackupPath);
        fs.renameSync(tmpBackupPath, backupPath);
      }
    } else {
      // Company not open - WAL checkpoint via temporary connection, then copy
      const Database = require('better-sqlite3');
      try {
        const tmpDb = new Database(company.db_file_path);
        tmpDb.pragma('wal_checkpoint(TRUNCATE)');
        tmpDb.close();
      } catch (openErr) {
        throw openErr;
      }
      fs.copyFileSync(company.db_file_path, tmpBackupPath);
      fs.renameSync(tmpBackupPath, backupPath);
    }

    // Clean up WAL/SHM from backup (shouldn't exist after checkpoint but be safe)
    try { if (fs.existsSync(backupPath + '-wal')) fs.unlinkSync(backupPath + '-wal'); } catch (_) {}
    try { if (fs.existsSync(backupPath + '-shm')) fs.unlinkSync(backupPath + '-shm'); } catch (_) {}

    if (!fs.existsSync(backupPath)) {
      return { ok: false, error: 'Backup file was not created.' };
    }
    const Database = require('better-sqlite3');

    // Verify integrity and data completeness
    const verifyDb = new Database(backupPath, { readonly: true });
    const result = verifyDb.pragma('integrity_check');
    const isOk = result && result.length > 0 && result[0].integrity_check === 'ok';

    // Log data counts for debugging (include project_agreements and pm_cycle_allocations to verify backup completeness)
    try {
      const tables = ['accounts', 'contacts', 'transactions', 'invoices', 'bills', 'projects', 'buildings', 'project_agreements', 'pm_cycle_allocations'];
      const counts = {};
      for (const t of tables) {
        try {
          const row = verifyDb.prepare(`SELECT count(*) as cnt FROM "${t}"`).get();
          counts[t] = row ? row.cnt : 0;
        } catch (_) { counts[t] = 'n/a'; }
      }
      console.log('[CompanyManager] Backup data counts:', JSON.stringify(counts));
    } catch (_) {}
    verifyDb.close();

    if (!isOk) {
      fs.unlinkSync(backupPath);
      return { ok: false, error: 'Backup integrity check failed.' };
    }

    // Embed app version into backup metadata and consolidate WAL
    try {
      const { app } = require('electron');
      const appVersion = app.getVersion();
      const metaDb = new Database(backupPath);
      metaDb.exec("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)");
      metaDb.prepare("INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES ('app_version', ?, datetime('now'))").run(appVersion);
      metaDb.pragma('wal_checkpoint(TRUNCATE)');
      metaDb.close();
      // Clean up WAL/SHM created by the metadata write
      try { if (fs.existsSync(backupPath + '-wal')) fs.unlinkSync(backupPath + '-wal'); } catch (_) {}
      try { if (fs.existsSync(backupPath + '-shm')) fs.unlinkSync(backupPath + '-shm'); } catch (_) {}
    } catch (versionErr) {
      console.warn('[CompanyManager] Could not embed app version in backup:', versionErr.message);
    }

    const stats = fs.statSync(backupPath);
    console.log(`[CompanyManager] Backup created: ${backupPath} (${(stats.size / 1024).toFixed(1)} KB)`);
    return {
      ok: true,
      backup: {
        name: backupName,
        path: backupPath,
        size: stats.size,
        createdAt: now.toISOString(),
      },
    };
  } catch (err) {
    console.error('[CompanyManager] Backup failed:', err);
    return { ok: false, error: err.message };
  }
}

function listBackups(companyId) {
  const company = companyId ? getCompanyById(companyId) : null;
  const backupsDir = getBackupsDir();
  if (!fs.existsSync(backupsDir)) return [];

  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db') && !f.endsWith('.tmp'));

  // Filter by company slug if provided
  const filtered = company
    ? files.filter(f => f.startsWith(company.slug + '_backup_'))
    : files;

  return filtered.map(f => {
    const fullPath = path.join(backupsDir, f);
    const stats = fs.statSync(fullPath);
    return {
      name: f,
      path: fullPath,
      size: stats.size,
      createdAt: stats.mtime.toISOString(),
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

function restoreCompany(backupFilePath) {
  if (!backupFilePath || !fs.existsSync(backupFilePath)) {
    return { ok: false, error: 'Backup file not found.' };
  }

  try {
    const Database = require('better-sqlite3');

    // Open backup read-only to extract info
    const backupDb = new Database(backupFilePath, { readonly: true });

    let companyName = null;
    let schemaVersion = null;

    // Try company_settings table
    try {
      const cs = backupDb.prepare("SELECT company_name FROM company_settings WHERE id = 'default'").get();
      if (cs) companyName = cs.company_name;
    } catch (_) {}

    // Try metadata for company name (from printSettings)
    if (!companyName) {
      try {
        const ps = backupDb.prepare("SELECT value FROM app_settings WHERE key = 'printSettings'").get();
        if (ps && ps.value) {
          const parsed = JSON.parse(ps.value);
          if (parsed.companyName) companyName = parsed.companyName;
        }
      } catch (_) {}
    }

    if (!companyName) {
      // Derive from filename
      const baseName = path.basename(backupFilePath, '.db');
      companyName = baseName.replace(/_backup_\d+_\d+$/, '').replace(/_/g, ' ');
    }

    // Get schema version and app version
    try {
      const sv = backupDb.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get();
      if (sv) schemaVersion = parseInt(sv.value);
    } catch (_) {}

    let backupAppVersion = null;
    try {
      const av = backupDb.prepare("SELECT value FROM metadata WHERE key = 'app_version'").get();
      if (av) backupAppVersion = av.value;
    } catch (_) {}

    backupDb.close();

    // Check for existing company with same name
    const mDb = getMasterDb();
    const existing = mDb.prepare('SELECT id, slug, db_file_path FROM companies WHERE LOWER(company_name) = LOWER(?) AND is_active = 1').get(companyName);

    let targetSlug, targetPath, targetId;

    if (existing) {
      // Close if currently active
      if (activeCompanyId === existing.id) {
        closeActiveCompany();
      }
      targetSlug = existing.slug;
      targetPath = existing.db_file_path;
      targetId = existing.id;

      // Back up existing before overwrite
      const overwriteBackupPath = targetPath + '.pre-restore';
      try {
        if (fs.existsSync(targetPath)) fs.copyFileSync(targetPath, overwriteBackupPath);
      } catch (_) {}
    } else {
      targetSlug = slugify(companyName);
      let counter = 1;
      const base = targetSlug;
      while (mDb.prepare('SELECT id FROM companies WHERE slug = ?').get(targetSlug)) {
        targetSlug = `${base}_${counter}`;
        counter++;
      }
      targetPath = path.join(getCompaniesDir(), `${targetSlug}.db`);
      targetId = generateId();
    }

    // Copy backup to target
    const tmpTarget = targetPath + '.tmp';
    fs.copyFileSync(backupFilePath, tmpTarget);

    // Run schema init on the restored DB to handle migrations
    const restoredDb = new Database(tmpTarget);
    restoredDb.pragma('journal_mode = WAL');
    restoredDb.pragma('foreign_keys = ON');

    // Ensure company_settings table
    restoredDb.exec(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        company_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    restoredDb.prepare(
      "INSERT OR REPLACE INTO company_settings (id, company_name, updated_at) VALUES ('default', ?, datetime('now'))"
    ).run(companyName);

    // Run the full schema to add any missing tables/columns
    const schemaPath = getSchemaPath();
    if (schemaPath && fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      const stripped = schema.replace(/--[^\n]*/g, '');
      const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          restoredDb.exec(stmt + ';');
        } catch (e) {
          if (!e.message.includes('already exists') && !e.message.includes('duplicate column')) {
            console.warn('[CompanyManager] Restore schema stmt skipped:', e.message);
          }
        }
      }
    }

    // Integrity check
    const result = restoredDb.pragma('integrity_check');
    const isOk = result && result.length > 0 && result[0].integrity_check === 'ok';
    restoredDb.pragma('wal_checkpoint(TRUNCATE)');
    restoredDb.close();

    if (!isOk) {
      if (fs.existsSync(tmpTarget)) fs.unlinkSync(tmpTarget);
      return { ok: false, error: 'Restored database failed integrity check.' };
    }

    // Move to final location
    if (fs.existsSync(targetPath)) {
      // Remove old WAL/SHM
      try { if (fs.existsSync(targetPath + '-wal')) fs.unlinkSync(targetPath + '-wal'); } catch (_) {}
      try { if (fs.existsSync(targetPath + '-shm')) fs.unlinkSync(targetPath + '-shm'); } catch (_) {}
    }
    fs.renameSync(tmpTarget, targetPath);
    try { if (fs.existsSync(tmpTarget + '-wal')) fs.unlinkSync(tmpTarget + '-wal'); } catch (_) {}
    try { if (fs.existsSync(tmpTarget + '-shm')) fs.unlinkSync(tmpTarget + '-shm'); } catch (_) {}

    // Register / update in master_index
    if (existing) {
      mDb.prepare("UPDATE companies SET last_opened_at = datetime('now'), schema_version = ? WHERE id = ?")
        .run(schemaVersion || 13, targetId);
    } else {
      mDb.prepare(
        "INSERT INTO companies (id, company_name, slug, db_file_path, created_at, schema_version) VALUES (?, ?, ?, ?, datetime('now'), ?)"
      ).run(targetId, companyName, targetSlug, targetPath, schemaVersion || 13);
    }

    // Get current app version for comparison
    let currentAppVersion = null;
    try {
      const { app } = require('electron');
      currentAppVersion = app.getVersion();
    } catch (_) {}

    console.log(`[CompanyManager] Restored company "${companyName}" from ${backupFilePath}`);
    return {
      ok: true,
      companyId: targetId,
      companyName,
      isOverwrite: !!existing,
      backupAppVersion,
      currentAppVersion,
    };
  } catch (err) {
    console.error('[CompanyManager] Restore failed:', err);
    const code = err.code || '';
    const msg = err.message ? String(err.message) : '';
    const isFileInUse = code === 'EPERM' || code === 'EBUSY' ||
      /operation not permitted|in use|locked|access is denied/i.test(msg);
    if (isFileInUse) {
      return { ok: false, error: 'DATABASE_FILE_IN_USE' };
    }
    return { ok: false, error: msg || 'Restore failed.' };
  }
}

// ---------------------------------------------------------------------------
// Migration: import existing single PBooksPro.db
// ---------------------------------------------------------------------------

function migrateExistingSingleDb() {
  const masterPath = getMasterDbPath();

  // Only migrate if master_index.db doesn't exist yet
  if (fs.existsSync(masterPath)) return false;

  const baseDir = getBaseDir();
  const oldDbPath = path.join(baseDir, 'PBooksPro.db');
  const oldStagingDbPath = path.join(baseDir, 'PBooksPro-Staging.db');

  const dbToMigrate = fs.existsSync(oldDbPath) ? oldDbPath : (fs.existsSync(oldStagingDbPath) ? oldStagingDbPath : null);
  if (!dbToMigrate) return false;

  console.log(`[CompanyManager] Migrating existing DB: ${dbToMigrate}`);

  // Extract company name from the existing DB
  let companyName = 'My Company';
  try {
    const Database = require('better-sqlite3');
    const oldDb = new Database(dbToMigrate, { readonly: true });
    try {
      const ps = oldDb.prepare("SELECT value FROM app_settings WHERE key = 'printSettings'").get();
      if (ps && ps.value) {
        const parsed = JSON.parse(ps.value);
        if (parsed.companyName && parsed.companyName !== 'My Company') {
          companyName = parsed.companyName;
        }
      }
    } catch (_) {}
    oldDb.close();
  } catch (_) {}

  // Create master_index.db
  getMasterDb();

  const slug = slugify(companyName);
  const companiesDir = getCompaniesDir();
  const targetPath = path.join(companiesDir, `${slug}.db`);

  // Copy (not move, to keep original as backup)
  fs.copyFileSync(dbToMigrate, targetPath);
  // Also copy WAL/SHM if they exist
  if (fs.existsSync(dbToMigrate + '-wal')) fs.copyFileSync(dbToMigrate + '-wal', targetPath + '-wal');
  if (fs.existsSync(dbToMigrate + '-shm')) fs.copyFileSync(dbToMigrate + '-shm', targetPath + '-shm');

  // WAL checkpoint the copied file
  try {
    const Database = require('better-sqlite3');
    const copiedDb = new Database(targetPath);
    copiedDb.pragma('wal_checkpoint(TRUNCATE)');

    // Add company_settings table
    copiedDb.exec(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        company_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    copiedDb.prepare(
      "INSERT OR REPLACE INTO company_settings (id, company_name) VALUES ('default', ?)"
    ).run(companyName);

    // Ensure force_password_change column exists
    try {
      copiedDb.exec('ALTER TABLE users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0');
    } catch (_) {}

    copiedDb.close();
  } catch (e) {
    console.warn('[CompanyManager] Migration WAL checkpoint failed:', e.message);
  }

  // Remove copied WAL/SHM after checkpoint
  try { if (fs.existsSync(targetPath + '-wal')) fs.unlinkSync(targetPath + '-wal'); } catch (_) {}
  try { if (fs.existsSync(targetPath + '-shm')) fs.unlinkSync(targetPath + '-shm'); } catch (_) {}

  // Register in master_index
  const companyId = generateId();
  const db = getMasterDb();
  db.prepare(
    "INSERT INTO companies (id, company_name, slug, db_file_path, created_at, last_opened_at, schema_version) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 13)"
  ).run(companyId, companyName, slug, targetPath);

  console.log(`[CompanyManager] Migrated "${companyName}" → ${targetPath}`);
  return companyId;
}

// ---------------------------------------------------------------------------
// User CRUD (operates on the active company DB via sqliteBridge)
// ---------------------------------------------------------------------------

function listUsers() {
  const d = sqliteBridge?.getDb();
  if (!d) return { ok: false, error: 'No database open.' };
  try {
    const rows = d.prepare(
      "SELECT id, username, name, role, email, is_active, force_password_change, created_at, updated_at FROM users WHERE is_active = 1 ORDER BY username"
    ).all();
    return { ok: true, users: rows };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function createUser(data) {
  const d = sqliteBridge?.getDb();
  if (!d) return { ok: false, error: 'No database open.' };
  if (!data || !data.username || !data.name || !data.role) {
    return { ok: false, error: 'Username, name, and role are required.' };
  }

  try {
    // Check for duplicate username
    const existing = d.prepare(
      "SELECT id FROM users WHERE username = ? AND is_active = 1"
    ).get(data.username);
    if (existing) return { ok: false, error: 'Username already exists.' };

    const userId = generateId();
    const hashedPassword = data.password ? hashPassword(data.password) : null;
    const forceChange = data.password ? 0 : 1;

    d.prepare(
      `INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active, force_password_change, created_at, updated_at)
       VALUES (?, 'local', ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`
    ).run(userId, data.username, data.name, data.role, hashedPassword, data.email || null, forceChange);

    return { ok: true, userId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function updateUser(userId, data) {
  const d = sqliteBridge?.getDb();
  if (!d) return { ok: false, error: 'No database open.' };
  if (!userId || !data) return { ok: false, error: 'User ID and data are required.' };

  try {
    const user = d.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) return { ok: false, error: 'User not found.' };

    // Check for duplicate username (exclude current user)
    if (data.username) {
      const dup = d.prepare(
        "SELECT id FROM users WHERE username = ? AND id != ? AND is_active = 1"
      ).get(data.username, userId);
      if (dup) return { ok: false, error: 'Username already exists.' };
    }

    if (data.password) {
      const hashedPassword = hashPassword(data.password);
      d.prepare(
        "UPDATE users SET username = ?, name = ?, email = ?, role = ?, password = ?, force_password_change = 0, updated_at = datetime('now') WHERE id = ?"
      ).run(data.username, data.name, data.email || null, data.role, hashedPassword, userId);
    } else {
      d.prepare(
        "UPDATE users SET username = ?, name = ?, email = ?, role = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(data.username, data.name, data.email || null, data.role, userId);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function deleteUser(userId) {
  const d = sqliteBridge?.getDb();
  if (!d) return { ok: false, error: 'No database open.' };

  try {
    // Soft-delete: set is_active = 0
    d.prepare("UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(userId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function resetUserPassword(userId) {
  const d = sqliteBridge?.getDb();
  if (!d) return { ok: false, error: 'No database open.' };

  try {
    d.prepare(
      "UPDATE users SET password = NULL, force_password_change = 1, updated_at = datetime('now') WHERE id = ?"
    ).run(userId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Close active company (without switch — for "New Company" flow from settings)
// ---------------------------------------------------------------------------

function closeCompanyForCreation() {
  if (sqliteBridge) {
    sqliteBridge.close();
  }
  activeCompanyId = null;
  activeCompanyInfo = null;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// IPC Registration
// ---------------------------------------------------------------------------

function setupHandlers(bridge) {
  sqliteBridge = bridge;

  ipcMain.handle('company:list', () => {
    try { return { ok: true, companies: listCompanies() }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('company:create', (_event, companyName) => {
    return createCompany(companyName);
  });

  ipcMain.handle('company:open', (_event, companyId) => {
    return openCompany(companyId);
  });

  ipcMain.handle('company:getActive', () => {
    const active = getActiveCompany();
    return { ok: true, company: active };
  });

  ipcMain.handle('company:delete', (_event, companyId) => {
    return deleteCompany(companyId);
  });

  ipcMain.handle('company:checkCredentials', (_event, companyId) => {
    return checkCredentials(companyId);
  });

  ipcMain.handle('company:login', (_event, companyId, username, password) => {
    return loginToCompany(companyId, username, password);
  });

  ipcMain.handle('company:setPassword', (_event, companyId, userId, newPassword) => {
    return setUserPassword(companyId, userId, newPassword);
  });

  ipcMain.handle('company:prepareForBackup', (_event, companyId) => {
    return prepareForBackup(companyId);
  });

  ipcMain.handle('company:backup', (_event, companyId) => {
    return backupCompany(companyId);
  });

  ipcMain.handle('company:listBackups', (_event, companyId) => {
    try { return { ok: true, backups: listBackups(companyId) }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('company:restore', (_event, backupFilePath) => {
    return restoreCompany(backupFilePath);
  });

  ipcMain.handle('company:selectBackupFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Backup File',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    return { ok: true, filePath: result.filePaths[0] };
  });

  ipcMain.handle('company:selectCompanyFile', () => selectCompanyFile());
  ipcMain.handle('company:openFile', (_event, filePath) => {
    try { return openCompanyByPath(filePath); }
    catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('company:getCompanyNameFromFile', (_event, filePath) => {
    try { return getCompanyNameFromFile(filePath); }
    catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('company:copyExternalWithNewName', (_event, sourceFilePath, newCompanyName) => {
    try { return copyExternalCompanyWithNewName(sourceFilePath, newCompanyName); }
    catch (err) { return { ok: false, error: err.message }; }
  });

  // User CRUD (operates on active company DB)
  ipcMain.handle('company:listUsers', () => listUsers());
  ipcMain.handle('company:createUser', (_event, data) => createUser(data));
  ipcMain.handle('company:updateUser', (_event, userId, data) => updateUser(userId, data));
  ipcMain.handle('company:deleteUser', (_event, userId) => deleteUser(userId));
  ipcMain.handle('company:resetPassword', (_event, userId) => resetUserPassword(userId));

  // Close active company for creating a new one from settings
  ipcMain.handle('company:closeForCreation', () => closeCompanyForCreation());
}

function closeMasterDb() {
  if (masterDb) {
    try { masterDb.close(); } catch (_) {}
    masterDb = null;
  }
}

module.exports = {
  setupHandlers,
  migrateExistingSingleDb,
  getActiveCompany,
  closeActiveCompany,
  closeMasterDb,
  getMasterDb,
  backupCompany,
  getCompanyById,
  hashPassword,
  verifyPassword,
};
