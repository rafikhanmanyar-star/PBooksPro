import type pg from 'pg';
import { getPool } from '../../../db/pool.js';

export class AdminTenantRepository {
  private pool = () => getPool();

  async listTenants(filters: {
    status?: string;
    licenseType?: string;
    search?: string;
  }): Promise<unknown[]> {
    let query = 'SELECT * FROM tenants WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      query += ` AND license_status = $${paramIndex++}`;
      params.push(filters.status);
    }
    if (filters.licenseType) {
      query += ` AND license_type = $${paramIndex++}`;
      params.push(filters.licenseType);
    }
    if (filters.search) {
      query += ` AND (name ILIKE $${paramIndex} OR company_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';
    const { rows } = await this.pool().query(query, params);
    return rows;
  }

  async getTenantRow(tenantId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool().query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
    return (rows[0] as Record<string, unknown> | undefined) ?? null;
  }

  async tenantExists(tenantId: string): Promise<boolean> {
    const { rows } = await this.pool().query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
    return rows.length > 0;
  }

  async getTenantIdAndEmail(tenantId: string): Promise<{ id: string; email: string | null } | null> {
    const { rows } = await this.pool().query<{ id: string; email: string | null }>(
      `SELECT id, email FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return rows[0] ?? null;
  }

  async getTenantUsageStats(tenantId: string): Promise<{
    maxUsers: number;
    userCount: number;
    transactionCount: number;
    accountCount: number;
    contactCount: number;
  }> {
    const pool = this.pool();
    const [tenantInfo, userCount, transactionCount, accountCount, contactCount] = await Promise.all([
      pool.query<{ max_users: number }>(`SELECT max_users FROM tenants WHERE id = $1`, [tenantId]),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM transactions WHERE tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM accounts WHERE tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM contacts WHERE tenant_id = $1`,
        [tenantId]
      ),
    ]);

    return {
      maxUsers: tenantInfo.rows[0]?.max_users ?? 20,
      userCount: Number(userCount.rows[0]?.count ?? 0),
      transactionCount: Number(transactionCount.rows[0]?.count ?? 0),
      accountCount: Number(accountCount.rows[0]?.count ?? 0),
      contactCount: Number(contactCount.rows[0]?.count ?? 0),
    };
  }

  async setLicenseStatus(tenantId: string, status: 'active' | 'suspended'): Promise<void> {
    await this.pool().query(
      `UPDATE tenants SET license_status = $2, updated_at = NOW() WHERE id = $1`,
      [tenantId, status]
    );
  }

  async isEmailUsedByOtherTenant(email: string, tenantId: string): Promise<boolean> {
    const { rows } = await this.pool().query(
      `SELECT id FROM tenants WHERE email = $1 AND id != $2`,
      [email, tenantId]
    );
    return rows.length > 0;
  }

  async updateTenantDynamic(tenantId: string, setClause: string, params: unknown[]): Promise<void> {
    await this.pool().query(`UPDATE tenants SET ${setClause} WHERE id = $${params.length}`, params);
  }

  async deleteTenant(tenantId: string): Promise<void> {
    await this.pool().query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  }

  async listTenantUsers(tenantId: string): Promise<unknown[]> {
    const { rows } = await this.pool().query(
      `SELECT id, username, name, role, email, is_active, login_status, last_login, created_at
       FROM users
       WHERE tenant_id = $1
       ORDER BY CASE WHEN role = 'Admin' THEN 0 ELSE 1 END, created_at ASC`,
      [tenantId]
    );
    return rows;
  }

  async userBelongsToTenant(userId: string, tenantId: string): Promise<boolean> {
    const { rows } = await this.pool().query(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return rows.length > 0;
  }

  async getTenantUser(userId: string, tenantId: string): Promise<{ id: string; role: string; username: string } | null> {
    const { rows } = await this.pool().query<{ id: string; role: string; username: string }>(
      `SELECT id, role, username FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return rows[0] ?? null;
  }

  async countActiveAdmins(tenantId: string): Promise<number> {
    const { rows } = await this.pool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE tenant_id = $1 AND role = $2 AND is_active = TRUE`,
      [tenantId, 'Admin']
    );
    return Number(rows[0]?.count ?? 0);
  }

  async resetTenantUserPassword(tenantId: string, userId: string, passwordHash: string): Promise<void> {
    await this.pool().query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [passwordHash, userId, tenantId]
    );
  }

  async deleteUserSessions(tenantId: string, userId: string): Promise<void> {
    await this.pool().query(`DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [
      userId,
      tenantId,
    ]);
  }

  async deleteTenantUser(tenantId: string, userId: string): Promise<void> {
    await this.pool().query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2`, [userId, tenantId]);
  }

  async forceLogoutTenantUser(tenantId: string, userId: string): Promise<void> {
    await this.deleteUserSessions(tenantId, userId);
    await this.pool().query(
      `UPDATE users SET login_status = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }

  async listTenantModules(tenantId: string): Promise<unknown[]> {
    const { rows } = await this.pool().query(
      `SELECT module_key, status, activated_at, expires_at FROM tenant_modules WHERE tenant_id = $1`,
      [tenantId]
    );
    return rows;
  }
}

export class AdminStatsRepository {
  private pool = () => getPool();

