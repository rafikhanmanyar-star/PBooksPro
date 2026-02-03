import { Router } from 'express';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';
import os from 'os';

const router = Router();
const getDb = () => getDatabaseService();

// Store request metrics in memory
interface RequestMetrics {
    timestamp: number;
    responseTime: number;
    statusCode: number;
    method: string;
    path: string;
}

const requestHistory: RequestMetrics[] = [];
const MAX_HISTORY_SIZE = 1000;

// Middleware to track request metrics
export function trackRequestMetrics(req: any, res: any, next: any) {
    const startTime = Date.now();

    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        requestHistory.push({
            timestamp: Date.now(),
            responseTime,
            statusCode: res.statusCode,
            method: req.method,
            path: req.path
        });

        // Keep only recent history
        if (requestHistory.length > MAX_HISTORY_SIZE) {
            requestHistory.shift();
        }
    });

    next();
}

// Get system metrics
router.get('/', async (req: AdminRequest, res) => {
    try {
        console.log('📊 System metrics requested by admin:', req.adminId);
        const db = getDb();
        const pool = db.getPool();

        // 1. API Server Metrics
        const serverMetrics = {
            // Memory usage
            memory: {
                used: process.memoryUsage().heapUsed,
                total: process.memoryUsage().heapTotal,
                rss: process.memoryUsage().rss,
                external: process.memoryUsage().external,
                percentUsed: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
            },
            // CPU usage
            cpu: {
                usage: process.cpuUsage(),
                loadAverage: os.loadavg(),
                cores: os.cpus().length
            },
            // Process info
            process: {
                uptime: process.uptime(),
                pid: process.pid,
                version: process.version,
                platform: process.platform,
                nodeEnv: process.env.NODE_ENV || 'development'
            },
            // System info
            system: {
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                memoryUsagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
                hostname: os.hostname(),
                uptime: os.uptime()
            }
        };

        // 2. Request metrics (last 5 minutes)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const recentRequests = requestHistory.filter(r => r.timestamp > fiveMinutesAgo);

        const requestMetrics = {
            totalRequests: recentRequests.length,
            requestsPerMinute: recentRequests.length / 5,
            averageResponseTime: recentRequests.length > 0
                ? recentRequests.reduce((sum, r) => sum + r.responseTime, 0) / recentRequests.length
                : 0,
            successRate: recentRequests.length > 0
                ? (recentRequests.filter(r => r.statusCode < 400).length / recentRequests.length) * 100
                : 100,
            errorRate: recentRequests.length > 0
                ? (recentRequests.filter(r => r.statusCode >= 400).length / recentRequests.length) * 100
                : 0,
            statusCodes: recentRequests.reduce((acc: Record<number, number>, r) => {
                acc[r.statusCode] = (acc[r.statusCode] || 0) + 1;
                return acc;
            }, {}),
            methodDistribution: recentRequests.reduce((acc: Record<string, number>, r) => {
                acc[r.method] = (acc[r.method] || 0) + 1;
                return acc;
            }, {})
        };

        // 3. Database Metrics
        let dbMetrics: any = {
            pool: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount,
                utilizationPercent: pool.totalCount > 0 ? ((pool.totalCount - pool.idleCount) / pool.totalCount) * 100 : 0
            },
            performance: {
                queryCount: 0,
                slowQueries: 0,
                averageQueryTime: 0
            },
            size: {
                database: 0,
                tables: []
            },
            connections: {
                active: 0,
                total: 0,
                maxConnections: 0
            }
        };

        try {
            // Get database size
            const dbSize = await db.query<{ size: string }>(
                `SELECT pg_size_pretty(pg_database_size(current_database())) as size`
            );
            dbMetrics.size.database = dbSize[0]?.size || 'Unknown';

            // Get top 10 largest tables
            const tablesSizes = await db.query<{ table_name: string; size: string; row_count: string }>(
                `SELECT 
          schemaname || '.' || tablename AS table_name,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
          n_live_tup AS row_count
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10`
            );
            dbMetrics.size.tables = tablesSizes;

            // Get connection stats
            const connections = await db.query<{ state: string; count: string }>(
                `SELECT state, COUNT(*) as count 
         FROM pg_stat_activity 
         WHERE datname = current_database()
         GROUP BY state`
            );

            const activeConnections = connections.find(c => c.state === 'active');
            dbMetrics.connections.active = parseInt(activeConnections?.count || '0', 10);
            dbMetrics.connections.total = connections.reduce((sum, c) => sum + parseInt(c.count || '0', 10), 0);

            // Get max connections setting
            const maxConn = await db.query<{ max_connections: string }>(
                `SHOW max_connections`
            );
            dbMetrics.connections.maxConnections = parseInt(maxConn[0]?.max_connections || '100', 10);

            // Get query statistics
            const queryStats = await db.query<{ calls: string; mean_exec_time: string }>(
                `SELECT 
          SUM(calls)::bigint as calls,
          AVG(mean_exec_time) as mean_exec_time
         FROM pg_stat_statements
         WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`
            ).catch(() => [{ calls: '0', mean_exec_time: '0' }]);

            if (queryStats.length > 0) {
                dbMetrics.performance.queryCount = parseInt(queryStats[0]?.calls || '0', 10);
                dbMetrics.performance.averageQueryTime = parseFloat(queryStats[0]?.mean_exec_time || '0');
            }

            // Get slow queries (>1000ms)
            const slowQueries = await db.query<{ count: string }>(
                `SELECT COUNT(*)::bigint as count
         FROM pg_stat_statements
         WHERE mean_exec_time > 1000 AND dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`
            ).catch(() => [{ count: '0' }]);

            dbMetrics.performance.slowQueries = parseInt(slowQueries[0]?.count || '0', 10);

        } catch (dbError: any) {
            console.error('Error fetching detailed database metrics:', dbError);
            // Continue with basic metrics if detailed queries fail
        }

        // 4. Client/Session Metrics
        let clientMetrics: any = {
            activeSessions: 0,
            activeUsers: 0,
            tenantDistribution: [],
            recentActivity: 0
        };

        try {
            // Count active sessions (users who have activity in last 30 minutes)
            const activeSessions = await db.query<{ count: string }>(
                `SELECT COUNT(DISTINCT user_id) as count 
         FROM users 
         WHERE last_login_at > NOW() - INTERVAL '30 minutes'`
            ).catch(() => [{ count: '0' }]);

            clientMetrics.activeSessions = parseInt(activeSessions[0]?.count || '0', 10);

            // Count total active users (logged in last 24 hours)
            const activeUsers = await db.query<{ count: string }>(
                `SELECT COUNT(DISTINCT user_id) as count 
         FROM users 
         WHERE last_login_at > NOW() - INTERVAL '24 hours'`
            ).catch(() => [{ count: '0' }]);

            clientMetrics.activeUsers = parseInt(activeUsers[0]?.count || '0', 10);

            // Get tenant distribution
            const tenantDist = await db.query<{ tenant_name: string; user_count: string; active_users: string }>(
                `SELECT 
          t.name as tenant_name,
          COUNT(DISTINCT u.user_id) as user_count,
          COUNT(DISTINCT CASE WHEN u.last_login_at > NOW() - INTERVAL '24 hours' THEN u.user_id END) as active_users
         FROM tenants t
         LEFT JOIN users u ON u.tenant_id = t.tenant_id
         WHERE t.license_status = 'active'
         GROUP BY t.tenant_id, t.name
         ORDER BY active_users DESC
         LIMIT 10`
            ).catch(() => []);

            clientMetrics.tenantDistribution = tenantDist;

            // Get recent activity (transactions in last hour)
            const recentActivity = await db.query<{ count: string }>(
                `SELECT COUNT(*) as count 
         FROM transactions 
         WHERE created_at > NOW() - INTERVAL '1 hour'`
            ).catch(() => [{ count: '0' }]);

            clientMetrics.recentActivity = parseInt(recentActivity[0]?.count || '0', 10);

        } catch (clientError: any) {
            console.error('Error fetching client metrics:', clientError);
            // Continue with empty metrics if queries fail
        }

        const metrics = {
            timestamp: new Date().toISOString(),
            server: serverMetrics,
            requests: requestMetrics,
            database: dbMetrics,
            clients: clientMetrics
        };

        console.log('✅ System metrics generated');
        res.json(metrics);
    } catch (error: any) {
        console.error('❌ Error fetching system metrics:', error);
        res.status(500).json({
            error: 'Failed to fetch system metrics',
            message: error.message || 'Internal server error'
        });
    }
});

// Get historical metrics data (for charts)
router.get('/history', async (req: AdminRequest, res) => {
    try {
        const hours = parseInt(req.query.hours as string) || 24;
        const db = getDb();

        // Get historical data from database
        // This is a placeholder - you would need to implement a metrics collection service
        // that periodically stores metrics to the database

        const historyData = {
            message: 'Historical metrics collection not yet implemented',
            suggestion: 'Implement a background job to periodically store metrics to database'
        };

        res.json(historyData);
    } catch (error: any) {
        console.error('❌ Error fetching metrics history:', error);
        res.status(500).json({
            error: 'Failed to fetch metrics history',
            message: error.message || 'Internal server error'
        });
    }
});

export default router;
