import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import {
    Activity,
    Database,
    Server,
    HardDrive,
    RefreshCw,
    AlertTriangle,
    CheckCircle
} from 'lucide-react';

interface SystemMetrics {
    system: {
        uptime: number;
        platform: string;
        arch: string;
        cpuCount: number;
        loadAverage: number[];
        memory: {
            total: number;
            free: number;
            process: {
                rss: number;
                heapTotal: number;
                heapUsed: number;
                external: number;
            };
        };
    };
    database: {
        status: {
            totalConnections: number;
            idleConnections: number;
            waitingConnections: number;
        };
        latencyMs: number;
    };
    timestamp: string;
}

const SystemMonitoring: React.FC = () => {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [refreshing, setRefreshing] = useState(false);

    const fetchMetrics = async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true);
            else setLoading(true);

            const data = await adminApi.getSystemMetrics();
            setMetrics(data);
            setLastUpdated(new Date());
            setError(null);
        } catch (err: any) {
            console.error('Error fetching metrics:', err);
            setError(err.message || 'Failed to fetch system metrics');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchMetrics();

        // Auto refresh every 10 seconds
        const interval = setInterval(() => {
            fetchMetrics(true);
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    const formatBytes = (bytes: number, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const formatUptime = (seconds: number) => {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        parts.push(`${s}s`);

        return parts.join(' ');
    };

    if (loading && !metrics) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                <AlertTriangle size={20} />
                <div>
                    <h3 className="font-bold">Error Loading Metrics</h3>
                    <p>{error}</p>
                    <button
                        onClick={() => fetchMetrics()}
                        className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm font-medium transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">System Monitoring</h1>
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                        <Activity size={14} />
                        Live System Metrics
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">
                        Last updated: {lastUpdated.toLocaleTimeString()}
                    </span>
                    <button
                        onClick={() => fetchMetrics(true)}
                        disabled={refreshing}
                        className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${refreshing ? 'animate-spin' : ''}`}
                        title="Refresh Metrics"
                    >
                        <RefreshCw size={20} className="text-gray-600" />
                    </button>
                </div>
            </div>

            {!metrics ? null : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Server Overview */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Server className="text-blue-600" size={24} />
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Server Info</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 text-sm">Platform</span>
                                <span className="font-medium text-gray-900 capitalize">{metrics.system.platform} ({metrics.system.arch})</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 text-sm">CPU Cores</span>
                                <span className="font-medium text-gray-900">{metrics.system.cpuCount} Cores</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 text-sm">Uptime</span>
                                <span className="font-medium text-gray-900 font-mono text-sm bg-gray-50 px-2 py-1 rounded">
                                    {formatUptime(metrics.system.uptime)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 text-sm">Load Average</span>
                                <span className="font-medium text-gray-900 text-sm">
                                    {metrics.system.loadAverage.map(l => l.toFixed(2)).join(' / ')}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Memory Usage */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-purple-50 rounded-lg">
                                <HardDrive className="text-purple-600" size={24} />
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Memory Usage</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-600">Total System Memory</span>
                                    <span className="font-medium text-gray-900">{formatBytes(metrics.system.memory.total)}</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                    <div
                                        className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                                        style={{ width: `${((metrics.system.memory.total - metrics.system.memory.free) / metrics.system.memory.total) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-end mt-1 text-xs text-gray-500">
                                    {formatBytes(metrics.system.memory.free)} Free
                                </div>
                            </div>

                            <div className="pt-2 border-t border-gray-100">
                                <h3 className="text-sm font-medium text-gray-900 mb-2">Process Memory</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-600">RSS (Resident)</span>
                                        <span className="font-mono text-gray-800">{formatBytes(metrics.system.memory.process.rss)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-600">Heap Used</span>
                                        <span className="font-mono text-gray-800">{formatBytes(metrics.system.memory.process.heapUsed)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-600">Heap Total</span>
                                        <span className="font-mono text-gray-800">{formatBytes(metrics.system.memory.process.heapTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Database Health */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-green-50 rounded-lg">
                                <Database className="text-green-600" size={24} />
                            </div>
                            <h2 className="text-lg font-semibold text-gray-900">Database Health</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 text-sm">Connection Status</span>
                                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                    <CheckCircle size={14} />
                                    Connected
                                </span>
                            </div>

                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 text-sm">Query Latency</span>
                                <span className={`font-medium ${metrics.database.latencyMs > 100 ? 'text-yellow-600' : 'text-green-600'}`}>
                                    {metrics.database.latencyMs}ms
                                </span>
                            </div>

                            <div className="pt-2 border-t border-gray-100">
                                <h3 className="text-sm font-medium text-gray-900 mb-2">Connection Pool</h3>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="p-2 bg-gray-50 rounded-lg">
                                        <div className="text-lg font-bold text-gray-900">{metrics.database.status.totalConnections}</div>
                                        <div className="text-xs text-gray-500">Total</div>
                                    </div>
                                    <div className="p-2 bg-gray-50 rounded-lg">
                                        <div className="text-lg font-bold text-green-600">{metrics.database.status.idleConnections}</div>
                                        <div className="text-xs text-gray-500">Idle</div>
                                    </div>
                                    <div className="p-2 bg-gray-50 rounded-lg">
                                        <div className={`text-lg font-bold ${metrics.database.status.waitingConnections > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                            {metrics.database.status.waitingConnections}
                                        </div>
                                        <div className="text-xs text-gray-500">Waiting</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SystemMonitoring;
