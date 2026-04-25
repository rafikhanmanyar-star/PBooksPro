
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useThemeOptional } from '../../context/ThemeContext';
import { InvoiceStatus, TransactionType } from '../../types';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import PrintButton from '../ui/PrintButton';
import ComboBox from '../ui/ComboBox';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import ProjectSellingUnitSummaryCard, { type ProjectSellingUnitCardModel } from './ProjectSellingUnitSummaryCard';
import ProjectSellingUnitQuickPanel from './ProjectSellingUnitQuickPanel';

interface UnitBoxData {
    id: string;
    name: string;
    projectName: string;
    clientName: string;
    receivable: number; // Invoiced but not paid (per-unit display; prorated when multi-unit)
    received: number;
    floorIndex: number;
    floorLabel: string;
    unitIndex: number;
    status: 'Sold' | 'Available';
    type: string;
    listPrice: number;
    sellingPrice: number;
    agreementIssueDate: string | null;
    brokerRebateDue: number; // prorated for card when multi-unit agreement
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
    const themeCtx = useThemeOptional();
    const isDark = themeCtx?.theme === 'dark';
    const { print: triggerPrint } = usePrintContext();
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

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

            // Unit-level: invoices that have this unit's id
            const unitInvoices = state.invoices.filter(inv => inv.unitId === unit.id);
            const agreementInvoices = activeAgreement
                ? state.invoices.filter(inv => inv.agreementId === activeAgreement.id)
                : [];
            const invoices = unitInvoices.length > 0 ? unitInvoices : agreementInvoices;
            const invoiceIds = new Set(invoices.map(inv => inv.id));

            // Received: sum of actual INCOME transactions (matches unit detail modal and history table)
            const incomePayments = state.transactions.filter(
                tx => tx.type === TransactionType.INCOME &&
                    (tx.unitId === unit.id || (tx.invoiceId != null && invoiceIds.has(tx.invoiceId)))
            );
            let received = incomePayments.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

