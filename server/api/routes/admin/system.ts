import { Router } from 'express';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';
import os from 'os';

const router = Router();
const getDb = () => getDatabaseService();

// Get system metrics
router.get('/metrics', async (req: AdminRequest, res) => {
    try {
        const db = getDb();
        const pool = db.getPool();

        // System stats
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const loadAvg = os.loadavg();
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();

        // Database stats (Postgres Pool)
        const dbStats = {
            totalConnections: pool.totalCount,
            idleConnections: pool.idleCount,
            waitingConnections: pool.waitingCount,
        };

        // Perform a quick health check query to measure latency
        const start = Date.now();
        await db.healthCheck();
        const dbLatency = Date.now() - start;

        const metrics = {
            system: {
                uptime,
                platform: os.platform(),
                arch: os.arch(),
                cpuCount: cpus.length,
                loadAverage: loadAvg,
                memory: {
                    total: totalMem,
                    free: freeMem,
                    process: memoryUsage
                }
            },
            database: {
                status: dbStats,
                latencyMs: dbLatency
            },
            timestamp: new Date().toISOString()
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

export default router;
