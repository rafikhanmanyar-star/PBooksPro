import { jsPDF } from 'jspdf';
import { exportJsonToExcel } from '../../../services/exportService';
import type { FundAvailabilityRow } from '../types/fundAvailability.types';
import { formatFullMoney } from '../utils/financialFormat';

export function fundRowsToExportRecords(rows: FundAvailabilityRow[]) {
    return rows.map((r, i) => ({
        'S.No': i + 1,
        Project: r.projectName,
        'Project status': r.projectStatus,
        'Investor capital': r.investorCapital,
        'Allocated profit': r.allocatedProfit,
        'Investor equity': r.investorEquity,
        'Available cash': r.availableCash,
        'Reserved funds': r.reservedFunds,
        'Pending payables': r.pendingPayables,
        'Distributable funds': r.distributableFunds,
        'Total withdrawn': r.totalWithdrawn,
        'Remaining equity': r.remainingEquity,
        'Liquidity ratio': r.liquidityRatio ?? '',
        'Fund health': r.fundHealth,
        'Last distribution': r.lastDistributionDate ?? '',
        'Last updated': r.lastUpdated ?? '',
    }));
}

export function exportFundAvailabilityExcel(rows: FundAvailabilityRow[], sheetName = 'Fund availability') {
    exportJsonToExcel(fundRowsToExportRecords(rows), 'investor-fund-availability.xlsx', sheetName);
}

export function exportFundAvailabilityCsv(rows: FundAvailabilityRow[]) {
    const recs = fundRowsToExportRecords(rows);
    if (!recs.length) return;
    const headers = Object.keys(recs[0]);
    const esc = (v: unknown) => {
        const s = v == null ? '' : String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const lines = [headers.join(','), ...recs.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investor-fund-availability.csv';
    a.click();
    URL.revokeObjectURL(url);
}

export function exportFundAvailabilityPdf(rows: FundAvailabilityRow[], title: string) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(12);
    doc.text(title, 40, 40);
    let y = 64;
    const lineH = 14;
    const maxY = 520;
    const slice = rows.slice(0, 35);
    for (const r of slice) {
        const disp = formatFullMoney(r.distributableFunds);
        const eq = formatFullMoney(r.investorEquity);
        const line = `${r.projectName.slice(0, 26)} | Dist ${disp} | Equity ${eq} | Health ${r.fundHealth}`;
        if (y > maxY) {
            doc.addPage();
            y = 40;
        }
        doc.setFontSize(9);
        doc.text(line, 40, y);
        y += lineH;
    }
    if (rows.length > slice.length) {
        doc.text(`... and ${rows.length - slice.length} more rows (export Excel for full data).`, 40, y + 10);
    }
    doc.save('investor-fund-availability.pdf');
}
