
import React, { useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import type { KpiDefinition } from '../../types';
import { useKpis } from '../../context/KPIContext';
import { ReportDefinition } from '../reports/reportDefinitions';
import { ICONS } from '../../constants';

interface KPISelectorProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'KPIs' | 'Reports';
}

const KPISelector: React.FC<KPISelectorProps> = ({ isOpen, onClose, initialTab = 'KPIs' }) => {
    const { 
      visibleKpiIds, setVisibleKpiIds, allKpis,
      favoriteReportIds, setFavoriteReportIds, allReports
    } = useKpis();

    const kpiGroups = useMemo(() => {
        const groups: Record<string, KpiDefinition[]> = {};
        allKpis.forEach(kpi => {
            if (!groups[kpi.group]) groups[kpi.group] = [];
            groups[kpi.group].push(kpi);
        });
        return groups;
    }, [allKpis]);
    
    const reportGroups = useMemo(() => {
        const groups: Record<string, ReportDefinition[]> = {};
        allReports.forEach(report => {
            if (!groups[report.group]) groups[report.group] = [];
            groups[report.group].push(report);
        });
        return groups;
    }, [allReports]);

    const handleToggleKpi = (kpiId: string) => {
        setVisibleKpiIds(prev => prev.includes(kpiId) ? prev.filter(id => id !== kpiId) : [...prev, kpiId]);
    };

    const handleToggleReport = (reportId: string) => {
        setFavoriteReportIds(prev => prev.includes(reportId) ? prev.filter(id => id !== reportId) : [...prev, reportId]);
    };

    const handleMoveKpi = (index: number, direction: 'up' | 'down') => {
        const newIds = [...visibleKpiIds];
        if (direction === 'up' && index > 0) {
            [newIds[index], newIds[index - 1]] = [newIds[index - 1], newIds[index]];
        } else if (direction === 'down' && index < newIds.length - 1) {
            [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
        }
        setVisibleKpiIds(newIds);
    };

    const groupOrder = ['General', 'Account Balances', 'Rental', 'Project', 'Income Categories', 'Expense Categories'];
    const reportGroupOrder = ['Rental', 'Project', 'General'];

    const renderSelectedKPIs = () => (
        <div className="mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <h4 className="font-semibold text-slate-700 mb-2 text-sm border-b pb-1">Selected KPIs (Ordered)</h4>
            <ul className="space-y-2">
                {visibleKpiIds.map((id, index) => {
                    const kpi = allKpis.find(k => k.id === id);
                    if (!kpi) return null;
                    return (
                        <li key={id} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 truncate mr-2">
                                <span className="text-slate-400 w-4 h-4 flex-shrink-0 opacity-70">
                                    {React.isValidElement(kpi.icon) ? kpi.icon : ICONS.barChart}
                                </span>
                                <span className="text-sm font-medium text-slate-700 truncate">{kpi.title}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => handleMoveKpi(index, 'up')} disabled={index === 0} className="p-1 text-slate-400 hover:text-accent disabled:opacity-20" aria-label="Move Up">
                                    <div className="w-4 h-4">{ICONS.arrowUp}</div>
                                </button>
                                <button onClick={() => handleMoveKpi(index, 'down')} disabled={index === visibleKpiIds.length - 1} className="p-1 text-slate-400 hover:text-accent disabled:opacity-20" aria-label="Move Down">
                                    <div className="w-4 h-4">{ICONS.arrowDown}</div>
                                </button>
                                <button onClick={() => handleToggleKpi(id)} className="p-1 text-rose-400 hover:text-rose-600 ml-1 border-l pl-2" aria-label="Remove">
                                    <div className="w-4 h-4">{ICONS.x}</div>
                                </button>
                            </div>
                        </li>
                    );
                })}
                {visibleKpiIds.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No KPIs selected.</p>}
            </ul>
        </div>
    );

    const renderKPIs = () => (
      <div className="space-y-6">
        {renderSelectedKPIs()}
        
        <div>
            <h4 className="font-bold text-slate-800 mb-3">Add More KPIs</h4>
            {groupOrder.map(groupName => {
                const kpis = kpiGroups[groupName];
                if (!kpis || kpis.length === 0) return null;
                return (
                    <div key={groupName} className="mb-4">
                        <h5 className="font-semibold text-xs text-slate-500 uppercase tracking-wider mb-2">{groupName}</h5>
                        <div className="space-y-1">
                            {kpis.map(kpi => {
                                const isSelected = visibleKpiIds.includes(kpi.id);
                                return (
                                    <label key={kpi.id} className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 opacity-60' : 'hover:bg-slate-100'}`}>
                                        <input 
                                            type="checkbox" 
                                            checked={isSelected} 
                                            onChange={() => handleToggleKpi(kpi.id)} 
                                            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                        />
                                        <span className="ml-3 text-sm font-medium text-slate-700">{kpi.title}</span>
                                        {isSelected && <span className="ml-auto text-xs text-accent font-semibold">Added</span>}
                                    </label>
                                )
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
      </div>
    );

    const renderReports = () => (
      <div className="space-y-6">
        {reportGroupOrder.map(groupName => {
            const reports = reportGroups[groupName];
            if (!reports || reports.length === 0) return null;
            return (
                <div key={groupName}>
                    <h4 className="font-semibold text-slate-600 mb-2 border-b pb-1">{groupName}</h4>
                    <div className="space-y-2">
                        {reports.map(report => (
                            <label key={report.id} className="flex items-center p-2 rounded-md hover:bg-slate-100 cursor-pointer">
                                <input type="checkbox" checked={favoriteReportIds.includes(report.id)} onChange={() => handleToggleReport(report.id)} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"/>
                                <span className="ml-3 text-sm font-medium text-slate-700">{report.title}</span>
                            </label>
                        ))}
                    </div>
                </div>
            );
        })}
      </div>
    );

    const modalTitle = initialTab === 'KPIs' ? 'Customize Quick Access KPIs' : 'Customize Favorite Reports';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="md">
            <div className="max-h-[60vh] overflow-y-auto pr-1">
                {initialTab === 'KPIs' ? renderKPIs() : renderReports()}
            </div>
            <div className="flex justify-end mt-6 pt-4 border-t">
                <Button onClick={onClose}>Done</Button>
            </div>
        </Modal>
    );
};

export default KPISelector;
