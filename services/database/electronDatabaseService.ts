/**
 * Electron Database Service
 *
 * Uses native SQLite (better-sqlite3) via IPC when running in Electron.
 * Replaces sql.js entirely - single local DB, no OPFS/IndexedDB/localStorage.
 * Cloud remains PostgreSQL via API.
 */

import { CREATE_SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import { logger } from '../logger';

declare global {
  interface Window {
    sqliteBridge?: {
      querySync: (sql: string, params?: unknown[]) => { ok: boolean; rows?: unknown[]; error?: string };
      runSync: (sql: string, params?: unknown[]) => { ok: boolean; error?: string; changes?: number; lastInsertRowid?: number };
      execSync: (sql: string) => { ok: boolean; error?: string };
      readDbBytesSync?: () => { ok: boolean; data?: number[] | null; error?: string };
    };
  }
}

function getBridge() {
  if (typeof window === 'undefined' || !window.sqliteBridge?.querySync) {
    throw new Error('SQLite bridge not available');
  }
  return window.sqliteBridge;
}

/** Proxy for getDatabase() - maps db.run/exec to sync IPC */
function createDbProxy() {
  return {
    run(sql: string, params: unknown[] = []) {
      const r = getBridge().runSync(sql, Array.isArray(params) ? params : [params]);
      if (!r.ok) throw new Error(r.error || 'SQL run failed');
    },
    exec(sql: string) {
      const r = getBridge().execSync(sql);
      if (!r.ok) throw new Error(r.error || 'SQL exec failed');
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
            if (!res.ok) throw new Error(res.error || 'Query failed');
            rows = (res.rows || []) as Record<string, unknown>[];
          }
          return rowIndex < rows.length ? (rowIndex++, true) : false;
        },
        getAsObject() {
          return rows[rowIndex - 1] || {};
        },
        free() {},
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
      this.dbProxy = createDbProxy();

      let currentVersion = 0;
      try {
        const rows = this.rawQuery<{ value: string }>('SELECT value FROM metadata WHERE key = ?', ['schema_version']);
        if (rows.length > 0) currentVersion = parseInt(rows[0].value || '0', 10);
      } catch (_) {}

      if (currentVersion < SCHEMA_VERSION) {
        this.isInitialized = true;
        try {
          const { migrateTenantColumns } = await import('./tenantMigration');
          migrateTenantColumns();
        } catch (_) {}
        this.ensureAllTablesExist();
        this.ensureContractColumnsExist();
        this.ensureVendorIdColumnsExist();
        this.ensureRecurringTemplateColumnsExist();
        if (currentVersion < 7) await this.runV7Migrations();
        if (currentVersion < 8) await this.runV8Migrations();
        if (currentVersion < 9) await this.runV9Migrations();
        this.rawExecute(
          'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime("now"))',
          ['schema_version', SCHEMA_VERSION.toString()]
        );
        this.isInitialized = false;
      }

      this.isInitialized = true;
      this.initializationError = null;
      this.ensureAllTablesExist();
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
      'rental_agreements', 'project_agreements', 'sales_returns', 'contracts',
      'recurring_invoice_templates', 'pm_cycle_allocations', 'purchase_orders',
    ];
    for (const table of entityTables) {
      try {
        const cols = this.rawQuery<{ name: string }>(`PRAGMA table_info(${table})`);
        const names = new Set(cols.map(c => c.name));
        if (!names.has('version')) this.rawExecute(`ALTER TABLE ${table} ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
        if (!names.has('deleted_at')) this.rawExecute(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
      } catch (_) {}
    }
  }

  private async runV8Migrations(): Promise<void> {
    // v8: rental_agreements uses org_id (PostgreSQL-aligned). Add org_id if table has tenant_id.
    try {
      const raCols = this.rawQuery<{ name: string }>('PRAGMA table_info(rental_agreements)');
      const raNames = new Set(raCols.map(c => c.name));
      if (!raNames.has('org_id') && raNames.has('tenant_id')) {
        this.rawExecute('ALTER TABLE rental_agreements ADD COLUMN org_id TEXT NOT NULL DEFAULT ""');
        this.rawExecute('UPDATE rental_agreements SET org_id = tenant_id WHERE tenant_id IS NOT NULL AND tenant_id != ""');
      }
    } catch (_) {}
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
      } catch (_) {}

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
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  ensureAllTablesExist(): void {
    try {
      getBridge().execSync(CREATE_SCHEMA_SQL);
    } catch (e) {
      logger.warnCategory('database', 'ensureAllTablesExist:', e);
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
    } catch (_) {}
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
    } catch (_) {}
  }

  private ensureRecurringTemplateColumnsExist(): void {
    try {
      const cols = this.rawQuery<{ name: string }>('PRAGMA table_info(recurring_invoice_templates)');
      if (cols.length > 0 && !cols.some(c => c.name === 'invoice_type')) {
        this.rawExecute("ALTER TABLE recurring_invoice_templates ADD COLUMN invoice_type TEXT DEFAULT 'Rental'");
        this.rawExecute("UPDATE recurring_invoice_templates SET invoice_type = 'Rental' WHERE invoice_type IS NULL");
      }
    } catch (_) {}
  }

  getDatabase(): ReturnType<typeof createDbProxy> {
    if (!this.dbProxy || !this.isInitialized) throw new Error('Database not initialized');
    return this.dbProxy;
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
    if (!r.ok) return [];
    return (r.rows || []) as T[];
  }

  execute(sql: string, params: unknown[] = []): void {
    if (!this.isReady()) return;
    const r = getBridge().runSync(sql, Array.isArray(params) ? params : [params]);
    if (!r.ok) throw new Error(r.error || 'SQL execution failed');
  }

  transaction(operations: (() => void)[], onCommit?: () => void): void {
    if (!Array.isArray(operations) || operations.length === 0) return;
    const db = this.getDatabase();
    let committed = false;
    try {
      db.run('BEGIN TRANSACTION');
      this.inTransaction = true;
      for (let i = 0; i < operations.length; i++) {
        try {
          operations[i]();
        } catch (opError) {
          import('./repositories/baseRepository').then(m => m.BaseRepository.clearPendingSyncOperations()).catch(() => {});
          try { db.run('ROLLBACK'); } catch (_) {}
          throw opError;
        }
      }
      db.run('COMMIT');
      committed = true;
      if (onCommit) {
        try { onCommit(); } catch (e) { console.error('Post-commit error:', e); }
      }
    } catch (error) {
      if (!committed) {
        import('./repositories/baseRepository').then(m => m.BaseRepository.clearPendingSyncOperations()).catch(() => {});
        try { db.run('ROLLBACK'); } catch (_) {}
      }
      throw error;
    } finally {
      this.inTransaction = false;
    }
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
    const tables = ['transactions', 'sales_returns', 'pm_cycle_allocations', 'invoices', 'bills', 'quotations', 'recurring_invoice_templates', 'contracts', 'rental_agreements', 'project_agreements', 'accounts'];
    db.run('BEGIN TRANSACTION');
    try {
      db.run('PRAGMA foreign_keys = OFF');
      for (const table of tables) {
        try {
          if (tenantId) db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
          else db.run(`DELETE FROM ${table}`);
        } catch (_) {}
      }
      if (!tenantId) {
        for (const table of tables) {
          try { db.run('DELETE FROM sqlite_sequence WHERE name = ?', [table]); } catch (_) {}
        }
      }
      db.run('PRAGMA foreign_keys = ON');
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  clearPosData(tenantId?: string): void {
    const db = this.getDatabase();
    const tables = ['shop_sale_items', 'shop_sales', 'shop_inventory_movements', 'shop_inventory', 'shop_loyalty_members', 'shop_products', 'shop_terminals', 'shop_warehouses', 'shop_branches', 'shop_policies'];
    db.run('BEGIN TRANSACTION');
    try {
      db.run('PRAGMA foreign_keys = OFF');
      for (const table of tables) {
        try {
          if (tenantId) db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
          else db.run(`DELETE FROM ${table}`);
        } catch (_) {}
      }
      if (!tenantId) {
        for (const table of tables) {
          try { db.run('DELETE FROM sqlite_sequence WHERE name = ?', [table]); } catch (_) {}
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
    const tables = ['users', 'accounts', 'contacts', 'categories', 'projects', 'buildings', 'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets', 'rental_agreements', 'project_agreements', 'sales_returns', 'contracts', 'recurring_invoice_templates', 'transaction_log', 'error_log', 'app_settings', 'license_settings', 'project_agreement_units', 'contract_categories', 'pm_cycle_allocations'];
    db.run('BEGIN TRANSACTION');
    try {
      db.run('PRAGMA foreign_keys = OFF');
      for (const table of tables) {
        try {
          if (tenantId) db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
          else db.run(`DELETE FROM ${table}`);
        } catch (_) {}
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
    if (!this.isReady()) return;
    this.execute('INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime("now"))', [key, value]);
  }

  stopAutoSave(): void {}

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
}

export function isElectronWithNativeDb(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { sqliteBridge?: { querySync?: unknown } }).sqliteBridge?.querySync;
}
