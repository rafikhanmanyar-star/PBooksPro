
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY } from '../../constants';
import { InvoiceStatus, TransactionType, InvoiceType, RentalAgreementStatus } from '../../types';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import PropertyHistoryModal from './PropertyHistoryModal';

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

interface PropertyBoxData {
    id: string;
    name: string;
    ownerName: string;
    tenantName: string;
    receivable: number;
    payoutDue: number;
    floorIndex: number;
    floorLabel: string;
    unitIndex: number;
    status: 'Occupied' | 'Vacant';
    type: string; // APT, OFF, SHOP, etc.
    isExpiringSoon: boolean;
    isCurrentMonthRentPaid: boolean;
}

interface BuildingData {
    code: string;
    floors: {
        index: number;
        label: string;
        units: PropertyBoxData[];
    }[];
    unconventional: PropertyBoxData[];
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

const PropertyLayoutReport: React.FC = () => {
    const { state } = useAppContext();
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedProperty, setSelectedProperty] = useState<{ id: string, name: string } | null>(null);

    const buildingItems = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

    // --- Helper: Parse Property Name ---
    const parseProperty = (name: string, id: string): { buildingCode: string, floorIndex: number, floorLabel: string, unitIndex: number, isUnconventional: boolean, type: string } => {
        const cleanName = name.trim().toUpperCase();
        
        // Attempt to determine type
        let type = 'UNIT';
        if (cleanName.includes('OFF')) type = 'OFFICE';
        else if (cleanName.includes('APT')) type = 'APARTMENT';
        else if (cleanName.includes('SHOP') || cleanName.includes('SH')) type = 'SHOP';
        else if (cleanName.includes('GD')) type = 'GODOWN';

        // Fallback for very short names
        if (cleanName.length < 3) {
            return { buildingCode: 'Unknown', floorIndex: 0, floorLabel: '?', unitIndex: 0, isUnconventional: true, type };
        }

        const buildingCode = cleanName.slice(-2);
        let remainder = cleanName.slice(0, -2); // Remove building code

        // Strip standard prefixes to clean up the string for parsing numbers
        remainder = remainder.replace(/^(OFF|APT|UNIT|SHOP|SH|GD|-|\s)+/g, '');

        let floorIndex = 0;
        let floorLabel = 'G';
        let unitIndex = 0;
        let isUnconventional = false;

        if (remainder.startsWith('LG')) {
            floorIndex = -1;
            floorLabel = 'LG';
            const unitPart = remainder.replace('LG', '').replace(/[^0-9]/g, '');
            unitIndex = parseInt(unitPart) || 0;
        } else if (remainder.startsWith('G')) {
            floorIndex = 0;
            floorLabel = 'G';
            const unitPart = remainder.replace('G', '').replace(/[^0-9]/g, '');
            unitIndex = parseInt(unitPart) || 0;
        } else {
            // Numeric handling for standard floors
            const numberMatch = remainder.match(/^(\d+)/);
            
            if (numberMatch) {
                const numericVal = parseInt(numberMatch[1]);
                if (numericVal >= 100) {
                    floorIndex = Math.floor(numericVal / 100);
                    unitIndex = numericVal % 100;
                } else {
                    floorIndex = Math.floor(numericVal / 10);
                    unitIndex = numericVal % 10;
                }
                floorLabel = floorIndex === 0 ? 'G' : floorIndex.toString();
            } else {
                isUnconventional = true;
                floorLabel = 'Other';
                unitIndex = name.length; 
            }
        }

        return { buildingCode, floorIndex, floorLabel, unitIndex, isUnconventional, type };
    };

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
        // --- RENTAL MODE ---
        // If properties exist, prioritize Rental View. 
        
