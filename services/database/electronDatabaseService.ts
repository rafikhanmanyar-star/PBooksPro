/**
 * Electron Database Service
 *
 * Uses native SQLite (better-sqlite3) via IPC when running in Electron.
 * Replaces sql.js entirely - single local DB, no OPFS/IndexedDB/localStorage.
 * Cloud remains PostgreSQL via API.
 */

import { CREATE_SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import type { SchemaHealthResult } from './schemaHealth';
import { logger } from '../logger';
import { isLocalOnlyMode } from '../../config/apiUrl';

declare global {
  interface Window {
    sqliteBridge?: {
      querySync: (sql: string, params?: unknown[]) => { ok: boolean; rows?: unknown[]; error?: string };
      runSync: (sql: string, params?: unknown[]) => { ok: boolean; error?: string; changes?: number; lastInsertRowid?: number };
      execSync: (sql: string) => { ok: boolean; error?: string };
      readDbBytesSync?: () => { ok: boolean; data?: number[] | null; error?: string };
      schemaHealth?: () => Promise<Record<string, unknown>>;
      isReadOnly?: () => Promise<boolean>;
      query: (sql: string, params?: unknown[]) => Promise<{ ok: boolean; rows?: unknown[]; error?: string }>;
      run: (sql: string, params?: unknown[]) => Promise<{ ok: boolean; error?: string; changes?: number; lastInsertRowid?: number }>;
      exec: (sql: string) => Promise<{ ok: boolean; error?: string }>;
      commitAllPending?: () => Promise<{ ok: boolean; error?: string }>;
      transaction: (operations: { type: 'query' | 'run'; sql: string; params?: unknown[] }[]) => Promise<{ ok: boolean; results?: unknown[]; error?: string }>;
    };
  }
}

function getBridge() {
  if (typeof window === 'undefined' || !window.sqliteBridge?.querySync) {
    throw new Error('SQLite bridge not available');
  }
  return window.sqliteBridge;
}

const NO_DB_OPEN = 'No database open';

/** Proxy for getDatabase() - maps db.run/exec to sync IPC. Invalidates service when bridge returns "No database open". */
function createDbProxy(service: ElectronDatabaseService) {
  return {
    run(sql: string, params: unknown[] = []) {
      const r = getBridge().runSync(sql, Array.isArray(params) ? params : [params]);
      if (!r.ok) {
        if (r.error?.includes(NO_DB_OPEN)) service.invalidateConnection();
        throw new Error(r.error || 'SQL run failed');
      }
    },
    exec(sql: string) {
      const r = getBridge().execSync(sql);
      if (!r.ok) {
        if (r.error?.includes(NO_DB_OPEN)) service.invalidateConnection();
        throw new Error(r.error || 'SQL exec failed');
      }
    },
    prepare(sql: string) {
      const params: unknown[] = [];
      let rows: Record<string, unknown>[] = [];
      let rowIndex = 0;
      return {
        bind(p: unknown[]) {
          params.length = 0;
          params.push(...(Array.isArray(p) ? p : [p]));
        },
        step() {
          if (rowIndex === 0) {
            const res = getBridge().querySync(sql, params);
            if (!res.ok) {
              if (res.error?.includes(NO_DB_OPEN)) service.invalidateConnection();
              throw new Error(res.error || 'Query failed');
            }
            rows = (res.rows || []) as Record<string, unknown>[];
          }
          return rowIndex < rows.length ? (rowIndex++, true) : false;
        },
        getAsObject() {
          return rows[rowIndex - 1] || {};
        },
        free() { },
      };
    },
    export: () => {
      throw new Error('export() not supported for native SQLite - data is already on disk');
    },
    close() {
      // No-op - bridge manages connection
    },
  };
}

export interface DatabaseConfig {
  autoSave?: boolean;
  saveInterval?: number;
}

export class ElectronDatabaseService {
  private config: DatabaseConfig;
  private isInitialized = false;
  private initializationError: Error | null = null;
  private initializationPromise: Promise<void> | null = null;
  private inTransaction = false;
  private dbProxy: ReturnType<typeof createDbProxy> | null = null;

  constructor(config: DatabaseConfig = {}) {
    this.config = {
      autoSave: config.autoSave ?? true,
      saveInterval: config.saveInterval ?? 10000,
    };
  }

  private rawQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const r = getBridge().querySync(sql, params);
    if (!r.ok) return [];
    return (r.rows || []) as T[];
  }

  private rawExecute(sql: string, params: unknown[] = []): void {
    const r = getBridge().runSync(sql, params);
    if (!r.ok) {
      const errMsg = r.error || '';
      if (!errMsg.toLowerCase().includes('duplicate column')) throw new Error(errMsg);
    }
  }

  /** Keep schema_meta in sync with metadata.schema_version (canonical version is SCHEMA_VERSION). */
  private syncSchemaMetaRow(): void {
    try {
      this.rawExecute(
        'INSERT OR REPLACE INTO schema_meta (id, version, last_updated) VALUES (1, ?, datetime(\'now\'))',
        [SCHEMA_VERSION]
      );
    } catch (_) {
      /* table may not exist on very old DB until main-process validator runs */
    }
  }

  async initialize(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;
    if (this.isInitialized) return;

    this.initializationPromise = this._doInitialize();
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async _doInitialize(): Promise<void> {
    try {
      getBridge();
      // Verify the native bridge actually works (catches NODE_MODULE_VERSION mismatches)
      const healthCheck = getBridge().execSync('SELECT 1');
      if (!healthCheck.ok) {
        const errMsg = healthCheck.error || 'Native SQLite bridge not functional';
        if (errMsg.includes(NO_DB_OPEN)) {
          // Multi-company mode: no company DB has been opened yet — this is expected.
          // Leave isInitialized=false so callers can retry after a company is opened.
          return;
        }
        throw new Error(errMsg);
      }
      this.dbProxy = createDbProxy(this);

      let currentVersion = 0;
      try {
        const rows = this.rawQuery<{ value: string }>('SELECT value FROM metadata WHERE key = ?', ['schema_version']);
        if (rows.length > 0) currentVersion = parseInt(rows[0].value || '0', 10);
      } catch (_) { }

      if (currentVersion < SCHEMA_VERSION) {
        this.isInitialized = true;
        this.ensureAllTablesExist();
        this.ensureContractColumnsExist();
        this.ensureVendorIdColumnsExist();
        this.ensureRecurringTemplateColumnsExist();
        this.ensureTransactionExtraColumnsExist();
        if (currentVersion < 7) await this.runV7Migrations();
        if (currentVersion < 8) await this.runV8Migrations();
        if (currentVersion < 9) await this.runV9Migrations();
        // V10 migrations handle migration from versions 9, 10, and 11 to version 12+
        // Versions 10 and 11 don't have separate migrations - they use V10 migrations
        if (currentVersion < 12) await this.runV10Migrations();
        if (currentVersion < 14) {
          try {
            const catCols = this.rawQuery<{ name: string }>('PRAGMA table_info(categories)');
            const catNames = new Set(catCols.map(c => c.name));
            if (!catNames.has('is_hidden')) {
              this.rawExecute('ALTER TABLE categories ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
            }
          } catch (_) { }
        }
        this.rawExecute(
          'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
          ['schema_version', SCHEMA_VERSION.toString()]
        );
        this.syncSchemaMetaRow();
        this.isInitialized = false;
      }

      this.isInitialized = true;
      this.initializationError = null;
      this.ensureAllTablesExist();
      this.ensureTransactionExtraColumnsExist();
      this.repairRentalAgreementsOrgIdToTenantId();
      this.normalizeLocalOnlyTenantIds();
      this.syncSchemaMetaRow();
      logger.logCategory('database', '✅ Native SQLite initialized');
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      this.isInitialized = false;
      logger.errorCategory('database', '❌ Native SQLite init failed:', this.initializationError);
      throw this.initializationError;
    }
  }

  private async runV7Migrations(): Promise<void> {
    const entityTables = [
      'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
      'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
      'quotations', 'plan_amenities', 'installment_plans', 'documents',
      'rental_agreements', 'project_agreements', 'sales_returns', 'project_received_assets', 'contracts',
      'recurring_invoice_templates', 'pm_cycle_allocations', 'purchase_orders',
      'personal_categories', 'personal_transactions',
    ];
    for (const table of entityTables) {
      try {
        const cols = this.rawQuery<{ name: string }>(`PRAGMA table_info(${table})`);
        const names = new Set(cols.map(c => c.name));
        if (!names.has('version')) this.rawExecute(`ALTER TABLE ${table} ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
        if (!names.has('deleted_at')) this.rawExecute(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
      } catch (_) { }
    }
  }

  private async runV8Migrations(): Promise<void> {
    // v8: (no longer adds org_id to rental_agreements; we use tenant_id everywhere)
  }

  private async runV9Migrations(): Promise<void> {
    // v9: tenants stub, users columns, installment_plans marketing columns, whatsapp_menu_sessions (PostgreSQL-aligned)
    try {
      this.rawExecute(
        `CREATE TABLE IF NOT EXISTS tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      );
      this.rawExecute(
        `CREATE TABLE IF NOT EXISTS whatsapp_menu_sessions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT '',
          phone_number TEXT NOT NULL,
          current_menu_path TEXT NOT NULL DEFAULT 'root',
          last_interaction_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(tenant_id, phone_number)
        )`
      );
      try {
        this.rawExecute('CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_tenant_phone ON whatsapp_menu_sessions(tenant_id, phone_number)');
        this.rawExecute('CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_last_interaction ON whatsapp_menu_sessions(tenant_id, last_interaction_at)');
      } catch (_) { }

      const userCols = this.rawQuery<{ name: string }>('PRAGMA table_info(users)');
      const userNames = new Set(userCols.map(c => c.name));
      if (!userNames.has('tenant_id')) this.rawExecute('ALTER TABLE users ADD COLUMN tenant_id TEXT NOT NULL DEFAULT ""');
      if (!userNames.has('email')) this.rawExecute('ALTER TABLE users ADD COLUMN email TEXT');
      if (!userNames.has('is_active')) this.rawExecute('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
      if (!userNames.has('login_status')) this.rawExecute('ALTER TABLE users ADD COLUMN login_status INTEGER NOT NULL DEFAULT 0');

      const ipCols = this.rawQuery<{ name: string }>('PRAGMA table_info(installment_plans)');
      const ipNames = new Set(ipCols.map(c => c.name));
      const ipColumns = [
        'duration_years INTEGER', 'down_payment_percentage REAL DEFAULT 0', 'frequency TEXT', 'list_price REAL DEFAULT 0',
        'customer_discount REAL DEFAULT 0', 'floor_discount REAL DEFAULT 0', 'lump_sum_discount REAL DEFAULT 0', 'misc_discount REAL DEFAULT 0',
        'down_payment_amount REAL DEFAULT 0', 'installment_amount REAL DEFAULT 0', 'total_installments INTEGER', 'description TEXT', 'user_id TEXT',
        'intro_text TEXT', 'root_id TEXT', 'approval_requested_by TEXT', 'approval_requested_to TEXT', 'approval_requested_at TEXT',
        'approval_reviewed_by TEXT', 'approval_reviewed_at TEXT', 'discounts TEXT', 'customer_discount_category_id TEXT',
        'floor_discount_category_id TEXT', 'lump_sum_discount_category_id TEXT', 'misc_discount_category_id TEXT',
        'selected_amenities TEXT', 'amenities_total REAL DEFAULT 0', 'updated_at TEXT'
      ];
      for (const colDef of ipColumns) {
        const colName = colDef.split(' ')[0];
        if (!ipNames.has(colName)) {
          try {
            this.rawExecute(`ALTER TABLE installment_plans ADD COLUMN ${colDef}`);
          } catch (_) { }
        }
      }
    } catch (_) { }
  }

  /** v10: Migrate org_id into tenant_id and drop org_id (tenant_id already exists in table). */
  private async runV10Migrations(): Promise<void> {
    try {
      const raCols = this.rawQuery<{ name: string }>('PRAGMA table_info(rental_agreements)');
      if (raCols.length === 0) return;
      const raNames = new Set(raCols.map(c => c.name));
      if (!raNames.has('org_id')) return;
      // Copy org_id into tenant_id, then drop org_id
      this.rawExecute("UPDATE rental_agreements SET tenant_id = org_id WHERE (tenant_id IS NULL OR tenant_id = '') AND org_id IS NOT NULL AND org_id != ''");
      try {
        this.rawExecute('ALTER TABLE rental_agreements DROP COLUMN org_id');
      } catch (_) {
        // SQLite < 3.35 does not support DROP COLUMN; column remains but we use tenant_id for all reads/writes
      }
    } catch (_) { }
  }

  /** One-time repair: if rental_agreements still has org_id, copy to tenant_id and drop org_id. Runs every startup until done. */
  private repairRentalAgreementsOrgIdToTenantId(): void {
    try {
      const raCols = this.rawQuery<{ name: string }>('PRAGMA table_info(rental_agreements)');
      if (raCols.length === 0) return;
      const raNames = new Set(raCols.map(c => c.name));
      if (!raNames.has('org_id')) return;
      if (!raNames.has('tenant_id')) return;
      this.rawExecute("UPDATE rental_agreements SET tenant_id = org_id WHERE (tenant_id IS NULL OR tenant_id = '') AND org_id IS NOT NULL AND org_id != ''");
      try {
        this.rawExecute('ALTER TABLE rental_agreements DROP COLUMN org_id');
        logger.logCategory('database', '✅ rental_agreements: migrated org_id → tenant_id and dropped org_id');
      } catch (_) {
        this.recreateRentalAgreementsWithoutOrgId();
      }
    } catch (_) { }
  }

  private recreateRentalAgreementsWithoutOrgId(): void {
    try {
      this.rawExecute('PRAGMA foreign_keys = OFF');
      this.rawExecute(`CREATE TABLE IF NOT EXISTS rental_agreements_new (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT '',
          agreement_number TEXT NOT NULL,
          contact_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          monthly_rent REAL NOT NULL,
          rent_due_date INTEGER,
          status TEXT NOT NULL,
          description TEXT,
          security_deposit REAL,
          broker_id TEXT,
          broker_fee REAL,
          owner_id TEXT,
          previous_agreement_id TEXT,
          user_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT,
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
          FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT,
          UNIQUE(tenant_id, agreement_number)
      )`);
      this.rawExecute(`INSERT INTO rental_agreements_new
          (id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date,
           monthly_rent, rent_due_date, status, description, security_deposit, broker_id,
           broker_fee, owner_id, previous_agreement_id, user_id, created_at, updated_at, version, deleted_at)
          SELECT id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date,
           monthly_rent, rent_due_date, status, description, security_deposit, broker_id,
           broker_fee, owner_id, previous_agreement_id, user_id, created_at, updated_at, version, deleted_at
          FROM rental_agreements`);
      this.rawExecute('DROP TABLE rental_agreements');
      this.rawExecute('ALTER TABLE rental_agreements_new RENAME TO rental_agreements');
      this.rawExecute('PRAGMA foreign_keys = ON');
      logger.logCategory('database', '✅ rental_agreements: recreated table without org_id');
    } catch (e) {
      logger.warnCategory('database', 'rental_agreements: table recreation failed:', e);
      this.rawExecute('PRAGMA foreign_keys = ON');
    }
  }

  private normalizeLocalOnlyTenantIds(): void {
    if (!isLocalOnlyMode()) return;
    const tables = [
      'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
      'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
      'quotations', 'plan_amenities', 'installment_plans', 'documents',
      'rental_agreements', 'project_agreements', 'sales_returns', 'project_received_assets', 'contracts',
      'recurring_invoice_templates', 'pm_cycle_allocations', 'users',
      'journal_entries', 'journal_reversals', 'accounting_audit_log',
    ];
    let tablesUpdated = 0;
    for (const table of tables) {
      try {
        const exists = this.rawQuery<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]
        );
        if (exists.length === 0) continue;
        const cols = this.rawQuery<{ name: string }>(`PRAGMA table_info(${table})`);
        if (!cols.some(c => c.name === 'tenant_id')) continue;
        const nonLocal = this.rawQuery<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM ${table} WHERE tenant_id != 'local'`
        );
        if ((nonLocal[0]?.cnt ?? 0) > 0) {
          // Use UPDATE OR IGNORE to skip rows that would violate UNIQUE constraints
          // (can happen when the backup had multiple tenants with overlapping record numbers).
          try {
            this.rawExecute(`UPDATE OR IGNORE ${table} SET tenant_id = 'local' WHERE tenant_id != 'local'`);
          } catch (_) {
            this.rawExecute(`UPDATE ${table} SET tenant_id = 'local' WHERE tenant_id != 'local'`);
          }
          // Drop leftover duplicate rows from other tenants (their 'local' counterpart now exists)
          try { this.rawExecute(`DELETE FROM ${table} WHERE tenant_id != 'local'`); } catch (_) { }
          tablesUpdated++;
        }
      } catch (_) { }
    }
    if (tablesUpdated > 0) {
      logger.logCategory('database', `Normalized tenant_id to 'local' in ${tablesUpdated} table(s)`);
    }
  }

  ensureAllTablesExist(): void {
    try {
      // Migrate old tables first: add missing columns before creating indexes on them
      this.migrateOldTablesForSchema();
      // Strip SQL comments (may contain semicolons) before splitting into statements
      const stripped = CREATE_SCHEMA_SQL.replace(/--[^\n]*/g, '');
      const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          getBridge().execSync(stmt + ';');
        } catch (_) { /* expected for existing objects */ }
      }
    } catch (e) {
      logger.warnCategory('database', 'ensureAllTablesExist:', e);
    }
  }

  private migrateOldTablesForSchema(): void {
    const entityTables = [
      'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
      'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
      'quotations', 'plan_amenities', 'installment_plans', 'documents',
      'rental_agreements', 'project_agreements', 'sales_returns', 'project_received_assets', 'contracts',
      'recurring_invoice_templates', 'pm_cycle_allocations', 'purchase_orders',
      'transaction_log', 'error_log', 'app_settings', 'license_settings',
      'chat_messages', 'project_agreement_units', 'contract_categories',
      'users', 'sync_outbox', 'sync_metadata',
    ];

    const requiredColumns: [string, string][] = [
      ['tenant_id', "TEXT NOT NULL DEFAULT ''"],
      ['version', 'INTEGER NOT NULL DEFAULT 1'],
      ['deleted_at', 'TEXT'],
      ['user_id', 'TEXT'],
      ['updated_at', "TEXT DEFAULT ''"],
    ];

    for (const table of entityTables) {
      try {
        const cols = this.rawQuery<{ name: string }>(`PRAGMA table_info("${table}")`);
        if (cols.length === 0) continue;
        const existingCols = new Set(cols.map(c => c.name));

        for (const [colName, colDef] of requiredColumns) {
          if (!existingCols.has(colName)) {
            try { this.rawExecute(`ALTER TABLE "${table}" ADD COLUMN ${colName} ${colDef}`); } catch (_) { }
          }
        }
      } catch (_) { }
    }
  }

  private ensureContractColumnsExist(): void {
    if (!this.isInitialized && !this.dbProxy) return;
    try {
      const hasContracts = this.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'").length > 0;
      if (hasContracts) {
        const cols = new Set(this.query<{ name: string }>('PRAGMA table_info(contracts)').map(c => c.name));
        if (!cols.has('expense_category_items')) this.execute('ALTER TABLE contracts ADD COLUMN expense_category_items TEXT');
        if (!cols.has('payment_terms')) this.execute('ALTER TABLE contracts ADD COLUMN payment_terms TEXT');
        if (!cols.has('status')) {
          this.execute("ALTER TABLE contracts ADD COLUMN status TEXT DEFAULT 'Active'");
          this.execute("UPDATE contracts SET status = 'Active' WHERE status IS NULL");
        }
      }
      const hasBills = this.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='bills'").length > 0;
      if (hasBills) {
        const cols = new Set(this.query<{ name: string }>('PRAGMA table_info(bills)').map(c => c.name));
        if (!cols.has('expense_category_items')) this.execute('ALTER TABLE bills ADD COLUMN expense_category_items TEXT');
        if (!cols.has('status')) {
          this.execute("ALTER TABLE bills ADD COLUMN status TEXT DEFAULT 'Unpaid'");
          this.execute(`UPDATE bills SET status = CASE WHEN paid_amount = 0 THEN 'Unpaid' WHEN paid_amount >= amount THEN 'Paid' WHEN paid_amount > 0 THEN 'Partially Paid' ELSE 'Unpaid' END WHERE status IS NULL`);
        }
      }

      // Ensure missing columns on all entity tables (mirrors databaseService.ensureContractColumnsExist)
      const tableColumns: Record<string, [string, string][]> = {
        rental_agreements: [
          ['broker_fee', 'REAL'],
          ['owner_id', 'TEXT'],
          ['updated_at', "TEXT DEFAULT ''"],
        ],
        accounts: [
          ['description', 'TEXT'],
          ['user_id', 'TEXT'],
          ['updated_at', "TEXT DEFAULT ''"],
        ],
        projects: [
          ['description', 'TEXT'],
          ['color', 'TEXT'],
          ['pm_config', 'TEXT'],
          ['installment_config', 'TEXT'],
          ['user_id', 'TEXT'],
          ['updated_at', "TEXT DEFAULT ''"],
        ],
        buildings: [
          ['description', 'TEXT'],
          ['color', 'TEXT'],
          ['updated_at', "TEXT DEFAULT ''"],
        ],
        properties: [
          ['description', 'TEXT'],
          ['monthly_service_charge', 'REAL'],
          ['updated_at', "TEXT DEFAULT ''"],
        ],
        units: [
          ['sale_price', 'REAL'],
          ['description', 'TEXT'],
          ['type', 'TEXT'],
          ['area', 'REAL'],
          ['floor', 'TEXT'],
          ['user_id', 'TEXT'],
          ['updated_at', "TEXT DEFAULT ''"],
        ],
        project_agreements: [
          ['unit_ids', 'TEXT'],
          ['list_price', 'REAL'],
          ['customer_discount', 'REAL'],
          ['floor_discount', 'REAL'],
          ['lump_sum_discount', 'REAL'],
          ['misc_discount', 'REAL'],
          ['rebate_amount', 'REAL'],
          ['rebate_broker_id', 'TEXT'],
          ['issue_date', 'TEXT'],
          ['description', 'TEXT'],
          ['cancellation_details', 'TEXT'],
          ['list_price_category_id', 'TEXT'],
          ['customer_discount_category_id', 'TEXT'],
          ['floor_discount_category_id', 'TEXT'],
          ['lump_sum_discount_category_id', 'TEXT'],
          ['misc_discount_category_id', 'TEXT'],
          ['selling_price_category_id', 'TEXT'],
          ['rebate_category_id', 'TEXT'],
          ['user_id', 'TEXT'],
          ['updated_at', "TEXT DEFAULT ''"],
        ],
      };

      for (const [tableName, columns] of Object.entries(tableColumns)) {
        const tableExists = this.query<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
        ).length > 0;
        if (!tableExists) continue;

        const existingCols = new Set(
          this.query<{ name: string }>(`PRAGMA table_info(${tableName})`).map(c => c.name)
        );

        for (const [colName, colType] of columns) {
          if (!existingCols.has(colName)) {
            try { this.execute(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`); } catch (_) { }
          }
        }
      }
    } catch (_) { }
  }

  private ensureVendorIdColumnsExist(): void {
    try {
      const tables = ['bills', 'invoices', 'transactions'];
      for (const table of tables) {
        const cols = this.rawQuery<{ name: string }>(`PRAGMA table_info(${table})`);
        if (cols.length > 0 && !cols.some(c => c.name === 'vendor_id')) {
          this.rawExecute(`ALTER TABLE ${table} ADD COLUMN vendor_id TEXT REFERENCES vendors(id)`);
        }
      }
    } catch (_) { }
  }

  private ensureRecurringTemplateColumnsExist(): void {
    try {
      const cols = this.rawQuery<{ name: string }>('PRAGMA table_info(recurring_invoice_templates)');
      if (cols.length > 0 && !cols.some(c => c.name === 'invoice_type')) {
        this.rawExecute("ALTER TABLE recurring_invoice_templates ADD COLUMN invoice_type TEXT DEFAULT 'Rental'");
        this.rawExecute("UPDATE recurring_invoice_templates SET invoice_type = 'Rental' WHERE invoice_type IS NULL");
      }
    } catch (_) { }
  }

  /** Add building_id, is_system, updated_at to transactions if missing (no FK on building_id for sync order). */
  private ensureTransactionExtraColumnsExist(): void {
    try {
      const hasTable = this.rawQuery<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'").length > 0;
      if (!hasTable) return;
      const cols = new Set(this.rawQuery<{ name: string }>('PRAGMA table_info(transactions)').map(c => c.name));
      if (!cols.has('building_id')) this.rawExecute('ALTER TABLE transactions ADD COLUMN building_id TEXT');
      if (!cols.has('is_system')) this.rawExecute('ALTER TABLE transactions ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0');
      if (!cols.has('updated_at')) this.rawExecute("ALTER TABLE transactions ADD COLUMN updated_at TEXT DEFAULT ''");
      if (!cols.has('owner_id')) this.rawExecute('ALTER TABLE transactions ADD COLUMN owner_id TEXT');
    } catch (_) { }
  }

  getDatabase(): ReturnType<typeof createDbProxy> {
    if (!this.dbProxy || !this.isInitialized) throw new Error('Database not initialized');
    return this.dbProxy;
  }

  /**
   * Call when the bridge returns "No database open" so the next operation re-initializes.
   * (e.g. company was closed or switched before a queued save ran.)
   */
  invalidateConnection(): void {
    this.isInitialized = false;
    this.dbProxy = null;
  }

  isReady(): boolean {
    return this.isInitialized && this.dbProxy !== null;
  }

  hasError(): boolean {
    return this.initializationError !== null;
  }

  getError(): Error | null {
    return this.initializationError;
  }

  isInTransaction(): boolean {
    return this.inTransaction;
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    if (!this.isReady()) return [];
    const r = getBridge().querySync(sql, params);
    if (!r.ok) {
      if (r.error?.includes(NO_DB_OPEN)) this.invalidateConnection();
      return [];
    }
    return (r.rows || []) as T[];
  }

  execute(sql: string, params: unknown[] = []): void {
    if (!this.isReady()) {
      throw new Error('Cannot execute SQL: database not ready (no company DB open or not initialized).');
    }
    const bridge = getBridge();
    const p = Array.isArray(params) ? params : [params];
    // When not in a transaction, temporarily disable FK checks for this statement to avoid
    // FOREIGN KEY constraint failed from stale refs or save order (e.g. single INSERT transaction).
    if (!this.inTransaction) {
      try {
        bridge.runSync('PRAGMA foreign_keys = OFF', []);
        const r = bridge.runSync(sql, p);
        if (!r.ok) {
          if (r.error?.includes(NO_DB_OPEN)) this.invalidateConnection();
          throw new Error(r.error || 'SQL execution failed');
        }
      } finally {
        bridge.runSync('PRAGMA foreign_keys = ON', []);
      }
    } else {
      const r = bridge.runSync(sql, p);
      if (!r.ok) {
        if (r.error?.includes(NO_DB_OPEN)) this.invalidateConnection();
        throw new Error(r.error || 'SQL execution failed');
      }
    }
  }

  transaction(operations: (() => void)[], onCommit?: () => void): void {
    if (!Array.isArray(operations) || operations.length === 0) return;
    const db = this.getDatabase();
    const startTime = Date.now();
    let committed = false;
    try {
      try {
        db.run('PRAGMA foreign_keys = OFF');
      } catch (e) {
        console.warn('[ElectronDatabaseService] Failed to disable foreign keys for transaction:', e);
      }

      db.run('BEGIN IMMEDIATE');
      this.inTransaction = true;

      for (let i = 0; i < operations.length; i++) {
        try {
          operations[i]();
        } catch (opError) {
          try { db.run('ROLLBACK'); } catch (_) { }
          try { db.run('PRAGMA foreign_keys = ON'); } catch (_) { }
          throw opError;
        }
      }

      db.run('COMMIT');
      committed = true;

      try {
        db.run('PRAGMA foreign_keys = ON');
      } catch (e) {
        console.warn('[ElectronDatabaseService] Failed to re-enable foreign keys after commit:', e);
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > 500) {
        console.warn(`[ElectronDatabaseService] Slow transaction: ${elapsed}ms`);
      }

      if (onCommit) {
        try { onCommit(); } catch (e) { console.error('Post-commit error:', e); }
      }
    } catch (error) {
      if (!committed) {
        try { db.run('ROLLBACK'); } catch (_) { }
        try { db.run('PRAGMA foreign_keys = ON'); } catch (_) { }
      }
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  /**
   * Async query -- uses ipcRenderer.invoke instead of sendSync so the renderer is not blocked.
   */
  async queryAsync<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.isReady()) return [];
    const bridge = getBridge();
    if (!bridge.query) return this.query<T>(sql, params);
    const r = await bridge.query(sql, params);
    if (!r.ok) {
      if (r.error?.includes(NO_DB_OPEN)) this.invalidateConnection();
      return [];
    }
    return (r.rows || []) as T[];
  }

  /**
   * Async execute -- uses ipcRenderer.invoke instead of sendSync so the renderer is not blocked.
   */
  async executeAsync(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.isReady()) {
      throw new Error('Cannot execute SQL: database not ready (no company DB open or not initialized).');
    }
    const bridge = getBridge();
    if (!bridge.run) { this.execute(sql, params); return; }
    const p = Array.isArray(params) ? params : [params];
    const r = await bridge.run(sql, p);
    if (!r.ok) {
      if (r.error?.includes(NO_DB_OPEN)) this.invalidateConnection();
      const errMsg = r.error || '';
      if (!errMsg.toLowerCase().includes('duplicate column')) throw new Error(errMsg);
    }
  }

  /**
   * Run a batch of SQL operations in a single transaction via async IPC.
   * This is the key performance method: the renderer is NOT blocked while the
   * main process executes potentially thousands of SQL statements.
   */
  async transactionAsync(operations: { type: 'query' | 'run'; sql: string; params?: unknown[] }[]): Promise<{ ok: boolean; results?: unknown[]; error?: string }> {
    if (!operations.length) return { ok: true, results: [] };
    const bridge = getBridge();
    if (!bridge.transaction) {
      this.transaction([() => {
        for (const op of operations) {
          if (op.type === 'query') this.query(op.sql, op.params);
          else this.execute(op.sql, op.params);
        }
      }]);
      return { ok: true };
    }
    const startTime = Date.now();
    const r = await bridge.transaction(operations);
    const elapsed = Date.now() - startTime;
    if (elapsed > 500) {
      console.warn(`[ElectronDatabaseService] Slow async transaction: ${elapsed}ms (${operations.length} ops)`);
    }
    if (!r.ok) {
      if (r.error?.includes(NO_DB_OPEN)) this.invalidateConnection();
      throw new Error(r.error || 'Async transaction failed');
    }
    return r;
  }

  save(): void {
    // No-op: native SQLite persists immediately
  }

  async saveAsync(): Promise<void> {
    // No-op
  }

  export(): Uint8Array {
    const r = getBridge().readDbBytesSync?.();
    if (!r || !r.ok) throw new Error(r?.error || 'Backup not supported');
    if (!r.data) return new Uint8Array(0);
    return new Uint8Array(r.data);
  }

  createBackup(): Uint8Array {
    return this.export();
  }

  import(_data: Uint8Array): void {
    throw new Error('import() not supported for native SQLite');
  }

  queryForTenant<T = unknown>(sql: string, params: unknown[], tenantId: string): T[] {
    if (!tenantId) throw new Error('SECURITY: queryForTenant called without tenantId');
    if (!sql.toLowerCase().includes('tenant_id')) throw new Error('SECURITY: Query missing tenant_id filter');
    return this.query<T>(sql, params);
  }

  executeForTenant(sql: string, params: unknown[], tenantId: string): void {
    if (!tenantId) throw new Error('SECURITY: executeForTenant called without tenantId');
    if (!sql.toLowerCase().includes('tenant_id')) throw new Error('SECURITY: Statement missing tenant_id filter');
    this.execute(sql, params);
  }

  clearTransactionData(tenantId?: string): void {
    const db = this.getDatabase();
    const tables = ['transactions', 'sales_returns', 'project_received_assets', 'pm_cycle_allocations', 'invoices', 'bills', 'quotations', 'recurring_invoice_templates', 'contracts', 'rental_agreements', 'project_agreements', 'accounts'];
    db.run('BEGIN IMMEDIATE');
    try {
      db.run('PRAGMA foreign_keys = OFF');
      for (const table of tables) {
        try {
          if (tenantId) db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
          else db.run(`DELETE FROM ${table}`);
        } catch (_) { }
      }
      if (!tenantId) {
        for (const table of tables) {
          try { db.run('DELETE FROM sqlite_sequence WHERE name = ?', [table]); } catch (_) { }
        }
      }
      db.run('PRAGMA foreign_keys = ON');
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  clearAllData(tenantId?: string): void {
    const db = this.getDatabase();
    const tables = ['users', 'accounts', 'contacts', 'categories', 'projects', 'buildings', 'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets', 'rental_agreements', 'project_agreements', 'sales_returns', 'project_received_assets', 'contracts', 'recurring_invoice_templates', 'transaction_log', 'error_log', 'app_settings', 'license_settings', 'project_agreement_units', 'contract_categories', 'pm_cycle_allocations'];
    db.run('BEGIN IMMEDIATE');
    try {
      db.run('PRAGMA foreign_keys = OFF');
      for (const table of tables) {
        try {
          if (tenantId) db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
          else db.run(`DELETE FROM ${table}`);
        } catch (_) { }
      }
      if (!tenantId) db.run('DELETE FROM sqlite_sequence');
      db.run('PRAGMA foreign_keys = ON');
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  getMetadata(key: string): string | null {
    if (!this.isReady()) return null;
    const rows = this.query<{ value: string }>('SELECT value FROM metadata WHERE key = ?', [key]);
    return rows.length > 0 ? rows[0].value : null;
  }

  setMetadata(key: string, value: string): void {
    if (!this.isReady()) {
      throw new Error('Cannot set metadata: database not ready.');
    }
    this.execute('INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))', [key, value]);
  }

  /** Flush WAL to the main DB file (Electron IPC). Call after critical saves / before shutdown. */
  async commitAllPendingToDisk(): Promise<{ ok: boolean; error?: string }> {
    try {
      const bridge = getBridge();
      if (typeof bridge.commitAllPending === 'function') {
        return await bridge.commitAllPending();
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  stopAutoSave(): void { }

  close(): void {
    this.dbProxy = null;
    this.isInitialized = false;
  }

  getSize(): number {
    return 0; // Native file - size not easily available from renderer
  }

  getStorageMode(): 'opfs' | 'localStorage' {
    return 'opfs'; // Native file is like OPFS
  }

  async getSchemaHealth(): Promise<SchemaHealthResult | null> {
    try {
      const fn = window.sqliteBridge?.schemaHealth;
      if (!fn) return null;
      return (await fn()) as SchemaHealthResult;
    } catch {
      return null;
    }
  }
}

export function isElectronWithNativeDb(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { sqliteBridge?: { querySync?: unknown } }).sqliteBridge?.querySync;
}
