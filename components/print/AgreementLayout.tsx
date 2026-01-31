/**
 * AgreementLayout - Pure print layout for long-form agreements.
 * Uses .clause { page-break-inside: avoid } for clean page breaks.
 * Receives data only; no UI state.
 */

import React from 'react';
import { PrintSettings } from '../../types';
import { PrintLayout } from './PrintLayout';

export interface AgreementClause {
  id: string;
  title: string;
  body: string;
}

export interface AgreementPrintData {
  title: string;
  agreementNumber?: string;
  parties?: string;
  effectiveDate?: string;
  clauses: AgreementClause[];
  footerNote?: string;
}

export interface AgreementLayoutProps {
  printSettings: PrintSettings;
  data: AgreementPrintData;
}

export const AgreementLayout: React.FC<AgreementLayoutProps> = ({ printSettings, data }) => {
  const { title, agreementNumber, parties, effectiveDate, clauses, footerNote } = data;

  return (
    <PrintLayout printSettings={printSettings} title={title.toUpperCase()}>
      <div className="agreement-print-body">
        {(agreementNumber || parties || effectiveDate) && (
          <div className="print-no-break" style={{ marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {agreementNumber && (
                  <tr>
                    <td style={{ padding: '6px 0', width: '30%', fontWeight: 600, color: '#64748b' }}>Agreement No.</td>
                    <td style={{ padding: '6px 0' }}>{agreementNumber}</td>
                  </tr>
                )}
                {parties && (
                  <tr>
                    <td style={{ padding: '6px 0', fontWeight: 600, color: '#64748b', verticalAlign: 'top' }}>Parties</td>
                    <td style={{ padding: '6px 0', whiteSpace: 'pre-wrap' }}>{parties}</td>
                  </tr>
                )}
                {effectiveDate && (
                  <tr>
                    <td style={{ padding: '6px 0', fontWeight: 600, color: '#64748b' }}>Effective Date</td>
                    <td style={{ padding: '6px 0' }}>{effectiveDate}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="agreement-clauses">
          {clauses.map((clause) => (
            <div key={clause.id} className="clause" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {clause.title}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                {clause.body}
              </div>
            </div>
          ))}
        </div>

        {footerNote && (
          <div className="print-no-break" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--print-table-border, #e2e8f0)', fontSize: 11, color: '#64748b' }}>
            {footerNote}
          </div>
        )}
      </div>
    </PrintLayout>
  );
};

export default AgreementLayout;
