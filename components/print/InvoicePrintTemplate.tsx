/**
 * InvoicePrintTemplate - Data-driven print template for Invoices.
 * Used by react-to-print when user clicks Print on an invoice.
 * Renders inside PrintLayout; not coupled to screen UI.
 */

import React from 'react';
import { PrintSettings } from '../../types';
import { PrintLayout } from './PrintLayout';
import { CURRENCY } from '../../constants';

/** Minimal invoice data for printing (from Invoice or P2P invoice) */
export interface InvoicePrintData {
  invoiceNumber: string;
  contactName?: string;
  contactAddress?: string;
  amount: number;
  paidAmount?: number;
  status?: string;
  issueDate?: string;
  dueDate?: string;
  description?: string;
  items?: Array<{ description: string; quantity: number; unitPrice?: number; total: number }>;
}

export interface InvoicePrintTemplateProps {
  printSettings: PrintSettings;
  data: InvoicePrintData;
}

const tableBorder = '1px solid var(--print-table-border, #e2e8f0)';
const headerBg = 'var(--print-highlight, #f8fafc)';

export const InvoicePrintTemplate: React.FC<InvoicePrintTemplateProps> = ({ printSettings, data }) => {
  const items = data.items || [];
  const totalAmount = data.amount ?? items.reduce((s, i) => s + (i.total || 0), 0);
  const issueDate = data.issueDate ? new Date(data.issueDate).toLocaleDateString() : '—';
  const dueDate = data.dueDate ? new Date(data.dueDate).toLocaleDateString() : '—';

  return (
    <PrintLayout printSettings={printSettings} title="INVOICE">
      <div className="print-no-break" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Bill To</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{data.contactName || '—'}</div>
            {data.contactAddress && <div style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{data.contactAddress}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ marginBottom: 4 }}><strong>Invoice #</strong> {data.invoiceNumber}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Issue: {issueDate}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Due: {dueDate}</div>
            {data.status && <div style={{ marginTop: 6, fontWeight: 600 }}>{data.status}</div>}
          </div>
        </div>
        {data.description && (
          <div style={{ marginBottom: 16, padding: 12, background: headerBg, borderRadius: 4, fontSize: 13 }}>{data.description}</div>
        )}
      </div>

      <div className="print-no-break" style={{ marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', background: headerBg, border: tableBorder, fontSize: 11, fontWeight: 600, color: '#475569' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', background: headerBg, border: tableBorder, fontSize: 11, fontWeight: 600, color: '#475569' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', background: headerBg, border: tableBorder, fontSize: 11, fontWeight: 600, color: '#475569' }}>Unit Price</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', background: headerBg, border: tableBorder, fontSize: 11, fontWeight: 600, color: '#475569' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td style={{ padding: '10px 12px', border: tableBorder }}>{item.description || '—'}</td>
                <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right' }}>{item.quantity ?? 0}</td>
                <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right' }}>{item.unitPrice != null ? `${CURRENCY} ${item.unitPrice.toFixed(2)}` : '—'}</td>
                <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right', fontWeight: 600 }}>{CURRENCY} {(item.total ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: '12px 12px', border: tableBorder, fontWeight: 700, textAlign: 'right' }}>Total</td>
              <td style={{ padding: '12px 12px', border: tableBorder, fontWeight: 700, textAlign: 'right' }}>{CURRENCY} {totalAmount.toFixed(2)}</td>
            </tr>
            {(data.paidAmount != null && data.paidAmount > 0) && (
              <tr>
                <td colSpan={3} style={{ padding: '8px 12px', border: tableBorder, textAlign: 'right' }}>Paid</td>
                <td style={{ padding: '8px 12px', border: tableBorder, textAlign: 'right' }}>{CURRENCY} {data.paidAmount.toFixed(2)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </PrintLayout>
  );
};

export default InvoicePrintTemplate;