            let receivable = invoices
                .filter(inv => inv.status !== InvoiceStatus.PAID)
                .reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);

            // If unit has an active agreement and we used agreement invoices, split received/receivable by unit count for multi-unit agreements
            let unitCountForProrate = 1;
            if (activeAgreement && unitInvoices.length === 0 && agreementInvoices.length > 0) {
                unitCountForProrate = activeAgreement.unitIds?.length || 1;
                if (unitCountForProrate > 1) {
                    received = Math.round(received / unitCountForProrate);
                    receivable = Math.round(receivable / unitCountForProrate);
                }
            }

            const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
            const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
            const feeCatId = brokerFeeCategory?.id;
            const rebateCatId = rebateCategory?.id;
            let brokerRebateDue = 0;
            if (activeAgreement?.rebateBrokerId && (activeAgreement.rebateAmount || 0) > 0) {
                const brokerId = activeAgreement.rebateBrokerId;
                const paidAlready = state.transactions
                    .filter(
                        tx =>
                            tx.type === TransactionType.EXPENSE &&
                            tx.contactId === brokerId &&
                            (tx.categoryId === feeCatId || tx.categoryId === rebateCatId) &&
                            tx.agreementId === activeAgreement.id
                    )
                    .reduce((sum, tx) => sum + tx.amount, 0);
                let remaining = Math.max(0, (activeAgreement.rebateAmount || 0) - paidAlready);
                if (activeAgreement && unitInvoices.length === 0 && agreementInvoices.length > 0 && unitCountForProrate > 1) {
                    remaining = Math.round(remaining / unitCountForProrate);
                }
                brokerRebateDue = remaining;
            }

            const listPrice = activeAgreement?.listPrice ?? 0;
            const sellingPrice = activeAgreement?.sellingPrice ?? 0;
            const agreementIssueDate = activeAgreement?.issueDate
                ? activeAgreement.issueDate.split('T')[0]
                : null;

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
                listPrice,
                sellingPrice,
                agreementIssueDate,
                brokerRebateDue,
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

    const projectPickerItems = useMemo(
        () => data.data.map((p) => ({ id: p.id, name: p.name })),
        [data.data]
    );

    /** Keeps grid stable on first paint; falls back to first project with units when selection is empty or stale. */
    const displayProjectId = useMemo(() => {
        const rows = data.data;
        if (rows.length === 0) return '';
        if (selectedProjectId && rows.some((p) => p.id === selectedProjectId)) return selectedProjectId;
        return rows[0].id;
    }, [data.data, selectedProjectId]);

    const visibleProjects = useMemo(() => {
        if (!displayProjectId) return [];
        const one = data.data.find((p) => p.id === displayProjectId);
        return one ? [one] : [];
    }, [data.data, displayProjectId]);

    const legendSwatch = {
        available: 'bg-app-toolbar border-app-border',
        low: isDark ? 'bg-[rgb(88,32,36)] border-ds-danger' : 'bg-red-50 border-red-400',
        high: isDark ? 'bg-[rgb(24,52,40)] border-ds-success' : 'bg-emerald-50 border-emerald-300',
    } as const;

    /** Payment heatmap: light mode red-50 → emerald-50; dark mode deep red-tint → deep green-tint */
    const getPaymentBackground = (unit: UnitBoxData): string | undefined => {
        if (unit.status !== 'Sold') return undefined;
        const total = unit.received + unit.receivable;
        const percent = total > 0 ? (unit.received / total) : 1;
        const p = Math.max(0, Math.min(1, percent));
        if (isDark) {
            const r0 = 88, g0 = 32, b0 = 36;
            const r1 = 24, g1 = 52, b1 = 40;
            const r = Math.round(r0 + (r1 - r0) * p);
            const g = Math.round(g0 + (g1 - g0) * p);
            const b = Math.round(b0 + (b1 - b0) * p);
            return `rgb(${r},${g},${b})`;
        }
        const r = Math.round(254 - 18 * p);
        const g = Math.round(242 + 11 * p);
        const b = Math.round(242 + 3 * p);
        return `rgb(${r},${g},${b})`;
    };

    const getColorClasses = (unit: UnitBoxData) => {
        if (unit.status === 'Available') return 'bg-app-toolbar/70 border-app-border';
        if (unit.status === 'Sold') {
            const total = unit.received + unit.receivable;
            const percent = total > 0 ? (unit.received / total) : 1;
            if (percent >= 1) return 'border-ds-success';
            if (percent >= 0.5) return 'border-ds-warning';
            return 'border-ds-danger';
        }
        if (unit.receivable <= 0) return 'bg-[color:var(--badge-paid-bg)] border-ds-success';
        if (unit.receivable < 50000) return 'bg-[color:var(--badge-partial-bg)] border-ds-warning';
        return 'bg-[color:var(--badge-unpaid-bg)] border-ds-danger';
    };
    
    const handleCardClick = (unit: UnitBoxData) => {
        setSelectedUnitId(unit.id);
    };

    const toCardModel = (u: UnitBoxData): ProjectSellingUnitCardModel => ({
        id: u.id,
        name: u.name,
        type: u.type,
        clientName: u.clientName,
        status: u.status,
        listPrice: u.listPrice,
        sellingPrice: u.sellingPrice,
        agreementIssueDate: u.agreementIssueDate,
        invoiceDue: u.receivable,
        brokerRebateDue: u.brokerRebateDue,
        totalReceived: u.received,
    });

    const renderBox = (unit: UnitBoxData) => {
        const paymentBg = getPaymentBackground(unit);
        return (
            <ProjectSellingUnitSummaryCard
                key={unit.id}
                unit={toCardModel(unit)}
                className={getColorClasses(unit)}
                style={paymentBg ? { backgroundColor: paymentBg } : undefined}
                onClick={() => handleCardClick(unit)}
            />
        );
    };

    return (
        <div className="h-full flex flex-col space-y-4 bg-background">
             <style>{STANDARD_PRINT_STYLES}</style>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-2 no-print flex-shrink-0">
                <div className="w-full sm:w-80 min-w-0">
                    <label htmlFor="project-visual-layout-project" className="block text-sm font-medium text-app-muted mb-1">
                        Project
                    </label>
                    <ComboBox
                        id="project-visual-layout-project"
                        label={undefined}
                        items={projectPickerItems}
                        selectedId={displayProjectId}
                        onSelect={(item) => setSelectedProjectId(item?.id ?? '')}
                        placeholder="Search project…"
                        allowAddNew={false}
                        compact
                        entityType="project"
                    />
                </div>
                <div className="sm:ml-auto sm:self-end">
                    <PrintButton onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })} label="Print Layout" />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto printable-area pb-10" id="printable-area">
                <ReportHeader />
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-app-text">Project Visual Layout</h2>
                    <p className="text-xs text-app-muted mt-1 flex flex-wrap justify-center items-center gap-x-1 gap-y-1">
                        <span className={`inline-block w-2 h-2 rounded-sm border mr-1 ${legendSwatch.available}`}></span> Available
                        <span className={`inline-block w-2 h-2 rounded-sm border ml-3 mr-1 ${legendSwatch.low}`}></span> 0% received
                        <span className={`inline-block w-2 h-2 rounded-sm border ml-3 mr-1 ${legendSwatch.high}`}></span> 100% received
                        <span className="text-app-muted ml-2 max-w-md">
                            (Sold: background shifts {isDark ? 'red-tint → green-tint' : 'light red → light green'} by payment %)
                        </span>
                    </p>
                </div>

                {data.data.length === 0 ? (
                    <div className="text-center py-10 text-app-muted">No project units found to display.</div>
                ) : (
                    <div className="space-y-8">
                        {visibleProjects.map((group) => (
                            <div key={group.id} className="break-inside-avoid border-2 border-app-border rounded-xl p-4 bg-app-card shadow-ds-card">
                                <h3 className="text-lg font-bold text-app-text mb-4 border-b border-app-border pb-2 pl-1">
                                    {group.name}
                                </h3>
                                <div className="flex flex-col gap-4">
                                    {group.floors.map((floor) => (
                                        <div key={floor.index} className="flex flex-col md:flex-row gap-2">
                                            <div className="w-full md:w-12 h-8 md:h-auto flex-shrink-0 flex items-center justify-center bg-app-toolbar border border-app-border rounded font-bold text-app-text text-sm shadow-inner mb-2 md:mb-0">
                                                {floor.label}
                                            </div>
                                            <div className="flex-grow grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                                {floor.units.map((unit) => renderBox(unit))}
                                            </div>
                                        </div>
                                    ))}
                                    {group.unconventional.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-dashed border-app-border">
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

            {selectedUnitId && (
                <ProjectSellingUnitQuickPanel
                    isOpen={!!selectedUnitId}
                    onClose={() => setSelectedUnitId(null)}
                    unitId={selectedUnitId}
                />
            )}
        </div>
    );
};

export default ProjectLayoutReport;
