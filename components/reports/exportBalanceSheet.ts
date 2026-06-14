import { jsPDF } from 'jspdf';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import type { BalanceSheetLine, BalanceSheetReportResult } from './balanceSheetEngine';
import { BS_GROUP_LABELS, flattenBalanceSheetLines } from './balanceSheetEngine';

function fmt(n: number): string {
  return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function lineExportRow(line: BalanceSheetLine, section: string) {
  return {
    Section: section,
    Group: BS_GROUP_LABELS[line.groupKey] ?? line.groupKey,
    Account: line.name,
    Amount: line.amount,
  };
}

export function balanceSheetToExportRows(report: BalanceSheetReportResult) {
  const rows: Record<string, string | number>[] = [];
  for (const l of report.assets.current) rows.push(lineExportRow(l, 'Assets — Current'));
  for (const l of report.assets.non_current) rows.push(lineExportRow(l, 'Assets — Non-current'));
  rows.push({ Section: 'TOTAL', Group: '', Account: 'Total Assets', Amount: report.totals.assets });
  for (const l of report.liabilities.current) rows.push(lineExportRow(l, 'Liabilities — Current'));
  for (const l of report.liabilities.non_current) rows.push(lineExportRow(l, 'Liabilities — Non-current'));
  rows.push({ Section: 'TOTAL', Group: '', Account: 'Total Liabilities', Amount: report.totals.liabilities });
  for (const l of report.equity.items) rows.push(lineExportRow(l, 'Equity'));
  rows.push({ Section: 'TOTAL', Group: '', Account: 'Total Equity', Amount: report.totals.equity });
  rows.push({
    Section: 'VALIDATION',
    Group: '',
    Account: 'Assets − (Liabilities + Equity)',
    Amount: report.totals.difference,
  });
  rows.push({
    Section: 'EARNINGS',
    Group: '',
    Account: 'Retained Earnings (prior fiscal years)',
    Amount: report.retainedEarningsPriorYears,
  });
  rows.push({
    Section: 'EARNINGS',
    Group: '',
    Account: 'Current Year Earnings',
    Amount: report.currentYearEarningsFromPL,
  });
  return rows;
}

export function exportBalanceSheetExcel(report: BalanceSheetReportResult, filename = 'balance-sheet.xlsx') {
  exportJsonToExcel(balanceSheetToExportRows(report), filename, 'Balance Sheet');
}

export function exportComparativeBalanceSheetExcel(
  current: BalanceSheetReportResult,
  previous: BalanceSheetReportResult,
  previousAsOfDate: string,
  filename = 'balance-sheet-comparative.xlsx'
) {
  const prevByKey = new Map(flattenBalanceSheetLines(previous).map((l) => [l.id + l.name, l.amount]));
  const rows = flattenBalanceSheetLines(current).map((l) => {
    const prev = prevByKey.get(l.id + l.name) ?? 0;
    return {
      Account: l.name,
      Group: BS_GROUP_LABELS[l.groupKey] ?? l.groupKey,
      Current: l.amount,
      Previous: prev,
      Variance: l.amount - prev,
    };
  });
  rows.push({
    Account: 'Total Assets',
    Group: '',
    Current: current.totals.assets,
    Previous: previous.totals.assets,
    Variance: current.totals.assets - previous.totals.assets,
  });
  rows.push({
    Account: 'Total Liabilities',
    Group: '',
    Current: current.totals.liabilities,
    Previous: previous.totals.liabilities,
    Variance: current.totals.liabilities - previous.totals.liabilities,
  });
  rows.push({
    Account: 'Total Equity',
    Group: '',
    Current: current.totals.equity,
    Previous: previous.totals.equity,
    Variance: current.totals.equity - previous.totals.equity,
  });
  exportJsonToExcel(rows, filename, `Balance Sheet vs ${previousAsOfDate}`);
}

export function exportBalanceSheetPdf(report: BalanceSheetReportResult, asOfDate: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Balance Sheet', 40, 40);
  doc.setFontSize(10);
  doc.text(`As of ${asOfDate}`, 40, 56);
  let y = 80;
  const lineH = 13;
  const maxY = 760;

  const printLine = (label: string, amount: number, indent = 0) => {
    if (y > maxY) {
      doc.addPage();
      y = 40;
    }
    doc.text(`${' '.repeat(indent)}${label.slice(0, 52)}`, 40, y);
    doc.text(fmt(amount), 420, y, { align: 'right' });
    y += lineH;
  };

  doc.setFont('helvetica', 'bold');
  printLine('TOTAL ASSETS', report.totals.assets);
  doc.setFont('helvetica', 'normal');
  for (const l of [...report.assets.current, ...report.assets.non_current]) {
    printLine(l.name, l.amount, 2);
  }
  y += 6;
  doc.setFont('helvetica', 'bold');
  printLine('TOTAL LIABILITIES', report.totals.liabilities);
  doc.setFont('helvetica', 'normal');
  for (const l of [...report.liabilities.current, ...report.liabilities.non_current]) {
    printLine(l.name, l.amount, 2);
  }
  y += 6;
  doc.setFont('helvetica', 'bold');
  printLine('TOTAL EQUITY', report.totals.equity);
  doc.setFont('helvetica', 'normal');
  for (const l of report.equity.items) {
    printLine(l.name, l.amount, 2);
  }
  y += 10;
  doc.setFont('helvetica', 'bold');
  const status = report.isBalanced ? 'Balanced' : `Out of balance by ${fmt(report.totals.difference)}`;
  doc.text(`Balance status: ${status}`, 40, y);
  doc.save(`balance-sheet-${asOfDate}.pdf`);
}
