/**
 * LedgerLayout - Pure print layout for ledger reports (vendor, tenant, client, etc.).
 * Receives data only; renders a table with configurable columns and rows.
 */

import React from 'react';
import { PrintSettings } from '../../types';
import { PrintLayout } from './PrintLayout';
import { CURRENCY } from '../../constants';

export interface LedgerPrintData {
  title: string;
  subtitle?: string;
  /** Column headers */
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' | 'center'; width?: string }>;
  /** Row data: array of objects keyed by column key */
  rows: Array<Record<string, string | number | undefined>>;
  /** Optional summary line (e.g. "Total", "Balance") */
  summaryLabel?: string;
  summaryValue?: number;
  /** Format numeric columns (by key) as currency */
  currencyKeys?: string[];
}

export interface LedgerLayoutProps {
  printSettings: PrintSettings;
  data: LedgerPrintData;
}

const tableBorder = '1px solid var(--print-table-border, #e2e8f0)';
const headerBg = 'var(--print-highlight, #f8fafc)';

export const LedgerLayout: React.FC<LedgerLayoutProps> = ({ printSettings, data }) => {
  const { title, subtitle, columns, rows, summaryLabel, summaryValue, currencyKeys = [] } = data;

  const formatCell = (key: string, value: string | number | undefined): string => {
    if (value === undefined || value === null) return '—';
    if (currencyKeys.includes(key) && typeof value === 'number') {
      return `${CURRENCY} ${value.toFixed(2)}`;
    }
    return String(value);
  };

  return (
    <PrintLayout printSettings={printSettings} title={title.toUpperCase()}>
      {subtitle && (
        <div className="print-no-break" style={{ marginBottom: 16, fontSize: 13, color: '#64748b' }}>
          {subtitle}
        </div>
      )}

      <div className="print-no-break" style={{ marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: col.align || 'left',
                    padding: '10px 12px',
                    background: headerBg,
                    border: tableBorder,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#475569',
                    width: col.width,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '10px 12px',
                      border: tableBorder,
                      textAlign: col.align || 'left',
                      fontSize: 12,
                    }}
                  >
                    {formatCell(col.key, row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {(summaryLabel != null || summaryValue != null) && columns.length >= 2 && (
            <tfoot>
              <tr>
                <td
                  colSpan={Math.max(1, columns.length - 1)}
                  style={{ padding: '12px 12px', border: tableBorder, fontWeight: 700, textAlign: 'right' }}
                >
                  {summaryLabel ?? ''}
                </td>
                <td style={{ padding: '12px 12px', border: tableBorder, fontWeight: 700, textAlign: 'right' }}>
                  {summaryValue != null ? `${CURRENCY} ${summaryValue.toFixed(2)}` : '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </PrintLayout>
  );
};

export default LedgerLayout;
