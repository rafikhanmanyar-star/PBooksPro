import { jsPDF } from 'jspdf';
import { exportJsonToExcel } from '../../../services/exportService';
import type { ProjectProfitabilityRow } from '../types/profitability.types';
import { formatFullMoney, formatRoi } from '../utils/financialFormat';

export function profitabilityRowsToExportRecords(rows: ProjectProfitabilityRow[]) {
    return rows.map((r) => ({
        'Project name': r.projectName,
        Status: r.rowStatus,
        'Completion %': Number(r.completionPct.toFixed(2)),
        'Units sold': r.unitsSold,
        'Units remaining': r.unitsRemaining,
        Revenue: r.revenue,
        Expense: r.expense,
        'Gross profit': r.grossProfit,
        'Net profit': r.netProfit,
        'Adjusted profit': r.adjustedProfit,
        'Unsold inventory': r.unsoldInventoryValue,
        Receivable: r.receivable,
        'Cash received': r.cashReceived,
        Payables: r.payables,
        'Investor capital': r.investorCapital,
        'ROI %': r.roiPct ?? '',
        'Last updated': r.lastUpdated ?? '',
    }));
}

export function exportProfitabilityExcel(rows: ProjectProfitabilityRow[], sheetName = 'Profitability') {
    exportJsonToExcel(profitabilityRowsToExportRecords(rows), 'project-profitability.xlsx', sheetName);
}

export function exportProfitabilityCsv(rows: ProjectProfitabilityRow[]) {
    const recs = profitabilityRowsToExportRecords(rows);
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
    a.download = 'project-profitability.csv';
    a.click();
    URL.revokeObjectURL(url);
}

export function exportProfitabilityPdf(rows: ProjectProfitabilityRow[], title: string) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(12);
    doc.text(title, 40, 40);
    let y = 64;
    const lineH = 14;
    const maxY = 520;
    const slice = rows.slice(0, 40);
    for (const r of slice) {
        const line = `${r.projectName.slice(0, 28)} | Rev ${formatFullMoney(r.revenue)} | Exp ${formatFullMoney(r.expense)} | Net ${formatFullMoney(r.netProfit)} | ROI ${formatRoi(r.roiPct)}`;
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
    doc.save('project-profitability.pdf');
}
