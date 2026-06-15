import React, { useMemo, useState } from 'react';
import Tabs from '../ui/Tabs';
import ExportDataModal from './ExportDataModal';
import CompanyBackupRestore from '../company/CompanyBackupRestore';
import PostgresBackupRestore from './PostgresBackupRestore';
import BackupHistoryPage from './BackupHistoryPage';
import BackupStorageSettingsPage from './BackupStorageSettingsPage';
import TenantRestoreWizard from './TenantRestoreWizard';
import DisasterRecoveryCenter from './DisasterRecoveryCenter';
import BackupSecurityPage from './BackupSecurityPage';
import { usePermissions } from '../../hooks/usePermissions';
import ImportExportWizard from './ImportExportWizard';

const CLOUD_BACKUP_TABS = [
    'Backup and Restore',
    'Backup History',
    'Disaster Recovery',
    'Backup Security',
    'Tenant Restore',
    'Storage Settings',
    'Import',
    'Selective Export',
] as const;

const BackupRestorePage: React.FC = () => {
    const perms = usePermissions();
    const canManageBackups = perms.canManageBackups;

    const [activeTab, setActiveTab] = useState<string>('Backup and Restore');
    const [isExportDataModalOpen, setIsExportDataModalOpen] = useState(false);

    const backupTabs = useMemo(
        () => [...(CLOUD_BACKUP_TABS)],
        []
    );

    const renderBackupRestore = () => {
        const showSqliteCompanyBackup = false;
        const showPostgresBackup = canManageBackups;
        return (
            <div className="p-4 sm:p-6">
                <div className="max-w-2xl mx-auto">
                    <div className="p-5 sm:p-6 border border-app-border rounded-xl bg-app-card shadow-ds-card">
                        {showSqliteCompanyBackup ? (
                            <CompanyBackupRestore />
                        ) : showPostgresBackup ? (
                            <PostgresBackupRestore />
                        ) : (
                            <>
                                <h4 className="text-lg font-semibold text-app-text mb-1">
                                    {'PostgreSQL Backup'}
                                </h4>
                                <p className="text-sm text-app-muted mb-4">
                                    {'Download encrypted full-database backups or export your organization for tenant restore.'}
                                </p>
                                <div className="py-8 px-4 text-center rounded-lg bg-app-surface-2/80 border border-app-border">
                                    <p className="text-sm text-app-muted">
                                        {!canManageBackups
                                                ? 'Backup and restore requires Company Admin or Super Admin permissions.'
                                                : 'PostgreSQL backup is unavailable. Check API server configuration (DATABASE_URL, ENABLE_DB_BACKUP_RESTORE, pg_dump on PATH).'}
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
        <div className="flex flex-col min-h-[400px] bg-app-card">
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
                <div className="p-5 sm:p-6 border border-app-border rounded-xl bg-app-card shadow-ds-card">
                    <h4 className="text-lg font-semibold text-app-text mb-1">Selective Export</h4>
                    <p className="text-sm text-app-muted mb-4">
                        Select specific data types to export as CSV or Excel. Choose formats and run the export.
                    </p>
                    <button
                        onClick={() => setIsExportDataModalOpen(true)}
                        className="w-full p-4 bg-app-toolbar/30 border border-app-border rounded-lg hover:bg-app-table-hover hover:border-primary/30 hover:shadow-ds-card transition-all text-left group flex items-center gap-3"
                    >
                        <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </span>
                        <div>
                            <div className="font-semibold text-app-text group-hover:text-primary">Select data types and export</div>
                            <p className="text-xs text-app-muted">Choose formats (CSV or Excel) and run export</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );

    const renderBackupSecurity = () => <BackupSecurityPage />;
    const renderDisasterRecovery = () => <DisasterRecoveryCenter />;
    const renderBackupHistory = () => <BackupHistoryPage />;
    const renderStorageSettings = () => <BackupStorageSettingsPage />;
    const renderTenantRestore = () => <TenantRestoreWizard />;

    const renderTabContent = () => {
        switch (safeActiveTab) {
            case 'Backup and Restore':
                return renderBackupRestore();
            case 'Backup History':
                return renderBackupHistory();
            case 'Disaster Recovery':
                return renderDisasterRecovery();
            case 'Backup Security':
                return renderBackupSecurity();
            case 'Tenant Restore':
                return renderTenantRestore();
            case 'Storage Settings':
                return renderStorageSettings();
            case 'Import':
                return renderImport();
            case 'Selective Export':
                return renderSelectiveExport();
            default:
                return renderBackupRestore();
        }
    };

    const handleTabClick = (tab: string) => {
        setActiveTab(tab);
    };

    const safeActiveTab = backupTabs.includes(activeTab as (typeof backupTabs)[number])
        ? activeTab
        : 'Backup and Restore';

    return (
        <div className="flex flex-col">
            <div className="flex-shrink-0">
                <Tabs
                    variant="browser"
                    tabs={backupTabs}
                    activeTab={safeActiveTab}
                    onTabClick={handleTabClick}
                />
            </div>
            <div className="flex-grow min-h-[400px] bg-app-card rounded-b-lg -mt-px">
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
