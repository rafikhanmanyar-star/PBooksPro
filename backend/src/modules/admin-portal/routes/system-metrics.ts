// @ts-nocheck
import { Router } from 'express';
import { AdminRequest } from '../../../adminPortal/middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../adminPortal/adminPortalDb.js';
import { getGlobalOnlineUserCount } from '../../organization/services/presenceService.js';
import { AdminSystemMetricsRepository } from '../repositories/AdminTenantRepository.js';
import os from 'os';

const router = Router();
const getDb = () => getDatabaseService();
const systemMetricsRepo = new AdminSystemMetricsRepository();

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

// Threshold (ms) above which we log slow API requests for performance diagnostics
const SLOW_REQUEST_THRESHOLD_MS = 1000;

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

        // Log slow requests for performance diagnostics (transactions, bills, invoices, etc.)
        if (responseTime >= SLOW_REQUEST_THRESHOLD_MS && req.path?.startsWith('/api/')) {
            const path = req.path || req.originalUrl || req.url || 'unknown';
            console.warn(
                `[PERF] Slow request: ${req.method} ${path} - ${responseTime}ms (status ${res.statusCode})`
            );
        }

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

        const slowRequests = recentRequests.filter(r => r.responseTime >= SLOW_REQUEST_THRESHOLD_MS);
        const pathResponseTimes = recentRequests.reduce((acc: Record<string, number[]>, r) => {
            const key = `${r.method} ${r.path}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(r.responseTime);
            return acc;
        }, {});
        const slowestPaths = Object.entries(pathResponseTimes)
            .map(([path, times]) => ({
                path,
                count: times.length,
                avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
                maxMs: Math.max(...times)
            }))
            .sort((a, b) => b.avgMs - a.avgMs)
            .slice(0, 10);

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
            }, {}),
            slowRequestThresholdMs: SLOW_REQUEST_THRESHOLD_MS,
            slowRequestCount: slowRequests.length,
            slowestPaths
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
            const pgMetrics = await systemMetricsRepo.getPostgresMetrics();

            dbMetrics.size.database = pgMetrics.dbSize;
            dbMetrics.size.tables = pgMetrics.tables;

            const activeConnections = (pgMetrics.connections as Array<{ state: string; count: string }>).find(
                (c) => c.state === 'active'
            );
            dbMetrics.connections.active = parseInt(activeConnections?.count || '0', 10);
            dbMetrics.connections.total = (pgMetrics.connections as Array<{ count: string }>).reduce(
                (sum, c) => sum + parseInt(c.count || '0', 10),
                0
            );
            dbMetrics.connections.maxConnections = pgMetrics.maxConnections;

            dbMetrics.performance.queryCount = pgMetrics.queryStats.calls;
            dbMetrics.performance.averageQueryTime = pgMetrics.queryStats.meanExecTime;
            dbMetrics.performance.slowQueries = pgMetrics.slowQueries;

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
            const clientMetricsRaw = await systemMetricsRepo.getClientMetrics();
            const sessionCount = clientMetricsRaw.activeSessions;
            clientMetrics.activeSessions = Math.max(sessionCount, getGlobalOnlineUserCount());
            clientMetrics.activeUsers = clientMetricsRaw.activeUsers;
            clientMetrics.tenantDistribution = clientMetricsRaw.tenantDistribution;
            clientMetrics.recentActivity = clientMetricsRaw.recentActivity;

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
