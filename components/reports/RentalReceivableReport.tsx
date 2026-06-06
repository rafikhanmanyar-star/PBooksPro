
import React, { useState, useMemo, useEffect } from 'react';
import {
    useBuildings,
    useContacts,
    useInvoices,
    useProperties,
} from '../../hooks/useSelectiveState';
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
import {
    computeRentalReceivableReport,
    type PropertyReceivable,
} from './rentalReceivableReportEngine';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { fetchRentalReceivableReport } from '../../services/api/rentalReportsApi';

export type { DueLine, PropertyReceivable } from './rentalReceivableReportEngine';

const RentalReceivableReport: React.FC = () => {
    const allBuildings = useBuildings();
    const properties = useProperties();
    const contacts = useContacts();
    const invoices = useInvoices();
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const localOnly = isLocalOnlyMode();
    const [serverReceivables, setServerReceivables] = useState<PropertyReceivable[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        if (localOnly) {
            setServerReceivables(null);
            setFetchError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setFetchError(null);
        void fetchRentalReceivableReport({ buildingId: selectedBuildingId })
            .then((r) => {
                if (!cancelled) setServerReceivables(r.propertyReceivables);
            })
            .catch((e) => {
                if (!cancelled) setFetchError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [localOnly, selectedBuildingId]);

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...allBuildings], [allBuildings]);

    const localPropertyReceivables = useMemo(
        () =>
            computeRentalReceivableReport(
                { invoices, properties, buildings: allBuildings, contacts },
                { buildingId: selectedBuildingId }
            ),
        [invoices, properties, allBuildings, contacts, selectedBuildingId]
    );

    const propertyReceivables = localOnly
        ? localPropertyReceivables
        : (serverReceivables ?? localPropertyReceivables);

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
                {!localOnly && loading && (
                    <p className="text-sm text-app-muted mt-2">Loading receivables from server…</p>
                )}
                {!localOnly && fetchError && (
                    <p className="text-sm text-danger mt-2">Failed to load report: {fetchError}</p>
                )}
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
                        {Array.from(byBuilding.entries()).map(([buildingId, propertiesInBuilding]) => {
                            const buildingName = propertiesInBuilding[0]?.buildingName ?? 'Unassigned';
                            const buildingTotal = propertiesInBuilding.reduce((s, p) => s + p.totalDue, 0);
                            return (
                                <div key={buildingId} className="mb-8">
                                    <h4 className="text-lg font-semibold text-app-text border-b border-app-border pb-2 mb-3">
                                        {buildingName}
                                    </h4>
                                    {propertiesInBuilding.map((prop) => (
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
