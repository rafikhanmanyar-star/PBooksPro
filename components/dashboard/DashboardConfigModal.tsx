
import React, { useState, useMemo, useRef } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useKpis } from '../../context/KPIContext';
import type { KpiDefinition } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { DashboardConfig } from '../../types';
import { ICONS } from '../../constants';

interface DashboardConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DraggableKpiItem: React.FC<{
  kpi: KpiDefinition;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragEnter: (e: React.DragEvent<HTMLLIElement>) => void;
}> = ({ kpi, onRemove, ...dragProps }) => {
    return (
        <li 
            className="flex items-center justify-between p-2 bg-white rounded-lg border shadow-sm cursor-grab active:cursor-grabbing"
            draggable="true"
            {...dragProps}
        >
            <div className="flex items-center gap-2">
                <span className="text-slate-400">{ICONS.barChart}</span>
                <span className="font-medium">{kpi.title}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onRemove} className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10">
                <div className="w-4 h-4">{ICONS.x}</div>
            </Button>
        </li>
    );
};

const DashboardConfigModal: React.FC<DashboardConfigModalProps> = ({ isOpen, onClose }) => {
    const { state, dispatch } = useAppContext();
    const { allKpis } = useKpis();
    const [visibleKpis, setVisibleKpis] = useState<string[]>(Array.isArray(state.dashboardConfig?.visibleKpis) ? state.dashboardConfig.visibleKpis : []);
    
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const kpiGroups = useMemo(() => {
        const groups: { [key: string]: KpiDefinition[] } = {};
        allKpis.forEach(kpi => {
            if (!groups[kpi.group]) {
                groups[kpi.group] = [];
            }
            groups[kpi.group].push(kpi);
        });
        return groups as Record<KpiDefinition['group'], KpiDefinition[]>;
    }, [allKpis]);

    const groupOrder: KpiDefinition['group'][] = ['General', 'Rental', 'Project', 'Account Balances', 'Income Categories', 'Expense Categories'];

    const handleToggleKpi = (kpiId: string) => {
        setVisibleKpis(prev => {
            if (prev.includes(kpiId)) {
                return prev.filter(id => id !== kpiId);
            } else {
                return [...prev, kpiId];
            }
        });
    };
    
    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, position: number) => {
        dragItem.current = position;
    };
    
    const handleDragEnter = (e: React.DragEvent<HTMLLIElement>, position: number) => {
        dragOverItem.current = position;
    };

    const handleDrop = (e: React.DragEvent<HTMLLIElement>) => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        
        const newVisibleKpis = [...visibleKpis];
        const dragItemContent = newVisibleKpis[dragItem.current];
        newVisibleKpis.splice(dragItem.current, 1);
        newVisibleKpis.splice(dragOverItem.current, 0, dragItemContent);
        
        dragItem.current = null;
        dragOverItem.current = null;
        setVisibleKpis(newVisibleKpis);
    };

    const handleSave = () => {
        const newConfig: DashboardConfig = { visibleKpis };
        dispatch({ type: 'UPDATE_DASHBOARD_CONFIG', payload: newConfig });
        onClose();
    };
    
    const handleCancel = () => {
        setVisibleKpis(Array.isArray(state.dashboardConfig?.visibleKpis) ? state.dashboardConfig.visibleKpis : []);
        onClose();
    };
    
    const selectedKpis = useMemo(() => {
        return visibleKpis
            .map(id => allKpis.find(kpi => kpi.id === id))
            .filter((kpi): kpi is KpiDefinition => !!kpi);
    }, [visibleKpis, allKpis]);


    return (
        <Modal isOpen={isOpen} onClose={handleCancel} title="Configure Dashboard" size="xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Side: Available KPIs */}
                <div>
                    <h3 className="font-semibold text-slate-800 mb-2">Available KPIs</h3>
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                        {groupOrder.map((groupName) => {
                            const kpis = kpiGroups[groupName];
                            if (!kpis || kpis.length === 0) return null;
                            return (
                            <div key={groupName}>
                                <h4 className="font-semibold text-sm text-slate-500 mb-2 sticky top-0 bg-slate-50 py-1">{groupName}</h4>
                                <div className="space-y-2">
                                    {kpis.map(kpi => (
                                        <label key={kpi.id} className="flex items-center p-2 rounded-md hover:bg-slate-100 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={visibleKpis.includes(kpi.id)}
                                                onChange={() => handleToggleKpi(kpi.id)}
                                                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                            />
                                            <span className="ml-3 text-sm font-medium text-slate-700">{kpi.title}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )})}
                    </div>
                </div>

                {/* Right Side: Selected & Reorder */}
                <div className="bg-slate-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-slate-800 mb-2">Visible on Dashboard</h3>
                    <p className="text-xs text-slate-500 mb-4">Drag and drop to reorder.</p>
                    {selectedKpis.length > 0 ? (
                        <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                            {selectedKpis.map((kpi, index) => (
                                <DraggableKpiItem 
                                    key={kpi.id}
                                    kpi={kpi}
                                    onRemove={() => handleToggleKpi(kpi.id)}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={handleDrop}
                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                />
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center py-16 border-2 border-dashed rounded-lg">
                            <p className="text-sm text-slate-500">Select KPIs from the left to display them here.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
                <Button onClick={handleSave}>Save Changes</Button>
            </div>
        </Modal>
    );
};

export default DashboardConfigModal;
