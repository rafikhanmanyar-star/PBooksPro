/**
 * POPrintTemplate - Data-driven print template for Purchase Orders.
 * Used by react-to-print when user clicks Print on a PO.
 * Renders inside PrintLayout; not coupled to screen UI.
 */

import React from 'react';
import { PrintSettings } from '../../types';
import { PurchaseOrder, POItem } from '../../types';
import { PrintLayout } from './PrintLayout';
import { CURRENCY } from '../../constants';

export interface POPrintTemplateProps {
  printSettings: PrintSettings;
  /** PO data - form data only, no UI state */
  data: PurchaseOrder;
}

const tableBorder = '1px solid var(--print-table-border, #e2e8f0)';
const headerBg = 'var(--print-highlight, #f8fafc)';

export const POPrintTemplate: React.FC<POPrintTemplateProps> = ({ printSettings, data }) => {
  const items = (data.items || []) as POItem[];
  const totalAmount = data.totalAmount ?? items.reduce((s, i) => s + (i.total || 0), 0);
  const targetDate = data.targetDeliveryDate ? new Date(data.targetDeliveryDate).toLocaleDateString() : '—';

  return (
    <PrintLayout printSettings={printSettings} title="PURCHASE ORDER">
      <div className="print-no-break" style={{ marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 0', border: tableBorder, width: '30%', fontWeight: 600, color: '#64748b', paddingLeft: 12 }}>PO Number</td>
              <td style={{ padding: '8px 12px', border: tableBorder }}>{data.poNumber || '—'}</td>
              <td style={{ padding: '8px 0', border: tableBorder, width: '20%', fontWeight: 600, color: '#64748b', paddingLeft: 12 }}>Status</td>
              <td style={{ padding: '8px 12px', border: tableBorder }}>{data.status || '—'}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 12px', border: tableBorder, fontWeight: 600, color: '#64748b' }}>Supplier</td>
              <td style={{ padding: '8px 12px', border: tableBorder }} colSpan={3}>
                {data.supplierCompanyName || data.supplierName || data.supplierTenantId || '—'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px 12px', border: tableBorder, fontWeight: 600, color: '#64748b' }}>Target Delivery</td>
              <td style={{ padding: '8px 12px', border: tableBorder }}>{targetDate}</td>
              <td style={{ padding: '8px 12px', border: tableBorder, fontWeight: 600, color: '#64748b' }}>Project</td>
              <td style={{ padding: '8px 12px', border: tableBorder }}>{data.projectName || data.projectId || '—'}</td>
            </tr>
            {data.description && (
              <tr>
                <td style={{ padding: '8px 12px', border: tableBorder, fontWeight: 600, color: '#64748b' }}>Description</td>
                <td style={{ padding: '8px 12px', border: tableBorder }} colSpan={3}>{data.description}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="print-no-break" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Line Items</div>
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
              <tr key={item.id || idx}>
                <td style={{ padding: '10px 12px', border: tableBorder }}>{item.description || '—'}</td>
                <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right' }}>{item.quantity ?? 0}</td>
                <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right' }}>{CURRENCY} {(item.unitPrice ?? 0).toFixed(2)}</td>
                <td style={{ padding: '10px 12px', border: tableBorder, textAlign: 'right', fontWeight: 600 }}>{CURRENCY} {(item.total ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: '12px 12px', border: tableBorder, fontWeight: 700, textAlign: 'right' }}>Total</td>
              <td style={{ padding: '12px 12px', border: tableBorder, fontWeight: 700, textAlign: 'right' }}>{CURRENCY} {totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </PrintLayout>
  );
};

export default POPrintTemplate;