        if (state.properties.length > 0) {
            const buildingsMap: { [code: string]: BuildingData } = {};
            const today = new Date();
            today.setHours(0,0,0,0);
            
            // Use local time for current month string to align with user expectation
            const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

            let propertiesToProcess = state.properties;
            if (selectedBuildingId !== 'all') {
                propertiesToProcess = state.properties.filter(p => p.buildingId === selectedBuildingId);
            }

            propertiesToProcess.forEach(prop => {
                const parsed = parseProperty(prop.name, prop.id);
                
                // Financials
                const receivable = state.invoices
                    .filter(inv => inv.propertyId === prop.id && inv.status !== InvoiceStatus.PAID)
                    .reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);

                const propIncome = state.transactions
                    .filter(tx => tx.propertyId === prop.id && tx.type === TransactionType.INCOME)
                    .reduce((sum, tx) => sum + tx.amount, 0);
                
                const propExpense = state.transactions
                    .filter(tx => tx.propertyId === prop.id && tx.type === TransactionType.EXPENSE)
                    .reduce((sum, tx) => sum + tx.amount, 0);
                
                const payoutDue = Math.max(0, propIncome - propExpense);

                // Owner & Tenant
                const owner = state.contacts.find(c => c.id === prop.ownerId);
                const activeAgreement = state.rentalAgreements.find(ra => ra.propertyId === prop.id && ra.status === RentalAgreementStatus.ACTIVE);
                const tenant = activeAgreement ? state.contacts.find(c => c.id === activeAgreement.tenantId) : null;
                
                // Check all invoices for the current month
                const currentMonthInvoices = state.invoices.filter(inv => 
                    inv.propertyId === prop.id && 
                    inv.invoiceType === InvoiceType.RENTAL &&
                    (
                        (inv.rentalMonth === currentMonthStr) || 
                        (inv.issueDate.startsWith(currentMonthStr))
                    )
                );
                
                // Mark as PAID only if invoices exist and all are fully paid (balance near 0)
                const isCurrentMonthRentPaid = currentMonthInvoices.length > 0 && 
                    currentMonthInvoices.every(inv => (inv.amount - inv.paidAmount) <= 0.01);

                let isExpiringSoon = false;
                if (activeAgreement) {
                    const endDate = new Date(activeAgreement.endDate);
                    const timeDiff = endDate.getTime() - today.getTime();
                    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                    if (daysDiff <= 30) {
                        isExpiringSoon = true;
                    }
                }

                const boxData: PropertyBoxData = {
                    id: prop.id,
                    name: prop.name,
                    ownerName: owner?.name || 'Unknown',
                    tenantName: tenant?.name || 'Vacant',
                    status: activeAgreement ? 'Occupied' : 'Vacant',
                    receivable,
                    payoutDue,
                    floorIndex: parsed.floorIndex,
                    floorLabel: parsed.floorLabel,
                    unitIndex: parsed.unitIndex,
                    type: parsed.type,
                    isExpiringSoon,
                    isCurrentMonthRentPaid
                };

                if (!buildingsMap[parsed.buildingCode]) {
                    buildingsMap[parsed.buildingCode] = { code: parsed.buildingCode, floors: [], unconventional: [] };
                }

                if (parsed.isUnconventional) {
                    buildingsMap[parsed.buildingCode].unconventional.push(boxData);
                } else {
                    let floorGroup = buildingsMap[parsed.buildingCode].floors.find(f => f.index === parsed.floorIndex);
                    if (!floorGroup) {
                        floorGroup = { index: parsed.floorIndex, label: parsed.floorLabel, units: [] };
                        buildingsMap[parsed.buildingCode].floors.push(floorGroup);
                    }
                    floorGroup.units.push(boxData);
                }
            });

            const sortedBuildings = Object.values(buildingsMap).sort((a, b) => a.code.localeCompare(b.code));

            sortedBuildings.forEach(b => {
                b.floors.sort((f1, f2) => f2.index - f1.index);
                b.floors.forEach(f => f.units.sort((u1, u2) => u1.unitIndex - u2.unitIndex));
                b.unconventional.sort((u1, u2) => u1.name.localeCompare(u2.name));
            });