  private async count(sql: string, params: unknown[] = []): Promise<number> {
    try {
      const { rows } = await this.pool().query<{ count: string }>(sql, params);
      return Number(rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  async getDashboardStats(): Promise<{
    tenants: { total: number; active: number; expired: number; trial: number };
    licenses: { monthly: number; yearly: number; perpetual: number };
    licenseReport: {
      renewalsDueIn30Days: number;
      renewalsDueIn7Days: number;
      paymentsTotalByCurrency: Record<string, { count: number; total: number }>;
      paymentsLast30DaysByCurrency: Record<string, { count: number; total: number }>;
    };
    usage: { totalUsers: number; totalTransactions: number };
  }> {
    const pool = this.pool();
    const [
      totalTenants,
      activeTenants,
      expiredTenants,
      trialTenants,
      monthlyLicenses,
      yearlyLicenses,
      perpetualLicenses,
      totalUsers,
      totalTransactions,
      renewalsDue30,
      renewalsDue7,
      paymentsTotals,
      paymentsLast30,
    ] = await Promise.all([
      this.count('SELECT COUNT(*)::text AS count FROM tenants'),
      this.count("SELECT COUNT(*)::text AS count FROM tenants WHERE license_status = 'active'"),
      this.count("SELECT COUNT(*)::text AS count FROM tenants WHERE license_status = 'expired'"),
      this.count("SELECT COUNT(*)::text AS count FROM tenants WHERE license_type = 'trial'"),
      this.count(
        "SELECT COUNT(*)::text AS count FROM tenants WHERE license_type = 'monthly' AND license_status = 'active'"
      ),
      this.count(
        "SELECT COUNT(*)::text AS count FROM tenants WHERE license_type = 'yearly' AND license_status = 'active'"
      ),
      this.count(
        "SELECT COUNT(*)::text AS count FROM tenants WHERE license_type = 'perpetual' AND license_status = 'active'"
      ),
      this.count('SELECT COUNT(*)::text AS count FROM users'),
      this.count('SELECT COUNT(*)::text AS count FROM transactions'),
      this.count(
        `SELECT COUNT(*)::text AS count FROM tenants
         WHERE license_status = 'active' AND license_expiry_date IS NOT NULL
           AND license_expiry_date <= NOW() + INTERVAL '30 days'`
      ),
      this.count(
        `SELECT COUNT(*)::text AS count FROM tenants
         WHERE license_status = 'active' AND license_expiry_date IS NOT NULL
           AND license_expiry_date <= NOW() + INTERVAL '7 days'`
      ),
      pool
        .query<{ currency: string; count: string; total: string }>(
          `SELECT currency, COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS total
           FROM payments WHERE status = 'completed' GROUP BY currency`
        )
        .then((r) => r.rows)
        .catch(() => []),
      pool
        .query<{ currency: string; count: string; total: string }>(
          `SELECT currency, COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS total
           FROM payments
           WHERE status = 'completed' AND paid_at >= NOW() - INTERVAL '30 days'
           GROUP BY currency`
        )
        .then((r) => r.rows)
        .catch(() => []),
    ]);

    const toCurrencyMap = (rows: Array<{ currency: string; count: string; total: string }>) =>
      rows.reduce(
        (acc, row) => {
          const currency = row.currency || 'UNKNOWN';
          acc[currency] = {
            count: Number(row.count ?? 0),
            total: parseFloat(row.total ?? '0'),
          };
          return acc;
        },
        {} as Record<string, { count: number; total: number }>
      );

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        expired: expiredTenants,
        trial: trialTenants,
      },
      licenses: {
        monthly: monthlyLicenses,
        yearly: yearlyLicenses,
        perpetual: perpetualLicenses,
      },
      licenseReport: {
        renewalsDueIn30Days: renewalsDue30,
        renewalsDueIn7Days: renewalsDue7,
        paymentsTotalByCurrency: toCurrencyMap(paymentsTotals),
        paymentsLast30DaysByCurrency: toCurrencyMap(paymentsLast30),
      },
      usage: {
        totalUsers,
        totalTransactions,
      },
    };
  }
}

export class AdminMarketplaceRepository {
  private pool = () => getPool();

