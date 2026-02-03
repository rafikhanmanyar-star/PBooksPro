/**
 * BillPrintTemplate - Data-driven print template for Bills.
 * Used by react-to-print when user clicks Print on a bill.
 * Renders inside PrintLayout; not coupled to screen UI.
 */

import React from 'react';
import { PrintSettings } from '../../types';
import { PrintLayout } from './PrintLayout';
import { CURRENCY } from '../../constants';

/** Minimal bill data for printing */
export interface BillPrintData {
  billNumber: string;
  contactName?: string;
  contactAddress?: string;
  amount: number;
  paidAmount?: number;
  status?: string;
  issueDate?: string;
  dueDate?: string;
  description?: string;
  items?: Array<{ description: string; quantity?: number; pricePerUnit?: number; total?: number }>;
}

export interface BillPrintTemplateProps {
  printSettings: PrintSettings;
  data: BillPrintData;
}

const tableBorder = '1px solid var(--print-table-border, #e2e8f0)';
const headerBg = 'var(--print-highlight, #f8fafc)';

export const BillPrintTemplate: React.FC<BillPrintTemplateProps> = ({ printSettings, data }) => {
  const items = data.items || [];
  const totalAmount = data.amount ?? items.reduce((s, i) => s + (i.total ?? 0), 0);
  const issueDate = data.issueDate ? new Date(data.issueDate).toLocaleDateString() : '—';
  const dueDate = data.dueDate ? new Date(data.dueDate).toLocaleDateString() : '—';

  return (
    <PrintLayout printSettings={printSettings} title="BILL">
      <div className="print-no-break" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Vendor</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{data.contactName || '—'}</div>
            {data.contactAddress && <div style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{data.contactAddress}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ marginBottom: 4 }}><strong>Bill #</strong> {data.billNumber}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Issue: {issueDate}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Due: {dueDate}</div>
            {data.status && <div style={{ marginTop: 6, fontWeight: 600 }}>{data.status}</div>}
          </div>
        </div>
        {data.description && (
          <div style={{ marginBottom: 16, padding: 12, background: headerBg, borderRadius: 4, fontSize: 13 }}>{data.description}</div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="print-no-break" style={{ marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', background: headerBg, border: tableBorder, fontSize: 11, fontWeight: 600, color: '#475569' }}>Description</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', background: headerBg, border: tableBorder, fontSize: 11, fontWeight: 600, color: '#475569' }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', background: headerBg, border: tableBorder, fontSize: 11, fontWeight: 600, color: '#475569' }}>Price</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', background: headerBg, border: tableBorder, fontSize: 11, fontWeight: 600, color: '#475569' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '10px 12px', border: tableBorder }}>{item.description || '—'}</td>
                  <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right' }}>{item.quantity ?? '—'}</td>
                  <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right' }}>{item.pricePerUnit != null ? `${CURRENCY} ${item.pricePerUnit.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right', fontWeight: 600 }}>{item.total != null ? `${CURRENCY} ${item.total.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="print-no-break">
        <table style={{ width: 280, marginLeft: 'auto', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 0', borderBottom: tableBorder, fontWeight: 600, color: '#64748b' }}>Total</td>
              <td style={{ padding: '8px 0', borderBottom: tableBorder, textAlign: 'right', fontWeight: 700 }}>{CURRENCY} {totalAmount.toFixed(2)}</td>
            </tr>
            {(data.paidAmount != null && data.paidAmount > 0) && (
              <tr>
                <td style={{ padding: '8px 0', borderBottom: tableBorder }}>Paid</td>
                <td style={{ padding: '8px 0', borderBottom: tableBorder, textAlign: 'right' }}>{CURRENCY} {data.paidAmount.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PrintLayout>
  );
};

export default BillPrintTemplate;
