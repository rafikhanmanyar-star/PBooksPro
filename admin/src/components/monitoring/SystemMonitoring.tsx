import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
    Server, Database, Users, Activity,
    AlertTriangle, CheckCircle,
    Cpu
} from 'lucide-react';

interface SystemMetrics {
    timestamp: string;
    server: {
        memory: {
            used: number;
            total: number;
            rss: number;
            external: number;
            percentUsed: number;
        };
        cpu: {
            usage: {
                user: number;
                system: number;
            };
            loadAverage: number[];
            cores: number;
        };
        process: {
            uptime: number;
            pid: number;
            version: string;
            platform: string;
            nodeEnv: string;
        };
        system: {
            totalMemory: number;
            freeMemory: number;
            memoryUsagePercent: number;
            hostname: string;
            uptime: number;
        };
    };
    requests: {
        totalRequests: number;
        requestsPerMinute: number;
        averageResponseTime: number;
        successRate: number;
        errorRate: number;
        statusCodes: Record<number, number>;
        methodDistribution: Record<string, number>;
    };
    database: {
        pool: {
            total: number;
            idle: number;
            waiting: number;
            utilizationPercent: number;
        };
        performance: {
            queryCount: number;
            slowQueries: number;
            averageQueryTime: number;
        };
        size: {
            database: string;
            tables: Array<{
                table_name: string;
                size: string;
                row_count: string;
            }>;
        };
        connections: {
            active: number;
            total: number;
            maxConnections: number;
        };
    };
    clients: {
        activeSessions: number;
        activeUsers: number;
        tenantDistribution: Array<{
            tenant_name: string;
            user_count: string;
            active_users: string;
        }>;
        recentActivity: number;
    };
}