  async listAdsForModeration(): Promise<unknown[]> {
    const { rows } = await this.pool().query(`
      SELECT a.*, c.name AS category_name, t.name AS supplier_name, t.company_name AS supplier_company_name
      FROM marketplace_ads a
      JOIN marketplace_categories c ON c.id = a.category_id
      JOIN tenants t ON t.id = a.tenant_id
      ORDER BY CASE WHEN a.status = 'PENDING' THEN 0 ELSE 1 END, a.created_at DESC
    `);
    return rows;
  }

  async listFirstImagesForAds(adIds: string[]): Promise<unknown[]> {
    if (!adIds.length) return [];
    const { rows } = await this.pool().query(
      `SELECT id, ad_id, image_data, content_type FROM marketplace_ad_images
       WHERE ad_id = ANY($1)
       ORDER BY ad_id, sort_order, id`,
      [adIds]
    );
    return rows;
  }

  async approveAd(adId: string): Promise<void> {
    await this.pool().query(
      `UPDATE marketplace_ads SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
      [adId]
    );
  }

  async rejectAd(adId: string): Promise<void> {
    await this.pool().query(
      `UPDATE marketplace_ads SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`,
      [adId]
    );
  }

  async listCategories(): Promise<unknown[]> {
    const { rows } = await this.pool().query(
      `SELECT * FROM marketplace_categories ORDER BY display_order, name`
    );
    return rows;
  }

  async insertCategory(id: string, name: string, displayOrder: number): Promise<void> {
    await this.pool().query(
      `INSERT INTO marketplace_categories (id, name, display_order) VALUES ($1, $2, $3)`,
      [id, name, displayOrder]
    );
  }

  async updateCategory(id: string, name: string, displayOrder: number): Promise<void> {
    await this.pool().query(
      `UPDATE marketplace_categories SET name = $1, display_order = $2 WHERE id = $3`,
      [name, displayOrder, id]
    );
  }

  async countAdsInCategory(categoryId: string): Promise<number> {
    const { rows } = await this.pool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM marketplace_ads WHERE category_id = $1`,
      [categoryId]
    );
    return Number(rows[0]?.count ?? 0);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    await this.pool().query(`DELETE FROM marketplace_categories WHERE id = $1`, [categoryId]);
  }
}

export class AdminSystemMetricsRepository {
  private pool = () => getPool();

