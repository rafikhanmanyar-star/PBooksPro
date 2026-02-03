
import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET /api/analytics/kpis
router.get('/kpis', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const tenantId = req.tenantId;
        const { startDate, endDate } = req.query;

        // 1. Total Revenue (from shop_sales for now)
        const revenueRes = await db.query(
            `SELECT SUM(grand_total) as total, COUNT(*) as count 
             FROM shop_sales 
             WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3`,
            [tenantId, startDate || '2000-01-01', endDate || new Date().toISOString()]
        );
        const revenue = parseFloat(revenueRes[0].total || '0');
        const salesCount = parseInt(revenueRes[0].count || '0');

        // 2. AOV
        const aov = salesCount > 0 ? revenue / salesCount : 0;

        // 3. Net Profit (Mock for now, or estimate e.g. 20%)
        const netProfit = revenue * 0.25;

        // 4. Conversion (Mock)
        const conversion = 3.8;

        res.json([
            { label: 'Total Revenue', value: revenue.toLocaleString(), trend: 12.4, status: 'up', sparkline: [0, 0, 0, 0, 0, 0, revenue] }, // Simple mock sparkline
            { label: 'Net Profit', value: netProfit.toLocaleString(), trend: 8.2, status: 'up', sparkline: [0, 0, 0, 0, 0, 0, netProfit] },
            { label: 'Avg Order Value', value: aov.toLocaleString(), trend: -2.1, status: 'neutral', sparkline: [0, 0, 0, 0, 0, 0, aov] },
            { label: 'Conversion Rate', value: conversion + '%', trend: 1.5, status: 'up', sparkline: [3, 3, 3, 3, 3, 3, 3] },
        ]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/sales-trend
router.get('/sales-trend', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        // Return hourly sales for today (Mock simulation or real aggregation)
        // Real aggregation example:
        const sales = await db.query(`
            SELECT 
                EXTRACT(HOUR FROM created_at) as hour,
                SUM(grand_total) as revenue,
                COUNT(*) as orders
            FROM shop_sales
            WHERE tenant_id = $1 AND created_at >= NOW()::date
            GROUP BY 1
            ORDER BY 1
        `, [req.tenantId]);

        // Fill missing hours
        const trends: any[] = [];
        for (let i = 8; i <= 22; i += 2) {
            const found = sales.find((s: any) => parseInt(s.hour) === i) || { revenue: 0, orders: 0 };
            trends.push({
                timestamp: `${i}:00`,
                revenue: parseFloat(found.revenue || '0'),
                orders: parseInt(found.orders || '0'),
                profit: (parseFloat(found.revenue || '0') * 0.3)
            });
        }
        res.json(trends);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/store-rankings
router.get('/store-rankings', async (req: TenantRequest, res) => {
    try {
        const db = getDb();
        const rankings = await db.query(`
            SELECT 
                b.name as storeName,
                COALESCE(SUM(s.grand_total), 0) as revenue
            FROM shop_branches b
            LEFT JOIN shop_sales s ON b.id = s.branch_id AND s.created_at >= NOW() - INTERVAL '30 days'
            WHERE b.tenant_id = $1
            GROUP BY b.id, b.name
            ORDER BY revenue DESC
            LIMIT 5
         `, [req.tenantId]);

        const result = rankings.map((r: any) => ({
            storeName: r.storename, // query returns storename in lowercase usually or as storeName? pg result is lowercase storename
            revenue: parseFloat(r.revenue || '0'),
            growth: 0,
            margin: 25 // Default margin estimate
        }));

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
