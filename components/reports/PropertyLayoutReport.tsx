
import React, { useMemo, useState, Suspense, lazy, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../../context/AppContext';
import { queryKeys } from '../../hooks/queries/queryKeys';
import { selectRentalInvoicesForCache } from '../../hooks/queries/rentalInvoicesCache';
import { cancelScheduledIdle, scheduleIdleWork } from '../../utils/interactionScheduling';
import { CURRENCY } from '../../constants';
import { Invoice, InvoiceStatus, TransactionType, InvoiceType, RentalAgreementStatus } from '../../types';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import PrintButton from '../ui/PrintButton';
import ComboBox from '../ui/ComboBox';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { currentMonthYyyyMm, toLocalDateString } from '../../utils/dateUtils';
import RentalPropertySummaryCard from './RentalPropertySummaryCard';

const PropertyInvoicePickModal = lazy(() => import('./PropertyInvoicePickModal'));
const RentalPaymentModal = lazy(() => import('../invoices/RentalPaymentModal'));
const ManualServiceChargeModal = lazy(() => import('../rentalManagement/ManualServiceChargeModal'));
const CreateRentalInvoiceModal = lazy(() => import('../rentalManagement/CreateRentalInvoiceModal'));
const OwnerPayoutModal = lazy(() => import('../payouts/OwnerPayoutModal'));
const BrokerPayoutModal = lazy(() => import('../payouts/BrokerPayoutModal'));
const PropertyQuickManagementPanel = lazy(() => import('./PropertyQuickManagementPanel'));

const modalSuspenseFallback = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/10 text-app-muted text-xs">Loading…</div>
);

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
    monthlyRent: number;
    securityDepositAmount: number;
    agreementStartDate: string | null;
    monthlyServiceCharge: number;
    serviceChargeDeductedThisMonth: boolean;
    hasUnpaidRental: boolean;
    hasUnpaidSecurity: boolean;
    canDeductServiceCharges: boolean;
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
    const queryClient = useQueryClient();
    const { print: triggerPrint } = usePrintContext();
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [invoicePick, setInvoicePick] = useState<{
        propertyId: string;
        propertyName: string;
        type: InvoiceType.RENTAL | InvoiceType.SECURITY_DEPOSIT | 'ALL';
    } | null>(null);
    const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
    const [mscForPropertyId, setMscForPropertyId] = useState<string | null>(null);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
    const [createInvoiceForPropertyId, setCreateInvoiceForPropertyId] = useState<string | null>(null);
    const [ownerPayoutState, setOwnerPayoutState] = useState<{
        owner: typeof state.contacts[0] | null;
        balanceDue: number;
        payoutType: 'Rent' | 'Security';
        propertyBreakdown: { propertyId: string; propertyName: string; balanceDue: number }[];
        tenant?: typeof state.contacts[0] | null;
        tenantUnpaidAmount?: number;
    } | null>(null);
    const [brokerPayoutState, setBrokerPayoutState] = useState<{
        broker: typeof state.contacts[0] | null;
        balanceDue: number;
        propertyId?: string;
    } | null>(null);

    /** Warm rental invoices query while user is on Visual Layout so Invoices view opens faster. */
    useEffect(() => {
        const idleId = scheduleIdleWork(() => {
            const slice = selectRentalInvoicesForCache(state.invoices);
            queryClient.setQueryData(queryKeys.rental.invoicesList(), slice);
            void queryClient.prefetchQuery({
                queryKey: queryKeys.rental.invoicesList(),
                queryFn: async () => slice,
            });
        }, { timeout: 2500 });
        return () => cancelScheduledIdle(idleId);
    }, [queryClient, state.invoices]);

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
            const svcIncomeCategory = state.categories.find(
                c => c.id === 'sys-cat-svc-inc' || c.name === 'Service Charge Income'
            );
            const monthPrefix = currentMonthYyyyMm(today);

            let propertiesToProcess = state.properties;
            if (selectedBuildingId !== 'all') {
                propertiesToProcess = state.properties.filter(p => p.buildingId === selectedBuildingId);
            }

            propertiesToProcess.forEach(prop => {
                const parsed = parseProperty(prop.name, prop.id);

                // Financials
                const propertyInvoices = state.invoices.filter(inv => inv.propertyId === prop.id);
                // Security deposit due: standalone security invoices + security portion of mixed invoices
                const securityDue = propertyInvoices
                    .filter(inv => inv.status !== InvoiceStatus.PAID)
                    .reduce((sum, inv) => {
                        if (inv.invoiceType === InvoiceType.SECURITY_DEPOSIT) {
                            return sum + (inv.amount - inv.paidAmount);
                        }
                        if (inv.securityDepositCharge && inv.amount > 0) {
                            const outstanding = inv.amount - inv.paidAmount;
                            const securityRatio = inv.securityDepositCharge / inv.amount;
                            return sum + (outstanding * securityRatio);
                        }
                        return sum;
                    }, 0);

                // Rental receivable: exclude security deposit invoices (shown separately above)
                const receivable = propertyInvoices
                    .filter(inv => inv.status !== InvoiceStatus.PAID && inv.invoiceType !== InvoiceType.SECURITY_DEPOSIT)
                    .reduce((sum, inv) => {
                        if (inv.securityDepositCharge && inv.amount > 0) {
                            const outstanding = inv.amount - inv.paidAmount;
                            const rentalRatio = 1 - (inv.securityDepositCharge / inv.amount);
                            return sum + (outstanding * rentalRatio);
                        }
                        return sum + (inv.amount - inv.paidAmount);
                    }, 0);

                const propIncome = state.transactions
                    .filter(tx => tx.propertyId === prop.id && tx.type === TransactionType.INCOME)
                    .reduce((sum, tx) => sum + tx.amount, 0);

                const propExpense = state.transactions
                    .filter(tx => tx.propertyId === prop.id && tx.type === TransactionType.EXPENSE)
                    .reduce((sum, tx) => sum + tx.amount, 0);

                const payoutDue = Math.max(0, propIncome - propExpense);

                const hasUnpaidRental = propertyInvoices.some(
                    inv =>
                        inv.invoiceType === InvoiceType.RENTAL &&
                        inv.status !== InvoiceStatus.PAID &&
                        inv.status !== InvoiceStatus.DRAFT &&
                        inv.amount - (inv.paidAmount || 0) > 0.01
                );
                const hasUnpaidSecurity = propertyInvoices.some(
                    inv =>
                        inv.invoiceType === InvoiceType.SECURITY_DEPOSIT &&
                        inv.status !== InvoiceStatus.PAID &&
                        inv.status !== InvoiceStatus.DRAFT &&
                        inv.amount - (inv.paidAmount || 0) > 0.01
                );
                const serviceChargeDeductedThisMonth =
                    !!svcIncomeCategory &&
                    state.transactions.some(
                        tx =>
                            tx.propertyId === prop.id &&
                            tx.categoryId === svcIncomeCategory!.id &&
                            tx.date.startsWith(monthPrefix)
                    );
                const monthlyServiceCharge = prop.monthlyServiceCharge || 0;
                const canDeductServiceCharges = !serviceChargeDeductedThisMonth && monthlyServiceCharge > 0;

                // Owner & Tenant
                const owner = state.contacts.find(c => c.id === prop.ownerId);
                const activeAgreement = state.rentalAgreements.find(ra => ra.propertyId === prop.id && ra.status === RentalAgreementStatus.ACTIVE);
                const tenant = activeAgreement ? state.contacts.find(c => c.id === activeAgreement.contactId) : null;
                const monthlyRent = activeAgreement?.monthlyRent ?? 0;
                const securityDepositAmount = activeAgreement?.securityDeposit ?? 0;
                const agreementStartDate = activeAgreement?.startDate ?? null;

                // Calculate last updated date
                const propertyTransactions = state.transactions.filter(tx => tx.propertyId === prop.id);
                const transactionDates = propertyTransactions.map(tx => tx.date);
                const invoiceDates = propertyInvoices.map(inv => inv.issueDate);
                const agreementDates = activeAgreement ? [activeAgreement.endDate] : [];
                const allDates = [...transactionDates, ...invoiceDates, ...agreementDates];
                const lastUpdated = allDates.length > 0
                    ? allDates.sort().reverse()[0]
                    : toLocalDateString(new Date());

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
                    isCurrentMonthRentPaid,
                    monthlyRent,
                    securityDepositAmount,
                    agreementStartDate,
                    monthlyServiceCharge,
                    serviceChargeDeductedThisMonth,
                    hasUnpaidRental,
                    hasUnpaidSecurity,
                    canDeductServiceCharges,
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

            // Max receivable on this layout — used to normalize account-receivable background tint
            let maxReceivable = 0;
            sortedBuildings.forEach(b => {
                b.floors.forEach(f => {
                    f.units.forEach(u => {
                        if (u.receivable > maxReceivable) maxReceivable = u.receivable;
                    });
                });
                b.unconventional.forEach(u => {
                    if (u.receivable > maxReceivable) maxReceivable = u.receivable;
                });
            });

            return { type: 'RENTAL', data: sortedBuildings, maxReceivable };
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


    /** Light red (unpaid) → light green (paid) from account receivable vs max receivable on the layout. */
    const getReceivableBackgroundStyle = (receivable: number, maxReceivable: number): React.CSSProperties => {
        const r = Math.max(0, receivable);
        const max = Math.max(0, maxReceivable);
        let paidRatio: number;
        if (max <= 0.01) {
            paidRatio = r <= 0.01 ? 1 : 0;
        } else {
            paidRatio = Math.min(1, Math.max(0, 1 - r / max));
        }
        const lightRed = 'rgb(254 242 242)';
        const lightGreen = 'rgb(220 252 231)';
        return {
            backgroundColor: `color-mix(in srgb, ${lightGreen} ${paidRatio * 100}%, ${lightRed} ${(1 - paidRatio) * 100}%)`,
        };
    };

    const getColorClasses = (unit: any, mode: 'RENTAL' | 'PROJECT') => {
        if (mode === 'RENTAL') {
            if (unit.isExpiringSoon) return 'border-ds-warning';
            if (unit.status === 'Occupied') return 'border-ds-success';
            return 'border-app-border';
        } else {
            if (unit.status === 'Available') return 'border-app-border';
            if (unit.receivable <= 0) return 'border-ds-success';
            if (unit.receivable < 50000) return 'border-ds-warning';
            return 'border-ds-danger';
        }
    };

    const renderBox = (unit: any, mode: 'RENTAL' | 'PROJECT', maxReceivable: number = 0) => {
        /** Vacant, no tenant receivables, and no net owner/account payout due — plain white card */
        const plainWhiteVacant =
            unit.status === 'Vacant' &&
            (unit.payoutDue || 0) <= 0.01 &&
            (unit.receivable || 0) <= 0.01 &&
            (unit.securityDue || 0) <= 0.01;

        const backgroundColorStyle =
            mode === 'RENTAL' && !plainWhiteVacant
                ? getReceivableBackgroundStyle(unit.receivable || 0, maxReceivable)
                : undefined;

        if (mode === 'RENTAL') {
            return (
                <RentalPropertySummaryCard
                    key={unit.id}
                    unit={unit}
                    className={getColorClasses(unit, mode)}
                    style={backgroundColorStyle}
                    plainWhiteBackground={plainWhiteVacant}
                    onClick={() => setSelectedPropertyId(unit.id)}
                />
            );
        }

        return (
            <div
                key={unit.id}
                className={`relative rounded-xl bg-white border shadow-sm p-2 flex flex-col justify-between transition-all min-h-[12rem]
                    ${getColorClasses(unit, mode)}
                `}
            >
                <div className="flex justify-between items-start mb-1 relative z-10">
                    <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs text-app-text block truncate" title={unit.name}>
                            {unit.name}
                        </span>
                    </div>
                    {unit.status === 'Sold' && (
                        <div className="rounded-full bg-ds-success flex-shrink-0 mt-1 w-2 h-2" title="Sold"></div>
                    )}
                </div>

                <div className="text-[9px] leading-tight space-y-0.5 mb-1 relative z-10">
                    <div className={`truncate font-medium ${unit.status === 'Available' ? 'text-app-muted italic' : 'text-app-text'}`} title={unit.clientName}>
                        {unit.clientName}
                    </div>
                    <div className="text-[8px] uppercase font-bold text-app-muted">{unit.status}</div>
                </div>

                <div className="border-t border-app-border my-1"></div>

                <div className="text-[9px] flex justify-between items-start relative z-10">
                    {unit.status === 'Sold' && (
                        <>
                            <div className="flex flex-col">
                                <span className="text-app-muted text-[8px] uppercase">Recv</span>
                                <span className="font-medium text-ds-success text-xs">{(unit.received / 1000).toFixed(0)}k</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-app-muted text-[8px] uppercase">Due</span>
                                <span className={`font-bold text-xs ${unit.receivable > 0 ? 'text-ds-danger' : 'text-app-muted'}`}>
                                    {(unit.receivable / 1000).toFixed(0)}k
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
            <style>{STANDARD_PRINT_STYLES}</style>

            {/* Custom Toolbar - All controls in first row (stays fixed; grid scrolls below) */}
            <div className="bg-app-card p-3 rounded-lg border border-app-border shadow-ds-card no-print mb-4 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Report Title */}
                    <h2 className="text-xl font-bold text-app-text mr-4">
                        {data.type === 'RENTAL' ? 'Property' : 'Project'} Visual Layout
                    </h2>
                    {/* Legend - Only for Rental */}
                    {data.type === 'RENTAL' && (
                        <div className="flex items-center gap-4 text-xs text-app-muted border-l border-app-border pl-4 flex-wrap">
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 bg-app-card border-2 border-ds-success rounded"></span>
                                <span>Good / Paid</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 bg-app-card border-2 border-ds-warning rounded"></span>
                                <span>Low Debt</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 bg-app-card border-2 border-ds-danger rounded"></span>
                                <span>High Debt</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 bg-app-card border-2 border-app-border rounded"></span>
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

            <div
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-2 pb-4 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 print:overflow-visible print:h-auto print:max-h-none print:flex-none"
            >
                <div className="printable-area" id="printable-area">
                    <ReportHeader />

                    {data.data.length === 0 ? (
                        <div className="text-center py-10 text-app-muted">No project units found to display.</div>
                    ) : (
                        <div className="space-y-8">
                            {data.data.map((group) => (
                                <div key={group.code || group.id} className="break-inside-avoid border-2 border-app-border rounded-xl p-4 bg-app-toolbar/30">
                                    <h3 className="text-lg font-bold text-primary mb-4 border-b-2 border-primary/25 pb-1 pl-1 bg-primary/10 rounded-lg px-3 py-2 shadow-ds-card">
                                        {data.type === 'RENTAL' ? `Building ${group.code}` : group.name}
                                    </h3>
                                    <div className="flex flex-col gap-4">
                                        {group.floors.map((floor: any) => (
                                            <div key={floor.index} className="flex flex-col md:flex-row gap-2">
                                                <div className="w-full md:w-12 h-8 md:h-auto flex-shrink-0 flex items-center justify-center bg-primary text-ds-on-primary rounded-lg font-bold text-sm shadow-ds-card mb-2 md:mb-0">
                                                    {floor.label}
                                                </div>
                                                <div className="flex-grow grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                                    {floor.units.map((unit: any) => renderBox(unit, data.type as any, data.maxReceivable || 0))}
                                                </div>
                                            </div>
                                        ))}
                                        {group.unconventional.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-dashed border-app-border">
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:pl-14">
                                                    {group.unconventional.map((unit: any) => renderBox(unit, data.type as any, data.maxReceivable || 0))}
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

            <Suspense fallback={modalSuspenseFallback}>
                {selectedPropertyId && (
                    <PropertyQuickManagementPanel
                        isOpen={!!selectedPropertyId}
                        onClose={() => setSelectedPropertyId(null)}
                        propertyId={selectedPropertyId}
                        onDeductCharges={(propId) => {
                            setMscForPropertyId(propId);
                        }}
                        onCreateInvoice={(propId) => {
                            setCreateInvoiceForPropertyId(propId);
                        }}
                        onReceivePayment={(propId, propName) => {
                            setInvoicePick({
                                propertyId: propId,
                                propertyName: propName,
                                type: 'ALL',
                            });
                        }}
                        onPayoutToOwner={(owner, balanceDue, payoutType, breakdown) => {
                            setOwnerPayoutState({ owner, balanceDue, payoutType, propertyBreakdown: breakdown });
                        }}
                        onPayoutToBroker={(broker, balanceDue) => {
                            setBrokerPayoutState({ broker, balanceDue, propertyId: selectedPropertyId || undefined });
                        }}
                        onPayoutSecurity={(owner, balanceDue, breakdown, tenant, tenantUnpaidAmount) => {
                            setOwnerPayoutState({ owner, balanceDue, payoutType: 'Security', propertyBreakdown: breakdown, tenant, tenantUnpaidAmount });
                        }}
                    />
                )}
                {invoicePick && (
                    <PropertyInvoicePickModal
                        isOpen={!!invoicePick}
                        onClose={() => setInvoicePick(null)}
                        propertyId={invoicePick.propertyId}
                        propertyName={invoicePick.propertyName}
                        invoiceType={invoicePick.type}
                        onSelectInvoice={inv => {
                            setPaymentInvoice(inv);
                            setInvoicePick(null);
                        }}
                    />
                )}
                {paymentInvoice && (
                    <RentalPaymentModal
                        isOpen={!!paymentInvoice}
                        onClose={() => setPaymentInvoice(null)}
                        invoice={paymentInvoice}
                    />
                )}
                {mscForPropertyId && (
                    <ManualServiceChargeModal
                        isOpen={!!mscForPropertyId}
                        onClose={() => setMscForPropertyId(null)}
                        initialPropertyId={mscForPropertyId}
                    />
                )}
                {createInvoiceForPropertyId && (
                    <CreateRentalInvoiceModal
                        isOpen={!!createInvoiceForPropertyId}
                        onClose={() => setCreateInvoiceForPropertyId(null)}
                        initialPreFillPropertyId={createInvoiceForPropertyId}
                    />
                )}
                {ownerPayoutState && (
                    <OwnerPayoutModal
                        isOpen={!!ownerPayoutState}
                        onClose={() => setOwnerPayoutState(null)}
                        owner={ownerPayoutState.owner}
                        balanceDue={ownerPayoutState.balanceDue}
                        payoutType={ownerPayoutState.payoutType}
                        propertyBreakdown={ownerPayoutState.propertyBreakdown}
                        tenant={ownerPayoutState.tenant}
                        tenantUnpaidAmount={ownerPayoutState.tenantUnpaidAmount}
                    />
                )}
                {brokerPayoutState && (
                    <BrokerPayoutModal
                        isOpen={!!brokerPayoutState}
                        onClose={() => setBrokerPayoutState(null)}
                        broker={brokerPayoutState.broker}
                        balanceDue={brokerPayoutState.balanceDue}
                        context="Rental"
                        propertyId={brokerPayoutState.propertyId}
                    />
                )}
            </Suspense>
        </div>
    );
};

export default PropertyLayoutReport;
