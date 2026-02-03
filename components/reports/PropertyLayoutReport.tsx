
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY, ICONS } from '../../constants';
import { InvoiceStatus, TransactionType, InvoiceType, RentalAgreementStatus } from '../../types';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import PrintButton from '../ui/PrintButton';
import ComboBox from '../ui/ComboBox';
import PropertyHistoryModal from './PropertyHistoryModal';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

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
    securityDue: number;
    lastUpdated: string;
    agreementEndDate: string | null;
    daysUntilExpiry: number | null;
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
    const { print: triggerPrint } = usePrintContext();
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
            today.setHours(0, 0, 0, 0);

            // Use local time for current month string to align with user expectation
            const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

            let propertiesToProcess = state.properties;
            if (selectedBuildingId !== 'all') {
                propertiesToProcess = state.properties.filter(p => p.buildingId === selectedBuildingId);
            }

            propertiesToProcess.forEach(prop => {
                const parsed = parseProperty(prop.name, prop.id);

                // Financials
                const propertyInvoices = state.invoices.filter(inv => inv.propertyId === prop.id);
                const receivable = propertyInvoices
                    .filter(inv => inv.status !== InvoiceStatus.PAID)
                    .reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);

                // Calculate security deposit due from unpaid invoices
                const securityDue = propertyInvoices
                    .filter(inv => inv.status !== InvoiceStatus.PAID && inv.securityDepositCharge)
                    .reduce((sum, inv) => {
                        const outstanding = inv.amount - inv.paidAmount;
                        const securityRatio = inv.securityDepositCharge / inv.amount;
                        return sum + (outstanding * securityRatio);
                    }, 0);

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
                const tenant = activeAgreement ? state.contacts.find(c => c.id === activeAgreement.contactId) : null;

                // Calculate last updated date
                const propertyTransactions = state.transactions.filter(tx => tx.propertyId === prop.id);
                const transactionDates = propertyTransactions.map(tx => tx.date);
                const invoiceDates = propertyInvoices.map(inv => inv.issueDate);
                const agreementDates = activeAgreement ? [activeAgreement.endDate] : [];
                const allDates = [...transactionDates, ...invoiceDates, ...agreementDates];
                const lastUpdated = allDates.length > 0
                    ? allDates.sort().reverse()[0]
                    : new Date().toISOString().split('T')[0];

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
                let agreementEndDate: string | null = null;
                let daysUntilExpiry: number | null = null;

                if (activeAgreement) {
                    const endDate = new Date(activeAgreement.endDate);
                    const timeDiff = endDate.getTime() - today.getTime();
                    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                    if (daysDiff <= 30) {
                        isExpiringSoon = true;
                    }
                    agreementEndDate = activeAgreement.endDate;
                    daysUntilExpiry = daysDiff;
                }

                const boxData: PropertyBoxData = {
                    id: prop.id,
                    name: prop.name,
                    ownerName: owner?.name || 'Unknown',
                    tenantName: tenant?.name || 'Vacant',
                    status: activeAgreement ? 'Occupied' : 'Vacant',
                    receivable,
                    payoutDue,
                    securityDue,
                    lastUpdated,
                    agreementEndDate,
                    daysUntilExpiry,
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

            // Calculate maximum payoutDue for color saturation
            let maxPayoutDue = 0;
            sortedBuildings.forEach(b => {
                b.floors.forEach(f => {
                    f.units.forEach(u => {
                        if (u.payoutDue > maxPayoutDue) maxPayoutDue = u.payoutDue;
                    });
                });
                b.unconventional.forEach(u => {
                    if (u.payoutDue > maxPayoutDue) maxPayoutDue = u.payoutDue;
                });
            });

            return { type: 'RENTAL', data: sortedBuildings, maxPayoutDue };
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


    const getStatusBadge = (unit: PropertyBoxData) => {
        if (unit.isExpiringSoon) return { text: 'COMING', color: 'bg-orange-500' };
        if (unit.status === 'Occupied') return { text: 'ACTIVE', color: 'bg-emerald-500' };
        return { text: 'VACANT', color: 'bg-slate-400' };
    };

    const getBackgroundColorStyle = (payoutDue: number, maxPayoutDue: number): React.CSSProperties => {
        if (maxPayoutDue === 0 || payoutDue === 0) {
            return {};
        }

        // Calculate saturation ratio (0 to 1)
        const ratio = Math.min(payoutDue / maxPayoutDue, 1);

        // Map ratio to opacity for indigo background
        // Higher payoutDue = more saturated (higher opacity) color
        // Using opacity from 0.05 (very light) to 0.25 (more visible) for subtle background
        const opacity = 0.05 + (ratio * 0.20); // Range: 0.05 to 0.25

        return {
            backgroundColor: `rgba(99, 102, 241, ${opacity})` // indigo-500 with variable opacity
        };
    };

    const getColorClasses = (unit: any, mode: 'RENTAL' | 'PROJECT') => {
        if (mode === 'RENTAL') {
            // Use status-based border colors
            if (unit.isExpiringSoon) return 'border-orange-500';
            if (unit.status === 'Occupied') return 'border-emerald-500';
            return 'border-slate-400';
        } else {
            if (unit.status === 'Available') return 'border-slate-300';
            if (unit.receivable <= 0) return 'border-emerald-500';
            if (unit.receivable < 50000) return 'border-orange-500';
            return 'border-red-500';
        }
    };

    const handleCardClick = (unit: any) => {
        setSelectedProperty({ id: unit.id, name: unit.name });
    };

    const renderBox = (unit: any, mode: 'RENTAL' | 'PROJECT', maxPayoutDue: number = 0) => {
        const statusBadge = mode === 'RENTAL' ? getStatusBadge(unit) : null;
        const backgroundColorStyle = mode === 'RENTAL' ? getBackgroundColorStyle(unit.payoutDue || 0, maxPayoutDue) : {};

        return (
            <div
                key={unit.id}
                onClick={() => handleCardClick(unit)}
                className={`relative rounded-xl bg-white border shadow-sm p-2 flex flex-col justify-between transition-all min-h-[12rem] w-64 flex-shrink-0 cursor-pointer hover:shadow-md hover:scale-[1.02]
                    ${getColorClasses(unit, mode)}
                `}
                style={backgroundColorStyle}
                title="Click to view details"
            >
                {/* Header with Status Badge */}
                <div className="flex justify-between items-start mb-1 relative z-10">
                    <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs text-slate-900 block truncate" title={unit.name}>{unit.name}</span>
                    </div>
                    {mode === 'RENTAL' && statusBadge && (
                        <div
                            className={`${statusBadge.color} text-white text-[8px] font-bold px-1 py-0.5 rounded flex-shrink-0 ml-1.5`}
                            title={statusBadge.text}
                        >
                            {statusBadge.text}
                        </div>
                    )}
                    {mode === 'PROJECT' && unit.status === 'Sold' && (
                        <div className="rounded-full bg-emerald-500 flex-shrink-0 mt-1 w-2 h-2" title="Sold"></div>
                    )}
                </div>

                {mode === 'RENTAL' && unit.isCurrentMonthRentPaid && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-20 pointer-events-none select-none z-0">
                        <div className="border-4 border-emerald-600 text-emerald-600 font-black text-2xl px-2 py-1 rounded rotate-[-15deg] tracking-widest">
                            PAID
                        </div>
                    </div>
                )}

                {/* Owner/Tenant Section */}
                {mode === 'RENTAL' && (
                    <div className="text-[9px] leading-tight space-y-0.5 mb-1 relative z-10">
                        <div className="flex items-center gap-0.5 truncate text-slate-700" title={`Owner: ${unit.ownerName}`}>
                            <svg className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                            </svg>
                            <span className="truncate">{unit.ownerName}</span>
                        </div>
                        <div className={`flex items-center gap-0.5 truncate font-medium ${unit.status === 'Vacant' ? 'text-red-600' : 'text-slate-800'}`} title={`Tenant: ${unit.tenantName}`}>
                            <span className="text-[8px] font-semibold text-slate-500 flex-shrink-0">T:</span>
                            <span className="truncate">{unit.tenantName}</span>
                        </div>
                    </div>
                )}

                {mode === 'PROJECT' && (
                    <div className="text-[9px] leading-tight space-y-0.5 mb-1 relative z-10">
                        <div className={`truncate font-medium ${unit.status === 'Available' ? 'text-slate-400 italic' : 'text-slate-800'}`} title={unit.clientName}>
                            {unit.clientName}
                        </div>
                        <div className={`text-[8px] uppercase font-bold ${unit.status === 'Available' ? 'text-slate-400' : 'text-slate-500'}`}>
                            {unit.status}
                        </div>
                    </div>
                )}

                {/* Agreement Expiry Indicator */}
                {mode === 'RENTAL' && unit.agreementEndDate && unit.daysUntilExpiry !== null && (
                    <div className={`text-[8px] font-semibold mb-0.5 relative z-10 ${unit.daysUntilExpiry < 0
                            ? 'text-red-600'
                            : unit.daysUntilExpiry <= 30
                                ? 'text-orange-600 animate-pulse'
                                : 'text-slate-500'
                        }`}>
                        {unit.daysUntilExpiry < 0
                            ? `Expired ${Math.abs(unit.daysUntilExpiry)}d ago`
                            : `Expires in ${unit.daysUntilExpiry}d`
                        }
                    </div>
                )}

                {/* Divider */}
                <div className="border-t border-slate-200 my-1"></div>

                {/* Financial Section */}
                <div className="text-[9px] flex justify-between items-start relative z-10">
                    {mode === 'RENTAL' ? (
                        <>
                            <div className="flex flex-col">
                                <div className="flex flex-col mb-0.5">
                                    <span className="text-red-600 text-[8px] font-semibold uppercase">RENT DUE</span>
                                    <span className="font-bold text-sm text-slate-900 leading-tight">
                                        {unit.receivable > 0 ? (unit.receivable / 1000).toFixed(1) + 'k' : '0'}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-red-600 text-[8px] font-semibold uppercase">SEC. DUE</span>
                                    <span className="font-bold text-sm text-slate-900 leading-tight">
                                        {unit.securityDue > 0 ? (unit.securityDue / 1000).toFixed(1) + 'k' : '0'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col text-right">
                                <div className="flex flex-col">
                                    <span className="text-slate-700 text-[8px] font-semibold uppercase">ACCT PAY</span>
                                    <span className={`text-[8px] font-semibold uppercase ${unit.status === 'Vacant' ? 'text-slate-700' : 'text-blue-600'}`}>
                                        {unit.status === 'Vacant' ? 'OWNR PAY' : 'ACCT PAY'}
                                    </span>
                                    <span className="font-bold text-sm text-blue-600 leading-tight">
                                        {unit.payoutDue > 0 ? (unit.payoutDue / 1000).toFixed(1) + 'k' : '0'}
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        unit.status === 'Sold' && (
                            <>
                                <div className="flex flex-col">
                                    <span className="text-slate-500 text-[8px] uppercase">Recv</span>
                                    <span className="font-medium text-emerald-700 text-xs">
                                        {(unit.received / 1000).toFixed(0)}k
                                    </span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="text-slate-500 text-[8px] uppercase">Due</span>
                                    <span className={`font-bold text-xs ${unit.receivable > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                        {(unit.receivable / 1000).toFixed(0)}k
                                    </span>
                                </div>
                            </>
                        )
                    )}
                </div>

                {/* Last Updated Timestamp */}
                {mode === 'RENTAL' && unit.lastUpdated && (
                    <div className="text-[7px] text-slate-400 text-center mt-1 pt-0.5 border-t border-slate-100 relative z-10">
                        Last: {unit.lastUpdated.split('T')[0]}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 h-full overflow-y-auto pr-2 pb-20">
            <style>{STANDARD_PRINT_STYLES}</style>

            {/* Custom Toolbar - All controls in first row */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print mb-4">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Report Title */}
                    <h2 className="text-xl font-bold text-slate-800 mr-4">
                        {data.type === 'RENTAL' ? 'Property' : 'Project'} Visual Layout
                    </h2>
                    {/* Legend - Only for Rental */}
                    {data.type === 'RENTAL' && (
                        <div className="flex items-center gap-4 text-xs text-slate-600 border-l border-slate-300 pl-4">
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 bg-white border-2 border-emerald-500 rounded"></span>
                                <span>Good / Paid</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 bg-white border-2 border-orange-500 rounded"></span>
                                <span>Low Debt</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 bg-white border-2 border-red-500 rounded"></span>
                                <span>High Debt</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 bg-white border-2 border-slate-400 rounded"></span>
                                <span>Vacant</span>
                            </div>
                        </div>
                    )}
                    {/* Building Filter - Only for Rental */}
                    {data.type === 'RENTAL' && (
                        <div className="w-48 flex-shrink-0">
                            <ComboBox
                                items={buildingItems}
                                selectedId={selectedBuildingId}
                                onSelect={(item) => setSelectedBuildingId(item?.id || 'all')}
                                allowAddNew={false}
                                placeholder="Filter Building"
                            />
                        </div>
                    )}
                    {/* Actions Group - pushed to right */}
                    <div className="ml-auto"></div>
                    <div className="flex items-center gap-2">
                        <PrintButton
                            variant="secondary"
                            size="sm"
                            onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                            className="whitespace-nowrap"
                            label="Print Layout"
                        />
                    </div>
                </div>
            </div>

            <div className="printable-area" id="printable-area">
                <ReportHeader />

                {data.data.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">No project units found to display.</div>
                ) : (
                    <div className="space-y-8">
                        {data.data.map((group) => (
                            <div key={group.code || group.id} className="break-inside-avoid border-2 border-slate-400 rounded-xl p-4 bg-slate-200/30">
                                <h3 className="text-lg font-bold text-indigo-700 mb-4 border-b-2 border-indigo-200 pb-1 pl-1 bg-indigo-50 rounded-lg px-3 py-2 shadow-md">
                                    {data.type === 'RENTAL' ? `Building ${group.code}` : group.name}
                                </h3>
                                <div className="flex flex-col gap-4">
                                    {group.floors.map((floor: any) => (
                                        <div key={floor.index} className="flex flex-col md:flex-row gap-2">
                                            <div className="w-full md:w-12 h-8 md:h-auto flex-shrink-0 flex items-center justify-center bg-indigo-600 text-white rounded-lg font-bold text-sm shadow-lg mb-2 md:mb-0">
                                                {floor.label}
                                            </div>
                                            <div className="flex-grow flex overflow-x-auto pb-4 gap-3">
                                                {floor.units.map((unit: any) => renderBox(unit, data.type as any, data.maxPayoutDue || 0))}
                                            </div>
                                        </div>
                                    ))}
                                    {group.unconventional.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-dashed border-slate-300">
                                            <div className="flex overflow-x-auto pb-4 gap-3 md:pl-14">
                                                {group.unconventional.map((unit: any) => renderBox(unit, data.type as any, data.maxPayoutDue || 0))}
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
