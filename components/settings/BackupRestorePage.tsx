import React, { useState } from 'react';
import { isLocalOnlyMode } from '../../config/apiUrl';
import Tabs from '../ui/Tabs';
import ExportDataModal from './ExportDataModal';
import CompanyBackupRestore from '../company/CompanyBackupRestore';
import PostgresBackupRestore from './PostgresBackupRestore';
import { useCompanyOptional } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import ImportExportWizard from './ImportExportWizard';

function isOrgAdminRole(role: string | undefined): boolean {
    if (!role) return false;
    const r = role.toLowerCase();
    return r === 'admin' || r === 'super_admin';
}

const BackupRestorePage: React.FC = () => {
    const companyCtx = useCompanyOptional();
    const { user: authUser } = useAuth();

    const [activeTab, setActiveTab] = useState<string>('Backup and Restore');
    const [isExportDataModalOpen, setIsExportDataModalOpen] = useState(false);

    const backupTabs = ['Backup and Restore', 'Import', 'Selective Export'];

    const renderBackupRestore = () => {
        const showSqliteCompanyBackup = isLocalOnlyMode() && companyCtx?.activeCompany;
        const showPostgresBackup = !isLocalOnlyMode() && isOrgAdminRole(authUser?.role);
        return (
            <div className="p-4 sm:p-6">
                <div className="max-w-2xl mx-auto">
                    <div className="p-5 sm:p-6 border border-slate-200 rounded-xl bg-slate-50/50 shadow-sm">
                        {showSqliteCompanyBackup ? (
                            <CompanyBackupRestore />
                        ) : showPostgresBackup ? (
                            <PostgresBackupRestore />
                        ) : (
                            <>
                                <h4 className="text-lg font-semibold text-slate-800 mb-1">Company Backup</h4>
                                <p className="text-sm text-slate-600 mb-4">
                                    Create and restore backups of your current company database. Backups are stored locally and can be restored anytime.
                                </p>
                                <div className="py-8 px-4 text-center rounded-lg bg-slate-100/80 border border-slate-200">
                                    <p className="text-sm text-slate-600">
                                        {isLocalOnlyMode() && !companyCtx?.activeCompany
                                            ? 'Select or create a company to manage backups.'
                                            : isLocalOnlyMode()
                                                ? 'Company backup is unavailable.'
                                                : !isOrgAdminRole(authUser?.role)
                                                    ? 'Full database backup and restore (PostgreSQL) is available to organization administrators when using the app with your API server.'
                                                    : 'Company backup is unavailable.'}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderImport = () => (
        <div className="flex flex-col min-h-[400px] bg-white">
            <ImportExportWizard
                embedded
                startAtImport
                onBack={() => setActiveTab('Backup and Restore')}
            />
        </div>
    );

    const renderSelectiveExport = () => (
        <div className="p-4 sm:p-6">
            <div className="max-w-2xl mx-auto">
                <div className="p-5 sm:p-6 border border-slate-200 rounded-xl bg-slate-50/50 shadow-sm">
                    <h4 className="text-lg font-semibold text-slate-800 mb-1">Selective Export</h4>
                    <p className="text-sm text-slate-600 mb-4">
                        Select specific data types to export as CSV or Excel. Choose formats and run the export.
                    </p>
                    <button
                        onClick={() => setIsExportDataModalOpen(true)}
                        className="w-full p-4 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all text-left group flex items-center gap-3"
                    >
                        <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </span>
                        <div>
                            <div className="font-semibold text-slate-700 group-hover:text-blue-700">Select data types and export</div>
                            <p className="text-xs text-slate-500">Choose formats (CSV or Excel) and run export</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'Backup and Restore':
                return renderBackupRestore();
            case 'Import':
                return renderImport();
            case 'Selective Export':
                return renderSelectiveExport();
            default:
                return renderBackupRestore();
        }
    };

    return (
        <div className="flex flex-col">
            <div className="flex-shrink-0">
                <Tabs
                    variant="browser"
                    tabs={backupTabs}
                    activeTab={activeTab}
                    onTabClick={setActiveTab}
                />
            </div>
            <div className="flex-grow min-h-[400px] bg-white rounded-b-lg -mt-px">
                {renderTabContent()}
            </div>

            <ExportDataModal
                isOpen={isExportDataModalOpen}
                onClose={() => setIsExportDataModalOpen(false)}
            />
        </div>
    );
};

export default BackupRestorePage;