const SystemMonitoring: React.FC = () => {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);

    useEffect(() => {
        loadMetrics();

        if (autoRefresh) {
            const interval = setInterval(loadMetrics, 10000); // Refresh every 10 seconds
            return () => clearInterval(interval);
        }
    }, [autoRefresh]);

    const loadMetrics = async () => {
        try {
            setError('');
            const data = await adminApi.getSystemMetrics();
            setMetrics(data);
            setLoading(false);
        } catch (err: any) {
            console.error('System metrics load error:', err);
            setError(err?.message || 'Failed to load system metrics');
            setLoading(false);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const getHealthColor = (percent: number) => {
        if (percent < 60) return '#10b981'; // green
        if (percent < 80) return '#f59e0b'; // amber
        return '#ef4444'; // red
    };

    const getHealthIcon = (percent: number) => {
        if (percent < 60) return CheckCircle;
        if (percent < 80) return AlertTriangle;
        return AlertTriangle;
    };

    if (loading && !metrics) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                Loading system metrics...
            </div>
        );
    }

    if (error && !metrics) {
        return <div style={{ color: 'red' }}>Error: {error}</div>;
    }

    if (!metrics) {
        return <div>No metrics available</div>;
    }

    const memoryHealthIcon = getHealthIcon(metrics.server.memory.percentUsed);
    const cpuLoadPercent = (metrics.server.cpu.loadAverage[0] / metrics.server.cpu.cores) * 100;
    const dbUtilPercent = metrics.database.pool.utilizationPercent;

    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem'
            }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    System Monitoring
                </h1>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                        />
                        Auto-refresh (10s)
                    </label>
                    <button
                        onClick={loadMetrics}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500
                        }}
                    >
                        Refresh Now
                    </button>
                </div>
            </div>

            {error && (
                <div style={{
                    backgroundColor: '#fef2f2',
                    color: '#991b1b',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    marginBottom: '1rem',
                    fontSize: '0.875rem'
                }}>
                    {error}
                </div>
            )}

            {/* Health Overview Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                API Server
                            </p>
                            <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                                {metrics.server.process.nodeEnv === 'production' ? 'Live' : 'Dev'}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                Uptime: {formatUptime(metrics.server.process.uptime)}
                            </p>
                        </div>
                        <Server size={32} color="#2563eb" />
                    </div>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                Memory Usage
                            </p>
                            <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: getHealthColor(metrics.server.memory.percentUsed) }}>
                                {metrics.server.memory.percentUsed.toFixed(1)}%
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {formatBytes(metrics.server.memory.used)} / {formatBytes(metrics.server.memory.total)}
                            </p>
                        </div>
                        {React.createElement(memoryHealthIcon, { size: 32, color: getHealthColor(metrics.server.memory.percentUsed) })}
                    </div>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                CPU Load
                            </p>
                            <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: getHealthColor(cpuLoadPercent) }}>
                                {metrics.server.cpu.loadAverage[0].toFixed(2)}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {metrics.server.cpu.cores} cores
                            </p>
                        </div>
                        <Cpu size={32} color={getHealthColor(cpuLoadPercent)} />
                    </div>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                DB Pool
                            </p>
                            <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: getHealthColor(dbUtilPercent) }}>
                                {dbUtilPercent.toFixed(1)}%
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {metrics.database.pool.total - metrics.database.pool.idle} / {metrics.database.pool.total} used
                            </p>
                        </div>
                        <Database size={32} color={getHealthColor(dbUtilPercent)} />
                    </div>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                Active Users
                            </p>
                            <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                                {metrics.clients.activeUsers}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {metrics.clients.activeSessions} sessions (30m)
                            </p>
                        </div>
                        <Users size={32} color="#10b981" />
                    </div>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                Requests/min
                            </p>
                            <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                                {metrics.requests.requestsPerMinute.toFixed(1)}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {metrics.requests.totalRequests} in 5min
                            </p>
                        </div>
                        <Activity size={32} color="#8b5cf6" />
                    </div>
                </div>
            </div>

            {/* API Server Details */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Server size={20} />
                    API Server Metrics
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                    <div>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                            Request Performance (5 min)
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            <p>Avg Response Time: <strong>{metrics.requests.averageResponseTime.toFixed(2)}ms</strong></p>
                            <p>Success Rate: <strong style={{ color: '#10b981' }}>{metrics.requests.successRate.toFixed(1)}%</strong></p>
                            <p>Error Rate: <strong style={{ color: metrics.requests.errorRate > 5 ? '#ef4444' : '#6b7280' }}>{metrics.requests.errorRate.toFixed(1)}%</strong></p>
                        </div>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                            System Resources
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            <p>System Memory: <strong>{formatBytes(metrics.server.system.totalMemory - metrics.server.system.freeMemory)} / {formatBytes(metrics.server.system.totalMemory)}</strong></p>
                            <p>Process RSS: <strong>{formatBytes(metrics.server.memory.rss)}</strong></p>
                            <p>System Uptime: <strong>{formatUptime(metrics.server.system.uptime)}</strong></p>
                        </div>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                            Environment
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            <p>Node: <strong>{metrics.server.process.version}</strong></p>
                            <p>Platform: <strong>{metrics.server.process.platform}</strong></p>
                            <p>Hostname: <strong>{metrics.server.system.hostname}</strong></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Database Details */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Database size={20} />
                    Database Metrics
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                            Connections
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            <p>Active: <strong>{metrics.database.connections.active}</strong></p>
                            <p>Total: <strong>{metrics.database.connections.total}</strong></p>
                            <p>Max Allowed: <strong>{metrics.database.connections.maxConnections}</strong></p>
                        </div>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                            Pool Status
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            <p>Total Clients: <strong>{metrics.database.pool.total}</strong></p>
                            <p>Idle: <strong>{metrics.database.pool.idle}</strong></p>
                            <p>Waiting: <strong>{metrics.database.pool.waiting}</strong></p>
                        </div>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                            Performance
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            <p>Total Queries: <strong>{metrics.database.performance.queryCount.toLocaleString()}</strong></p>
                            <p>Avg Query Time: <strong>{metrics.database.performance.averageQueryTime.toFixed(2)}ms</strong></p>
                            <p>Slow Queries (&gt;1s): <strong style={{ color: metrics.database.performance.slowQueries > 0 ? '#ef4444' : '#10b981' }}>{metrics.database.performance.slowQueries}</strong></p>
                        </div>
                    </div>
                </div>

                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: '#374151' }}>
                    Database Size: {metrics.database.size.database}
                </h3>
                {metrics.database.size.tables.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                    <th style={{ padding: '0.5rem', color: '#374151', fontWeight: 600 }}>Table</th>
                                    <th style={{ padding: '0.5rem', color: '#374151', fontWeight: 600 }}>Size</th>
                                    <th style={{ padding: '0.5rem', color: '#374151', fontWeight: 600 }}>Rows</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.database.size.tables.map((table, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.5rem', color: '#6b7280' }}>{table.table_name}</td>
                                        <td style={{ padding: '0.5rem', color: '#6b7280' }}>{table.size}</td>
                                        <td style={{ padding: '0.5rem', color: '#6b7280' }}>{parseInt(table.row_count).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Client Activity */}
            <div className="card">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={20} />
                    Client Load & Activity
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                            User Activity
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            <p>Active Users (24h): <strong>{metrics.clients.activeUsers}</strong></p>
                            <p>Active Sessions (30m): <strong>{metrics.clients.activeSessions}</strong></p>
                            <p>Recent Transactions (1h): <strong>{metrics.clients.recentActivity}</strong></p>
                        </div>
                    </div>
                </div>

                {metrics.clients.tenantDistribution.length > 0 && (
                    <>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: '#374151' }}>
                            Top Active Tenants
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem', color: '#374151', fontWeight: 600 }}>Tenant</th>
                                        <th style={{ padding: '0.5rem', color: '#374151', fontWeight: 600 }}>Total Users</th>
                                        <th style={{ padding: '0.5rem', color: '#374151', fontWeight: 600 }}>Active (24h)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {metrics.clients.tenantDistribution.map((tenant, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '0.5rem', color: '#6b7280' }}>{tenant.tenant_name}</td>
                                            <td style={{ padding: '0.5rem', color: '#6b7280' }}>{tenant.user_count}</td>
                                            <td style={{ padding: '0.5rem', color: '#6b7280', fontWeight: 600 }}>{tenant.active_users}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SystemMonitoring;