            return { type: 'RENTAL', data: sortedBuildings };
        } 
        
        // --- PROJECT MODE ---
        else {
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
        }
    }, [state, selectedBuildingId]);

    const handlePrint = () => window.print();

    const getColorClasses = (unit: any, mode: 'RENTAL' | 'PROJECT') => {
        if (mode === 'RENTAL') {
            if (unit.receivable <= 0) return 'bg-emerald-50 border-emerald-300'; 
            if (unit.receivable < 10000) return 'bg-orange-50 border-orange-300'; 
            return 'bg-red-50 border-red-400'; 
        } else {
            if (unit.status === 'Available') return 'bg-slate-50 border-slate-300 opacity-80';
            if (unit.receivable <= 0) return 'bg-emerald-50 border-emerald-300';
            if (unit.receivable < 50000) return 'bg-orange-50 border-orange-300';
            return 'bg-red-50 border-red-400'; 
        }
    };

    const handleCardClick = (unit: any) => {
        setSelectedProperty({ id: unit.id, name: unit.name });
    };
    
    const renderBox = (unit: any, mode: 'RENTAL' | 'PROJECT') => (
        <div 
            key={unit.id} 
            onClick={() => handleCardClick(unit)}
            className={`relative rounded border-2 shadow-sm p-2 flex flex-col justify-between transition-all h-32 overflow-hidden cursor-pointer hover:shadow-md hover:scale-[1.02]
                ${getColorClasses(unit, mode)}
            `}
            title="Click to view details"
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-1 relative z-10">
                <div className="min-w-0">
                    <span className="font-bold text-sm text-slate-800 block truncate" title={unit.name}>{unit.name}</span>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tighter block">{unit.type}</span>
                </div>
                 {mode === 'RENTAL' && unit.status === 'Occupied' && (
                    <div 
                        className={`rounded-full bg-emerald-500 flex-shrink-0 mt-1 transition-all duration-300 
                            ${unit.isExpiringSoon ? 'w-4 h-4 animate-pulse ring-2 ring-rose-500' : 'w-2 h-2'}
                        `} 
                        title={unit.isExpiringSoon ? "Agreement Expiring Soon!" : "Occupied"}
                    ></div>
                 )}
                 {mode === 'PROJECT' && unit.status === 'Sold' && (
                    <div className="rounded-full bg-emerald-500 flex-shrink-0 mt-1 w-2 h-2" title="Sold"></div>
                 )}
            </div>
            
            {mode === 'RENTAL' && unit.isCurrentMonthRentPaid && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-20 pointer-events-none select-none z-0">
                    <div className="border-4 border-emerald-600 text-emerald-600 font-black text-3xl px-2 py-1 rounded rotate-[-15deg] tracking-widest">
                        PAID
                    </div>
                </div>
            )}
            
            {/* Content */}
            <div className="text-[10px] leading-tight space-y-0.5 flex-grow relative z-10">
                {mode === 'RENTAL' ? (
                    <>
                        <div className="truncate text-slate-600" title={`Owner: ${unit.ownerName}`}>Own: {unit.ownerName}</div>
                        <div className={`truncate font-medium ${unit.status === 'Vacant' ? 'text-red-600' : 'text-slate-800'}`} title={`Tenant: ${unit.tenantName}`}>Ten: {unit.tenantName}</div>
                    </>
                ) : (
                    <>
                        <div className={`truncate font-medium ${unit.status === 'Available' ? 'text-slate-400 italic' : 'text-slate-800'}`} title={unit.clientName}>
                            {unit.clientName}
                        </div>
                        <div className={`text-[9px] uppercase font-bold ${unit.status === 'Available' ? 'text-slate-400' : 'text-slate-500'}`}>
                            {unit.status}
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="mt-1 pt-1 border-t border-slate-300/50 text-[10px] flex justify-between items-center relative z-10">
                {mode === 'RENTAL' ? (
                    <>
                        <div className="flex flex-col">
                            <span className="text-slate-500 text-[9px] uppercase">A/R</span>
                            <span className={`font-bold ${unit.receivable > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {unit.receivable > 0 ? (unit.receivable / 1000).toFixed(1) + 'k' : '0'}
                            </span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-slate-500 text-[9px] uppercase">Payout</span>
                            <span className="font-medium text-slate-700">
                                {unit.payoutDue > 0 ? (unit.payoutDue / 1000).toFixed(1) + 'k' : '0'}
                            </span>
                        </div>
                    </>
                ) : (
                    unit.status === 'Sold' && (
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
                    )
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
             <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 12.7mm;
                    }
                    body * { visibility: hidden; }
                    .printable-area, .printable-area * { visibility: visible; }
                    .printable-area { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none; }
                    .break-inside-avoid { break-inside: avoid; }
                }
            `}</style>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4 no-print">
                {data.type === 'RENTAL' && (
                    <div className="w-full sm:w-64">
                        <ComboBox
                            label="Filter by Building"
                            items={buildingItems}
                            selectedId={selectedBuildingId}
                            onSelect={(item) => setSelectedBuildingId(item?.id || 'all')}
                            allowAddNew={false}
                        />
                    </div>
                )}
                <div className="ml-auto">
                    <Button onClick={handlePrint}>Print Layout</Button>
                </div>
            </div>

            <div className="printable-area">
                <ReportHeader />
                <div className="text-center mb-4">
                    <h2 className="text-2xl font-bold text-slate-800">{data.type === 'RENTAL' ? 'Property' : 'Project'} Visual Layout</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        <span className="inline-block w-2 h-2 bg-emerald-50 border border-emerald-300 mr-1"></span> Good / Paid
                        <span className="inline-block w-2 h-2 bg-orange-50 border border-orange-300 ml-3 mr-1"></span> Low Debt
                        <span className="inline-block w-2 h-2 bg-red-50 border border-red-400 ml-3 mr-1"></span> High Debt
                    </p>
                </div>

                {data.data.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">No project units found to display.</div>
                ) : (
                    <div className="space-y-8">
                        {data.data.map((group) => (
                            <div key={group.code || group.id} className="break-inside-avoid border-2 border-slate-400 rounded-xl p-4 bg-slate-200/30">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 border-b-2 border-slate-300 pb-1 pl-1">
                                    {data.type === 'RENTAL' ? `Building ${group.code}` : group.name}
                                </h3>
                                <div className="flex flex-col gap-4">
                                    {group.floors.map((floor: any) => (
                                        <div key={floor.index} className="flex flex-col md:flex-row gap-2">
                                            <div className="w-full md:w-12 h-8 md:h-auto flex-shrink-0 flex items-center justify-center bg-slate-300 rounded font-bold text-slate-700 text-sm shadow-inner mb-2 md:mb-0">
                                                {floor.label}
                                            </div>
                                            <div className="flex-grow grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                                {floor.units.map((unit: any) => renderBox(unit, data.type as any))}
                                            </div>
                                        </div>
                                    ))}
                                    {group.unconventional.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-dashed border-slate-300">
                                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:pl-14">
                                                  {group.unconventional.map((unit: any) => renderBox(unit, data.type as any))}
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

            {selectedProperty && (
                <PropertyHistoryModal 
                    isOpen={!!selectedProperty} 
                    onClose={() => setSelectedProperty(null)} 
                    propertyId={selectedProperty.id} 
                    propertyName={selectedProperty.name} 
                />
            )}
        </div>
    );
};

export default PropertyLayoutReport;
