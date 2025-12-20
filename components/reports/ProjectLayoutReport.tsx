
import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY } from '../../constants';
import { InvoiceStatus, TransactionType } from '../../types';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import Button from '../ui/Button';

interface UnitBoxData {
    id: string;
    name: string;
    projectName: string;
    clientName: string;
    receivable: number; // Invoiced but not paid
    received: number;
    floorIndex: number;
    floorLabel: string;
    unitIndex: number;
    status: 'Sold' | 'Available';
    type: string;
}

interface ProjectLayoutData {
    id: string;
    name: string;
    floors: {
        index: number;
        label: string;
        units: UnitBoxData[];
    }[];
    unconventional: UnitBoxData[];
}

const ProjectLayoutReport: React.FC = () => {
    const { state } = useAppContext();

    // --- Helper: Parse Unit Name (Project Context) ---
    const parseUnit = (name: string): { floorIndex: number, floorLabel: string, unitIndex: number, isUnconventional: boolean, type: string } => {
        let cleanName = name.trim().toUpperCase();
        
        let type = 'UNIT';
        if (cleanName.includes('OFF')) type = 'OFFICE';
        else if (cleanName.includes('APT')) type = 'APARTMENT';
        else if (cleanName.includes('SHOP') || cleanName.includes('SH')) type = 'SHOP';
        else if (cleanName.includes('GD')) type = 'GODOWN';
        else if (cleanName.includes('VILLA')) type = 'VILLA';
        else if (cleanName.includes('PLOT')) type = 'PLOT';

        if (/[A-Z]{2}$/.test(cleanName)) {
            cleanName = cleanName.slice(0, -2);
        }

        let remainder = cleanName.replace(/^(OFF|APT|UNIT|SHOP|SH|GD|VILLA|PLOT|-|\s)+/g, '');

        let floorIndex = 0;
        let floorLabel = 'G';
        let unitIndex = 0;
        let isUnconventional = false;

        if (remainder.startsWith('LG')) {
            floorIndex = -1;
            floorLabel = 'LG';
            const unitPart = remainder.replace('LG', '').replace(/[^0-9]/g, '');
            unitIndex = parseInt(unitPart) || 0;
        } else if (remainder.startsWith('G') || remainder.startsWith('GF')) {
            floorIndex = 0;
            floorLabel = 'G';
            const unitPart = remainder.replace(/^(G|GF)/, '').replace(/[^0-9]/g, '');
            unitIndex = parseInt(unitPart) || 0;
        } else if (remainder.startsWith('MZ') || remainder.startsWith('M')) {
            floorIndex = 0.5; // Mezzanine
            floorLabel = 'MZ';
            const unitPart = remainder.replace(/^(MZ|M)/, '').replace(/[^0-9]/g, '');
            unitIndex = parseInt(unitPart) || 0;
        } else {
            const numberMatch = remainder.match(/^(\d+)/);
            if (numberMatch) {
                const numStr = numberMatch[1];
                const numericVal = parseInt(numStr);
                if (numStr.length === 1) {
                    floorIndex = 0; floorLabel = 'G'; unitIndex = numericVal;
                } else if (numStr.length === 2) {
                    const floorPart = numStr.slice(0, 1); const unitPart = numStr.slice(1);
                    floorIndex = parseInt(floorPart); unitIndex = parseInt(unitPart); floorLabel = floorIndex.toString();
                } else {
                    const floorPart = numStr.slice(0, -2); const unitPart = numStr.slice(-2);
                    floorIndex = parseInt(floorPart); unitIndex = parseInt(unitPart); floorLabel = floorIndex.toString();
                }
            } else {
                isUnconventional = true; floorLabel = 'Other'; unitIndex = name.length; 
            }
        }
        return { floorIndex, floorLabel, unitIndex, isUnconventional, type };
    };

    const data = useMemo(() => {
        const projectsMap: { [id: string]: ProjectLayoutData } = {};

        state.projects.forEach(project => {
            projectsMap[project.id] = { id: project.id, name: project.name, floors: [], unconventional: [] };
        });

        state.units.forEach(unit => {
            if (!projectsMap[unit.projectId] && unit.projectId) return;
            const projectId = unit.projectId || 'unknown';
            if (!projectsMap[projectId]) {
                projectsMap[projectId] = { id: projectId, name: 'Unassigned Units', floors: [], unconventional: [] };
            }

            const parsed = parseUnit(unit.name);
            const activeAgreement = state.projectAgreements.find(pa => 
                pa.unitIds?.includes(unit.id) && pa.status === 'Active'
            );
            const client = activeAgreement ? state.contacts.find(c => c.id === activeAgreement.clientId) : null;

            const unitInvoices = state.invoices.filter(inv => inv.unitId === unit.id);
            const receivable = unitInvoices
                .filter(inv => inv.status !== InvoiceStatus.PAID)
                .reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);
            const received = unitInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

            const boxData: UnitBoxData = {
                id: unit.id,
                name: unit.name,
                projectName: projectsMap[projectId].name,
                clientName: client?.name || 'Available',
                status: activeAgreement ? 'Sold' : 'Available',
                receivable,
                received,
                floorIndex: parsed.floorIndex,
                floorLabel: parsed.floorLabel,
                unitIndex: parsed.unitIndex,
                type: parsed.type,
            };

            if (parsed.isUnconventional) {
                projectsMap[projectId].unconventional.push(boxData);
            } else {
                let floorGroup = projectsMap[projectId].floors.find(f => f.index === parsed.floorIndex);
                if (!floorGroup) {
                    floorGroup = { index: parsed.floorIndex, label: parsed.floorLabel, units: [] };
                    projectsMap[projectId].floors.push(floorGroup);
                }
                floorGroup.units.push(boxData);
            }
        });

        Object.values(projectsMap).forEach(p => {
            p.floors.sort((f1, f2) => f2.index - f1.index);
            p.floors.forEach(f => f.units.sort((u1, u2) => u1.unitIndex - u2.unitIndex));
            p.unconventional.sort((u1, u2) => u1.name.localeCompare(u2.name));
        });

        return { 
            type: 'PROJECT', 
            data: Object.values(projectsMap).filter(p => p.floors.length > 0 || p.unconventional.length > 0).sort((a, b) => a.name.localeCompare(b.name)) 
        };
    }, [state]);

    const handlePrint = () => window.print();

    const getColorClasses = (unit: UnitBoxData) => {
        if (unit.status === 'Available') return 'bg-slate-50 border-slate-300 opacity-80';
        if (unit.receivable <= 0) return 'bg-emerald-50 border-emerald-300';
        if (unit.receivable < 50000) return 'bg-orange-50 border-orange-300';
        return 'bg-red-50 border-red-400'; 
    };
    
    const renderBox = (unit: UnitBoxData) => (
        <div 
            key={unit.id} 
            className={`relative rounded border-2 shadow-sm p-2 flex flex-col justify-between transition-all h-32 overflow-hidden
                ${getColorClasses(unit)}
            `}
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-1 relative z-10">
                <div className="min-w-0">
                    <span className="font-bold text-sm text-slate-800 block truncate" title={unit.name}>{unit.name}</span>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tighter block">{unit.type}</span>
                </div>
                 {unit.status === 'Sold' && (
                    <div className="rounded-full bg-emerald-500 flex-shrink-0 mt-1 w-2 h-2" title="Sold"></div>
                 )}
            </div>
            
            {/* Content */}
            <div className="text-[10px] leading-tight space-y-0.5 flex-grow relative z-10">
                <div className={`truncate font-medium ${unit.status === 'Available' ? 'text-slate-400 italic' : 'text-slate-800'}`} title={unit.clientName}>
                    {unit.clientName}
                </div>
                <div className={`text-[9px] uppercase font-bold ${unit.status === 'Available' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {unit.status}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-1 pt-1 border-t border-slate-300/50 text-[10px] flex justify-between items-center relative z-10">
                {unit.status === 'Sold' && (
                    <>
                        <div className="flex flex-col">
                            <span className="text-slate-500 text-[9px] uppercase">Recv</span>
                            <span className="font-medium text-emerald-700">
                                {(unit.received / 1000).toFixed(0)}k
                            </span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-slate-500 text-[9px] uppercase">Due</span>
                            <span className={`font-bold ${unit.receivable > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                {(unit.receivable / 1000).toFixed(0)}k
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col space-y-4">
             <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 12.7mm;
                    }
                    body * { visibility: hidden; }
                    .printable-area, .printable-area * { visibility: visible; }
                    .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; }
                    .no-print { display: none !important; }
                    .break-inside-avoid { break-inside: avoid; }
                    /* Reset scrollbar for print */
                    .overflow-y-auto { overflow: visible !important; height: auto !important; }
                    .flex-col.h-full { height: auto !important; display: block !important; }
                    .flex-grow { flex-grow: 0 !important; }
                }
            `}</style>

            <div className="flex flex-col sm:flex-row justify-end items-center gap-4 mb-2 no-print flex-shrink-0">
                <div className="ml-auto">
                    <Button onClick={handlePrint}>Print Layout</Button>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto printable-area pb-10">
                <ReportHeader />
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">Project Visual Layout</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        <span className="inline-block w-2 h-2 bg-slate-50 border border-slate-300 mr-1"></span> Available
                        <span className="inline-block w-2 h-2 bg-emerald-50 border border-emerald-300 ml-3 mr-1"></span> Sold / Paid
                        <span className="inline-block w-2 h-2 bg-orange-50 border border-orange-300 ml-3 mr-1"></span> Low Debt
                        <span className="inline-block w-2 h-2 bg-red-50 border border-red-400 ml-3 mr-1"></span> High Debt
                    </p>
                </div>

                {data.data.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">No project units found to display.</div>
                ) : (
                    <div className="space-y-8">
                        {data.data.map((group) => (
                            <div key={group.id} className="break-inside-avoid border-2 border-slate-400 rounded-xl p-4 bg-slate-200/30">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 border-b-2 border-slate-300 pb-1 pl-1">
                                    {group.name}
                                </h3>
                                <div className="flex flex-col gap-4">
                                    {group.floors.map((floor) => (
                                        <div key={floor.index} className="flex flex-col md:flex-row gap-2">
                                            <div className="w-full md:w-12 h-8 md:h-auto flex-shrink-0 flex items-center justify-center bg-slate-300 rounded font-bold text-slate-700 text-sm shadow-inner mb-2 md:mb-0">
                                                {floor.label}
                                            </div>
                                            <div className="flex-grow grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                                {floor.units.map((unit) => renderBox(unit))}
                                            </div>
                                        </div>
                                    ))}
                                    {group.unconventional.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-dashed border-slate-300">
                                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:pl-14">
                                                  {group.unconventional.map((unit) => renderBox(unit))}
                                             </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <ReportFooter />
            </div>
        </div>
    );
};

export default ProjectLayoutReport;