  async getPostgresMetrics(): Promise<{
    dbSize: string;
    tables: unknown[];
    connections: unknown[];
    maxConnections: number;
    queryStats: { calls: number; meanExecTime: number };
    slowQueries: number;
  }> {
    const pool = this.pool();
    const [dbSize, tablesSizes, connections, maxConn, queryStats, slowQueries] = await Promise.all([
      pool.query<{ size: string }>(
        `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
      ),
      pool.query(
        `SELECT schemaname || '.' || tablename AS table_name,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
                n_live_tup AS row_count
         FROM pg_stat_user_tables
         ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
         LIMIT 10`
      ),
      pool.query<{ state: string; count: string }>(
        `SELECT state, COUNT(*)::text AS count FROM pg_stat_activity
         WHERE datname = current_database() GROUP BY state`
      ),
      pool.query<{ max_connections: string }>(`SHOW max_connections`),
      pool
        .query<{ calls: string; mean_exec_time: string }>(
          `SELECT SUM(calls)::bigint::text AS calls, AVG(mean_exec_time)::text AS mean_exec_time
           FROM pg_stat_statements
           WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`
        )
        .catch(() => ({ rows: [{ calls: '0', mean_exec_time: '0' }] })),
      pool
        .query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pg_stat_statements
           WHERE mean_exec_time > 1000 AND dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`
        )
        .catch(() => ({ rows: [{ count: '0' }] })),
    ]);

    return {
      dbSize: dbSize.rows[0]?.size ?? 'Unknown',
      tables: tablesSizes.rows,
      connections: connections.rows,
      maxConnections: Number(maxConn.rows[0]?.max_connections ?? 100),
      queryStats: {
        calls: Number(queryStats.rows[0]?.calls ?? 0),
        meanExecTime: parseFloat(queryStats.rows[0]?.mean_exec_time ?? '0'),
      },
      slowQueries: Number(slowQueries.rows[0]?.count ?? 0),
    };
  }

  async getClientMetrics(): Promise<{
    activeSessions: number;
    activeUsers: number;
    tenantDistribution: unknown[];
    recentActivity: number;
  }> {
    const pool = this.pool();
    const [activeSessions, activeUsers, tenantDist, recentActivity] = await Promise.all([
      pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT user_id)::text AS count FROM user_sessions
         WHERE last_activity_at > NOW() - INTERVAL '30 minutes'`
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT user_id)::text AS count FROM login_events
         WHERE status = 'success' AND user_id IS NOT NULL
           AND login_time > NOW() - INTERVAL '24 hours'`
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(t.company_name, ''), t.name) AS tenant_name,
                COUNT(DISTINCT u.id)::text AS user_count,
                COUNT(DISTINCT CASE
                  WHEN us.last_activity_at > NOW() - INTERVAL '24 hours' THEN us.user_id
                END)::text AS active_users
         FROM tenants t
         LEFT JOIN users u ON u.tenant_id = t.id AND u.is_active = TRUE
         LEFT JOIN user_sessions us ON us.tenant_id = t.id
         WHERE t.license_status = 'active'
         GROUP BY t.id, t.name, t.company_name
         ORDER BY active_users DESC, tenant_name ASC
         LIMIT 10`
      ),
      pool
        .query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM transactions
           WHERE created_at > NOW() - INTERVAL '1 hour'`
        )
        .catch(() => ({ rows: [{ count: '0' }] })),
    ]);

    return {
      activeSessions: Number(activeSessions.rows[0]?.count ?? 0),
      activeUsers: Number(activeUsers.rows[0]?.count ?? 0),
      tenantDistribution: tenantDist.rows,
      recentActivity: Number(recentActivity.rows[0]?.count ?? 0),
    };
  }
}
