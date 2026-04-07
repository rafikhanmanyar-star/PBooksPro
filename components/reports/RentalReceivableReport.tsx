
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { InvoiceType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

export interface DueLine {
    invoiceId: string;
    invoiceNumber: string;
    period: string;       // e.g. "Jan 2025"
    dueDate: string;
    type: 'Rent' | 'Security';
    amount: number;
    paidAmount: number;
    balance: number;
    runningBalance: number;
}

export interface PropertyReceivable {
    propertyId: string;
    propertyName: string;
    buildingId: string;
    buildingName: string;
    tenantName: string;
    lines: DueLine[];
    totalDue: number;
}

const RentalReceivableReport: React.FC = () => {
    const { state } = useAppContext();
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);
    const propertiesById = useMemo(() => new Map(state.properties.map(p => [p.id, p])), [state.properties]);
    const buildingsById = useMemo(() => new Map(state.buildings.map(b => [b.id, b])), [state.buildings]);
    const contactsById = useMemo(() => new Map(state.contacts.map(c => [c.id, c])), [state.contacts]);

    // Due invoices: RENTAL or SECURITY_DEPOSIT with balance > 0
    const dueInvoices = useMemo(() => {
        return state.invoices.filter(inv =>
            (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT) &&
            (inv.amount - inv.paidAmount) > 0
        );
    }, [state.invoices]);

    // Group by property, then sort lines by date and compute running balance
    const propertyReceivables = useMemo<PropertyReceivable[]>(() => {
        const byProperty = new Map<string, { inv: typeof dueInvoices[0]; balance: number }[]>();

        for (const inv of dueInvoices) {
            const propId = inv.propertyId;
            if (!propId) continue;

            const buildingId = inv.buildingId || propertiesById.get(propId)?.buildingId;
            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;

            const balance = inv.amount - inv.paidAmount;
            if (!byProperty.has(propId)) byProperty.set(propId, []);
            byProperty.get(propId)!.push({ inv, balance });
        }

        const result: PropertyReceivable[] = [];

        byProperty.forEach((items, propertyId) => {
            const prop = propertiesById.get(propertyId);
            const buildingId = prop?.buildingId || items[0]?.inv.buildingId || '';
            const building = buildingsById.get(buildingId);
            const buildingName = building?.name || 'Unassigned';
            const propertyName = prop?.name || 'Unknown';

            // Sort by issue date then by type (Security first if same month, then Rent)
            items.sort((a, b) => {
                const dA = new Date(a.inv.issueDate).getTime();
                const dB = new Date(b.inv.issueDate).getTime();
                if (dA !== dB) return dA - dB;
                return (a.inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ? 0 : 1) - (b.inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ? 0 : 1);
            });

            let runningBalance = 0;
            const lines: DueLine[] = items.map(({ inv, balance }) => {
                runningBalance += balance;
                const d = new Date(inv.issueDate);
                const period = `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
                return {
                    invoiceId: inv.id,
                    invoiceNumber: inv.invoiceNumber,
                    period,
                    dueDate: inv.dueDate || inv.issueDate,
                    type: inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ? 'Security' : 'Rent',
                    amount: inv.amount,
                    paidAmount: inv.paidAmount,
                    balance,
                    runningBalance,
                };
            });

            const tenantId = items[0]?.inv.contactId;
            const tenantName = tenantId ? (contactsById.get(tenantId)?.name || 'Unknown') : '—';

            result.push({
                propertyId,
                propertyName,
                buildingId,
                buildingName,
                tenantName,
                lines,
                totalDue: lines.reduce((sum, l) => sum + l.balance, 0),
            });
        });

        // Sort by building name then property name
        result.sort((a, b) => {
            if (a.buildingName !== b.buildingName) return a.buildingName.localeCompare(b.buildingName);
            return a.propertyName.localeCompare(b.propertyName);
        });

        return result;
    }, [dueInvoices, propertiesById, buildingsById, contactsById, selectedBuildingId]);

    const filteredData = useMemo(() => {
        if (!searchQuery.trim()) return propertyReceivables;
        const q = searchQuery.toLowerCase();
        return propertyReceivables.filter(
            p => p.buildingName.toLowerCase().includes(q) || p.propertyName.toLowerCase().includes(q) || p.tenantName.toLowerCase().includes(q)
        );
    }, [propertyReceivables, searchQuery]);

    // Group for display: by building
    const byBuilding = useMemo(() => {
        const map = new Map<string, PropertyReceivable[]>();
        for (const p of filteredData) {
            if (!map.has(p.buildingId)) map.set(p.buildingId, []);
            map.get(p.buildingId)!.push(p);
        }
        return map;
    }, [filteredData]);

    const grandTotal = useMemo(() => filteredData.reduce((sum, p) => sum + p.totalDue, 0), [filteredData]);

    const handleExport = () => {
        const rows: { Building: string; Unit: string; Tenant: string; Period: string; Type: string; Due: number; Paid: number; Balance: number; 'Running Balance': number }[] = [];
        filteredData.forEach(p => {
            p.lines.forEach(l => {
                rows.push({
                    Building: p.buildingName,
                    Unit: p.propertyName,
                    Tenant: p.tenantName,
                    Period: l.period,
                    Type: l.type,
                    Due: l.amount,
                    Paid: l.paidAmount,
                    Balance: l.balance,
                    'Running Balance': l.runningBalance,
                });
            });
        });
        exportJsonToExcel(rows, 'rental-receivable-report.xlsx', 'Rental Receivable');
    };

    const { print: triggerPrint } = usePrintContext();

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>

            <div className="bg-app-card p-3 rounded-lg border border-app-border shadow-ds-card no-print">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="w-48 flex-shrink-0">
                        <ComboBox
                            items={buildings}
                            selectedId={selectedBuildingId}
                            onSelect={(item) => setSelectedBuildingId(item?.id || 'all')}
                            allowAddNew={false}
                            placeholder="Filter Building"
                        />
                    </div>
                    <div className="relative flex-grow min-w-[180px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                            <span className="h-4 w-4">{ICONS.search}</span>
                        </div>
                        <Input
                            placeholder="Search building, unit, tenant..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="ds-input-field pl-9 py-1.5 text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border">
                            <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                        </Button>
                        <PrintButton
                            variant="secondary"
                            size="sm"
                            onPrint={() => triggerPrint('REPORT', { elementId: 'printable-receivable' })}
                            className="whitespace-nowrap"
                        />
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-receivable">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-app-text">Rental Receivable</h3>
                        <p className="text-sm text-app-muted">
                            Outstanding rent and security by building and unit (as of report view)
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        {Array.from(byBuilding.entries()).map(([buildingId, properties]) => {
                            const buildingName = properties[0]?.buildingName ?? 'Unassigned';
                            const buildingTotal = properties.reduce((s, p) => s + p.totalDue, 0);
                            return (
                                <div key={buildingId} className="mb-8">
                                    <h4 className="text-lg font-semibold text-app-text border-b border-app-border pb-2 mb-3">
                                        {buildingName}
                                    </h4>
                                    {properties.map((prop) => (
                                        <div key={prop.propertyId} className="mb-6">
                                            <div className="flex justify-between items-baseline mb-2">
                                                <span className="font-medium text-app-text">{prop.propertyName}</span>
                                                <span className="text-sm text-app-muted">Tenant: {prop.tenantName}</span>
                                            </div>
                                            <table className="min-w-full divide-y divide-app-border text-sm mb-2 bg-app-card rounded-md overflow-hidden">
                                                <thead className="bg-app-toolbar/40">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-medium text-app-muted">Period</th>
                                                        <th className="px-3 py-2 text-left font-medium text-app-muted">Type</th>
                                                        <th className="px-3 py-2 text-right font-medium text-app-muted">Due</th>
                                                        <th className="px-3 py-2 text-right font-medium text-app-muted">Paid</th>
                                                        <th className="px-3 py-2 text-right font-medium text-app-muted">Balance</th>
                                                        <th className="px-3 py-2 text-right font-medium text-app-muted">Running Balance</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-app-border">
                                                    {prop.lines.map((line) => (
                                                        <tr key={line.invoiceId} className="hover:bg-app-toolbar/30">
                                                            <td className="px-3 py-2 text-app-text">{line.period}</td>
                                                            <td className="px-3 py-2 text-app-text">{line.type}</td>
                                                            <td className="px-3 py-2 text-right text-app-text">{line.amount.toLocaleString()}</td>
                                                            <td className="px-3 py-2 text-right text-app-muted">{line.paidAmount.toLocaleString()}</td>
                                                            <td className="px-3 py-2 text-right font-medium text-app-text">{line.balance.toLocaleString()}</td>
                                                            <td className="px-3 py-2 text-right font-medium text-app-text">{line.runningBalance.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-app-toolbar/50 border-t border-app-border">
                                                    <tr>
                                                        <td colSpan={4} className="px-3 py-2 text-right font-medium text-app-text">Unit total</td>
                                                        <td colSpan={2} className="px-3 py-2 text-right font-bold text-app-text">{CURRENCY} {prop.totalDue.toLocaleString()}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    ))}
                                    <div className="flex justify-end border-t border-app-border pt-2">
                                        <span className="font-bold text-app-text">
                                            Building total: {CURRENCY} {buildingTotal.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filteredData.length > 0 && (
                        <div className="mt-6 pt-4 border-t-2 border-app-border flex justify-end">
                            <span className="text-lg font-bold text-app-text">
                                Total amount due: {CURRENCY} {grandTotal.toLocaleString()}
                            </span>
                        </div>
                    )}

                    {filteredData.length === 0 && (
                        <p className="text-center py-8 text-app-muted">No outstanding rental or security receivables.</p>
                    )}
                    <ReportFooter />
                </Card>
            </div>
        </div>
    );
};

export default RentalReceivableReport;
