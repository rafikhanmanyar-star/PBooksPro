import React, { useState, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useProgress } from '../../context/ProgressContext';
import { useNotification } from '../../context/NotificationContext';
import { createBackup, restoreBackup, createProjectBackup, createBuildingBackup, restoreProjectBuildingBackup, createLoansInvestorsPMBackup, restoreLoansInvestorsPMBackup } from '../../services/backupService';
import { exportToExcel } from '../../services/exportService';
import { ICONS } from '../../constants';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Tabs from '../ui/Tabs';
import { Project, Building } from '../../types';
import ExportDataModal from './ExportDataModal';

const BackupRestorePage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const progress = useProgress();
    const { showConfirm, showToast } = useNotification();
    
    const [activeTab, setActiveTab] = useState<string>('Backup and Restore');
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
    const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
    const [isBuildingPickerOpen, setIsBuildingPickerOpen] = useState(false);
    const [isExportDataModalOpen, setIsExportDataModalOpen] = useState(false);
    
    const fullBackupFileRef = useRef<HTMLInputElement>(null);
    const projectBackupFileRef = useRef<HTMLInputElement>(null);
    const loansInvestorsPMBackupFileRef = useRef<HTMLInputElement>(null);
    
    const handleFullBackup = () => createBackup(progress, dispatch);
    
    const handleFullRestoreClick = () => fullBackupFileRef.current?.click();
    
    const handleFullFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            restoreBackup(file, dispatch, progress);
        }
    };
    
    const handleProjectBackup = async () => {
        if (!selectedProject) {
            showToast('Please select a project first.', 'error');
            return;
        }
        
        if (await showConfirm(`Create backup for project "${selectedProject.name}"? This will include all related transactions, invoices, bills, agreements, and units.`, {
            title: 'Create Project Backup',
            confirmLabel: 'Create Backup',
            cancelLabel: 'Cancel'
        })) {
            createProjectBackup(selectedProject.id, selectedProject.name, state, progress, dispatch);
        }
    };
    
    const handleBuildingBackup = async () => {
        if (!selectedBuilding) {
            showToast('Please select a building first.', 'error');
            return;
        }
        
        if (await showConfirm(`Create backup for building "${selectedBuilding.name}"? This will include all related properties, transactions, invoices, bills, agreements, and contracts.`, {
            title: 'Create Building Backup',
            confirmLabel: 'Create Backup',
            cancelLabel: 'Cancel'
        })) {
            createBuildingBackup(selectedBuilding.id, selectedBuilding.name, state, progress, dispatch);
        }
    };
    
    const handleProjectRestoreClick = () => projectBackupFileRef.current?.click();
    
    const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            restoreProjectBuildingBackup(file, dispatch, progress);
        }
    };
    
    const handleLoansInvestorsPMBackup = () => {
        createLoansInvestorsPMBackup(state, progress, dispatch);
    };
    
    const handleLoansInvestorsPMRestoreClick = () => loansInvestorsPMBackupFileRef.current?.click();
    
    const handleLoansInvestorsPMFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            restoreLoansInvestorsPMBackup(file, dispatch, progress);
        }
    };
    
    const handleImportExcel = () => dispatch({ type: 'SET_PAGE', payload: 'import' });
    
    const handleExportExcel = () => {
        const filename = `MyAccountant_Data_${new Date().toISOString().split('T')[0]}.xlsx`;
        exportToExcel(state, filename, progress, dispatch);
    };
    
    const backupTabs = ['Backup and Restore', 'Import and Export'];
    
    const renderBackupRestore = () => (
        <div className="space-y-6 p-4">
            {/* FULL SYSTEM BACKUP SECTION */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Full System Backup & Restore
                </h4>
                <p className="text-sm text-slate-600 mb-4">Backup and restore your complete database. This includes all accounts, contacts, projects, buildings, transactions, invoices, and all other data.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={handleFullBackup} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-indigo-700 mb-1">Create Full Backup</div>
                        <p className="text-xs text-slate-500">Download complete database backup file (.db)</p>
                    </button>

                    <button onClick={handleFullRestoreClick} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-indigo-700 mb-1">Restore Full Backup</div>
                        <p className="text-xs text-slate-500">Restore from a complete backup file (.db)</p>
                    </button>
                </div>
                <input 
                    type="file" 
                    ref={fullBackupFileRef} 
                    onChange={handleFullFileChange} 
                    className="hidden" 
                    accept=".db" 
                />
            </div>

            {/* PROJECT BACKUP SECTION */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="9" y1="3" x2="9" y2="21"/>
                    </svg>
                    Project-Wise Backup & Restore
                </h4>
                <p className="text-sm text-slate-600 mb-4">Backup and restore data for a specific project. This includes the project, its units, related transactions, invoices, bills, agreements, and staff.</p>
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <label className="text-sm font-medium text-slate-700">Selected Project:</label>
                        <span className="text-sm text-slate-600">{selectedProject ? selectedProject.name : 'None'}</span>
                    </div>
                    <Button 
                        variant="secondary" 
                        onClick={() => setIsProjectPickerOpen(true)}
                        className="text-sm"
                    >
                        {selectedProject ? 'Change Project' : 'Select Project'}
                    </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                        onClick={handleProjectBackup} 
                        disabled={!selectedProject}
                        className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-sm transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="font-semibold text-slate-700 group-hover:text-emerald-700 mb-1">Create Project Backup</div>
                        <p className="text-xs text-slate-500">Download project data as JSON file</p>
                    </button>

                    <button 
                        onClick={handleProjectRestoreClick} 
                        className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-sm transition-all text-left group"
                    >
                        <div className="font-semibold text-slate-700 group-hover:text-emerald-700 mb-1">Restore Project Backup</div>
                        <p className="text-xs text-slate-500">Restore from a project backup file (.json)</p>
                    </button>
                </div>
                <input 
                    type="file" 
                    ref={projectBackupFileRef} 
                    onChange={handleProjectFileChange} 
                    className="hidden" 
                    accept=".json" 
                />
            </div>

            {/* BUILDING BACKUP SECTION */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    Building-Wise Backup & Restore
                </h4>
                <p className="text-sm text-slate-600 mb-4">Backup and restore data for a specific building. This includes the building, its properties, related transactions, invoices, bills, rental agreements, and contracts.</p>
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <label className="text-sm font-medium text-slate-700">Selected Building:</label>
                        <span className="text-sm text-slate-600">{selectedBuilding ? selectedBuilding.name : 'None'}</span>
                    </div>
                    <Button 
                        variant="secondary" 
                        onClick={() => setIsBuildingPickerOpen(true)}
                        className="text-sm"
                    >
                        {selectedBuilding ? 'Change Building' : 'Select Building'}
                    </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                        onClick={handleBuildingBackup} 
                        disabled={!selectedBuilding}
                        className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="font-semibold text-slate-700 group-hover:text-blue-700 mb-1">Create Building Backup</div>
                        <p className="text-xs text-slate-500">Download building data as JSON file</p>
                    </button>

                    <button 
                        onClick={handleProjectRestoreClick} 
                        className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all text-left group"
                    >
                        <div className="font-semibold text-slate-700 group-hover:text-blue-700 mb-1">Restore Building Backup</div>
                        <p className="text-xs text-slate-500">Restore from a building backup file (.json)</p>
                    </button>
                </div>
            </div>

            {/* LOANS, INVESTORS & PM CONFIG BACKUP SECTION */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    Loans, Investors & PM Config Backup & Restore
                </h4>
                <p className="text-sm text-slate-600 mb-4">
                    Backup and restore all loan transactions, investor accounts and transactions, and PM (Project Management) configuration settings. 
                    This includes all related contacts, vendors, accounts, categories, and configuration parameters. 
                    Restore merges data without losing any existing records.
                </p>
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-800 font-medium mb-1">What's included:</p>
                    <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                        <li>All loan transactions (Give, Receive, Repay, Collect)</li>
                        <li>All investor/equity accounts and related transactions</li>
                        <li>PM configuration settings for all projects</li>
                        <li>Related contacts, vendors, accounts, and categories</li>
                        <li>Related configuration settings</li>
                    </ul>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                        onClick={handleLoansInvestorsPMBackup} 
                        className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-purple-50 hover:border-purple-200 hover:shadow-sm transition-all text-left group"
                    >
                        <div className="font-semibold text-slate-700 group-hover:text-purple-700 mb-1">Create Backup</div>
                        <p className="text-xs text-slate-500">Download loans, investors & PM config data as JSON file</p>
                    </button>

                    <button 
                        onClick={handleLoansInvestorsPMRestoreClick} 
                        className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-purple-50 hover:border-purple-200 hover:shadow-sm transition-all text-left group"
                    >
                        <div className="font-semibold text-slate-700 group-hover:text-purple-700 mb-1">Restore Backup</div>
                        <p className="text-xs text-slate-500">Restore from a loans/investors/PM config backup file (.json)</p>
                    </button>
                </div>
                <input 
                    type="file" 
                    ref={loansInvestorsPMBackupFileRef} 
                    onChange={handleLoansInvestorsPMFileChange} 
                    className="hidden" 
                    accept=".json" 
                />
            </div>

        </div>
    );
    
    const renderImportExport = () => (
        <div className="p-4">
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    Excel Data Import & Export
                </h4>
                <p className="text-sm text-slate-600 mb-4">Import and export data in Excel or CSV format for easy editing and bulk operations.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <button onClick={handleImportExcel} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-emerald-700 mb-1">Bulk Import</div>
                        <p className="text-xs text-slate-500">Bulk import accounts & transactions from Excel</p>
                    </button>

                    <button onClick={handleExportExcel} className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-emerald-700 mb-1">Export All to Excel</div>
                        <p className="text-xs text-slate-500">Download all data as .xlsx file</p>
                    </button>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <button onClick={() => setIsExportDataModalOpen(true)} className="w-full p-3 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all text-left group">
                        <div className="font-semibold text-slate-700 group-hover:text-blue-700 mb-1 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Selective Export
                        </div>
                        <p className="text-xs text-slate-500">Select specific data types to export in CSV or Excel format</p>
                    </button>
                </div>
            </div>
        </div>
    );
    
    const renderTabContent = () => {
        switch(activeTab) {
            case 'Backup and Restore':
                return renderBackupRestore();
            case 'Import and Export':
                return renderImportExport();
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

            {/* Project Picker Modal */}
            <Modal isOpen={isProjectPickerOpen} onClose={() => setIsProjectPickerOpen(false)} title="Select Project">
                <div className="space-y-2 max-h-[60vh] overflow-y-auto p-2">
                    {state.projects.length > 0 ? state.projects.map(project => (
                        <button
                            key={project.id}
                            onClick={() => {
                                setSelectedProject(project);
                                setIsProjectPickerOpen(false);
                            }}
                            className="w-full text-left p-3 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 transition-colors flex justify-between items-center group"
                        >
                            <div className="flex items-center gap-2">
                                {project.color && (
                                    <div className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: project.color }}></div>
                                )}
                                <span className="font-medium text-slate-700 group-hover:text-indigo-700">{project.name}</span>
                            </div>
                            <span className="text-slate-400 group-hover:text-indigo-500">{ICONS.chevronRight}</span>
                        </button>
                    )) : (
                        <p className="text-center text-slate-500 py-4">No projects found. Create a project first.</p>
                    )}
                </div>
                <div className="flex justify-end mt-4 pt-4 border-t">
                    <Button variant="secondary" onClick={() => setIsProjectPickerOpen(false)}>Cancel</Button>
                </div>
            </Modal>

            {/* Building Picker Modal */}
            <Modal isOpen={isBuildingPickerOpen} onClose={() => setIsBuildingPickerOpen(false)} title="Select Building">
                <div className="space-y-2 max-h-[60vh] overflow-y-auto p-2">
                    {state.buildings.length > 0 ? state.buildings.map(building => (
                        <button
                            key={building.id}
                            onClick={() => {
                                setSelectedBuilding(building);
                                setIsBuildingPickerOpen(false);
                            }}
                            className="w-full text-left p-3 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 transition-colors flex justify-between items-center group"
                        >
                            <div className="flex items-center gap-2">
                                {building.color && (
                                    <div className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: building.color }}></div>
                                )}
                                <span className="font-medium text-slate-700 group-hover:text-indigo-700">{building.name}</span>
                            </div>
                            <span className="text-slate-400 group-hover:text-indigo-500">{ICONS.chevronRight}</span>
                        </button>
                    )) : (
                        <p className="text-center text-slate-500 py-4">No buildings found. Create a building first.</p>
                    )}
                </div>
                <div className="flex justify-end mt-4 pt-4 border-t">
                    <Button variant="secondary" onClick={() => setIsBuildingPickerOpen(false)}>Cancel</Button>
                </div>
            </Modal>

            {/* Export Data Modal */}
            <ExportDataModal
                isOpen={isExportDataModalOpen}
                onClose={() => setIsExportDataModalOpen(false)}
            />
        </div>
    );
};

export default BackupRestorePage;

