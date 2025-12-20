import React, { useState, useEffect } from 'react';
import { getDatabaseService } from '../../services/database/databaseService';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';

interface TableInfo {
    name: string;
    rowCount: number;
    columns: string[];
    sampleData: any[];
}

const DatabaseAnalyzer: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [dbInfo, setDbInfo] = useState<{
        isReady: boolean;
        storageMode: string;
        size: number;
        error: string | null;
    }>({
        isReady: false,
        storageMode: 'unknown',
        size: 0,
        error: null
    });
    const { showToast } = useNotification();

    const analyzeDatabase = async () => {
        setIsLoading(true);
        try {
            const dbService = getDatabaseService();
            
            // Check if database is ready
            if (!dbService.isReady()) {
                await dbService.initialize();
            }

            // Get database info
            const isReady = dbService.isReady();
            const size = dbService.getSize();
            const storageMode = dbService.getStorageMode() || 'unknown';
            
            setDbInfo({
                isReady,
                storageMode,
                size,
                error: null
            });

            // Get all table names
            const tableNames = dbService.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            );

            const tablesInfo: TableInfo[] = [];

            for (const table of tableNames) {
                try {
                    // Get row count
                    const countResult = dbService.query<{ count: number }>(
                        `SELECT COUNT(*) as count FROM ${table.name}`
                    );
                    const rowCount = countResult[0]?.count || 0;

                    // Get column names
                    const columnsResult = dbService.query<{ name: string }>(
                        `PRAGMA table_info(${table.name})`
                    );
                    const columns = columnsResult.map(col => col.name);

                    // Get sample data (first 5 rows)
                    let sampleData: any[] = [];
                    if (rowCount > 0) {
                        try {
                            sampleData = dbService.query(`SELECT * FROM ${table.name} LIMIT 5`);
                        } catch (e) {
                            console.warn(`Could not fetch sample data from ${table.name}:`, e);
                        }
                    }

                    tablesInfo.push({
                        name: table.name,
                        rowCount,
                        columns,
                        sampleData
                    });
                } catch (error) {
                    console.error(`Error analyzing table ${table.name}:`, error);
                    tablesInfo.push({
                        name: table.name,
                        rowCount: -1,
                        columns: [],
                        sampleData: [],
                    });
                }
            }

            setTables(tablesInfo);
            setIsModalOpen(true);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            setDbInfo(prev => ({ ...prev, error: errorMsg }));
            showToast(`Database analysis failed: ${errorMsg}`, 'error');
            console.error('Database analysis error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const selectedTableInfo = tables.find(t => t.name === selectedTable);

    return (
        <>
            <button 
                onClick={analyzeDatabase}
                disabled={isLoading}
                className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all text-left group"
            >
                <div className="font-semibold text-slate-700 group-hover:text-blue-700 mb-1 flex items-center gap-2">
                    {isLoading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            Analyzing...
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            Analyze Database
                        </>
                    )}
                </div>
                <p className="text-xs text-slate-500">View tables, row counts, and data structure.</p>
            </button>

            <Modal 
                isOpen={isModalOpen} 
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedTable(null);
                }} 
                title="Database Analysis" 
                size="xl"
            >
                <div className="space-y-4">
                    {/* Database Info */}
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <h3 className="font-semibold text-slate-800 mb-3">Database Status</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-slate-600">Status:</span>
                                <span className={`ml-2 font-medium ${dbInfo.isReady ? 'text-green-600' : 'text-red-600'}`}>
                                    {dbInfo.isReady ? 'Ready' : 'Not Ready'}
                                </span>
                            </div>
                            <div>
                                <span className="text-slate-600">Storage:</span>
                                <span className="ml-2 font-medium text-slate-800">{dbInfo.storageMode}</span>
                            </div>
                            <div>
                                <span className="text-slate-600">Size:</span>
                                <span className="ml-2 font-medium text-slate-800">{formatBytes(dbInfo.size)}</span>
                            </div>
                            <div>
                                <span className="text-slate-600">Tables:</span>
                                <span className="ml-2 font-medium text-slate-800">{tables.length}</span>
                            </div>
                        </div>
                        {dbInfo.error && (
                            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                Error: {dbInfo.error}
                            </div>
                        )}
                    </div>

                    {/* Tables List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                        {tables.map(table => (
                            <button
                                key={table.name}
                                onClick={() => setSelectedTable(table.name)}
                                className={`p-3 rounded-lg border text-left transition-all ${
                                    selectedTable === table.name
                                        ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                                        : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <div className="font-semibold text-slate-800 mb-1">{table.name}</div>
                                <div className="text-xs text-slate-600">
                                    {table.rowCount >= 0 ? (
                                        <>
                                            <span className="font-medium">{table.rowCount.toLocaleString()}</span> rows
                                            {table.columns.length > 0 && (
                                                <> • <span className="font-medium">{table.columns.length}</span> columns</>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-red-600">Error reading table</span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Table Details */}
                    {selectedTableInfo && (
                        <div className="border-t pt-4">
                            <h3 className="font-semibold text-slate-800 mb-3">
                                Table: <span className="text-indigo-600">{selectedTableInfo.name}</span>
                            </h3>
                            
                            {/* Columns */}
                            {selectedTableInfo.columns.length > 0 && (
                                <div className="mb-4">
                                    <h4 className="text-sm font-medium text-slate-700 mb-2">Columns ({selectedTableInfo.columns.length}):</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedTableInfo.columns.map(col => (
                                            <span 
                                                key={col}
                                                className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-mono"
                                            >
                                                {col}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Sample Data */}
                            {selectedTableInfo.sampleData.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-700 mb-2">
                                        Sample Data (showing {selectedTableInfo.sampleData.length} of {selectedTableInfo.rowCount} rows):
                                    </h4>
                                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                        <table className="min-w-full text-xs">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    {selectedTableInfo.columns.map(col => (
                                                        <th key={col} className="px-3 py-2 text-left text-slate-600 font-semibold border-b">
                                                            {col}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {selectedTableInfo.sampleData.map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50">
                                                        {selectedTableInfo.columns.map(col => (
                                                            <td key={col} className="px-3 py-2 text-slate-700 border-b">
                                                                {typeof row[col] === 'object' 
                                                                    ? JSON.stringify(row[col])
                                                                    : String(row[col] ?? 'NULL')
                                                                }
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {selectedTableInfo.rowCount === 0 && (
                                <div className="text-center py-8 text-slate-500 text-sm">
                                    Table is empty (no rows)
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
};

export default DatabaseAnalyzer;

