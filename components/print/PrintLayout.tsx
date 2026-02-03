/**
 * PrintLayout - Reusable base component for printed business forms.
 * Renders header (logo, company name, address, header text) and footer (footer text, date)
 * from PrintSettings, and wraps children (form-specific content).
 * Used by InvoicePrintTemplate, POPrintTemplate, BillPrintTemplate.
 * Do NOT use for screen UI; content is rendered for react-to-print only.
 */

import React from 'react';
import { PrintSettings } from '../../types';
import './printForm.css';

export interface PrintLayoutProps {
  /** Branding and layout from Settings > Print Settings */
  printSettings: PrintSettings;
  /** Form title shown below header (e.g. "PURCHASE ORDER", "INVOICE") */
  title: string;
  /** Form-specific body content (tables, details) */
  children: React.ReactNode;
  /** Optional CSS class for the root (e.g. for custom margins) */
  className?: string;
}

const DEFAULTS = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  headerFontSize: 22,
  bodyFontSize: 13,
  footerFontSize: 11,
  textColor: '#1e293b',
  tableBorderColor: '#e2e8f0',
  highlightColor: '#f1f5f9',
  backgroundColor: '#ffffff',
  marginTop: 12.7,
  marginBottom: 12.7,
  marginLeft: 12.7,
  marginRight: 12.7,
};

export const PrintLayout: React.FC<PrintLayoutProps> = ({
  printSettings,
  title,
  children,
  className = '',
}) => {
  const {
    companyName = '',
    companyAddress = '',
    companyContact = '',
    logoUrl,
    showLogo = true,
    headerText = '',
    footerText = '',
    showDatePrinted = true,
    taxId = '',
    fontFamily = DEFAULTS.fontFamily,
    headerFontSize = DEFAULTS.headerFontSize,
    bodyFontSize = DEFAULTS.bodyFontSize,
    footerFontSize = DEFAULTS.footerFontSize,
    textColor = DEFAULTS.textColor,
    tableBorderColor = DEFAULTS.tableBorderColor,
    highlightColor = DEFAULTS.highlightColor,
    backgroundColor = DEFAULTS.backgroundColor,
    watermark = '',
    marginTop = DEFAULTS.marginTop,
    marginBottom = DEFAULTS.marginBottom,
    marginLeft = DEFAULTS.marginLeft,
    marginRight = DEFAULTS.marginRight,
  } = printSettings;

  const marginStyle = `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`;

  return (
    <div
      className={`print-form-root ${className}`}
      style={{
        fontFamily,
        fontSize: bodyFontSize,
        color: textColor,
        backgroundColor,
        margin: 0,
        padding: 16,
        minHeight: '100vh',
        ['--print-table-border' as string]: tableBorderColor,
        ['--print-highlight' as string]: highlightColor,
      }}
    >
      {/* Optional watermark */}
      {watermark && (
        <div
          className="print-no-break"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-18deg)',
            fontSize: 72,
            fontWeight: 900,
            color: 'rgba(0,0,0,0.06)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {watermark}
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header: logo, company name, address, header text */}
        <header className="print-form-header" style={{ marginBottom: 24, paddingBottom: 16, borderBottom: `2px solid ${tableBorderColor}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: 1 }}>
              {showLogo && logoUrl && (
                <img src={logoUrl} alt="Logo" style={{ maxHeight: 64, width: 'auto', display: 'block' }} />
              )}
              <div>
                <h1 style={{ margin: 0, fontSize: headerFontSize, fontWeight: 700, color: textColor, letterSpacing: '0.02em' }}>
                  {companyName}
                </h1>
                {taxId && <p style={{ margin: '4px 0 0 0', fontSize: bodyFontSize - 1, color: '#64748b' }}>{taxId}</p>}
                {headerText && <p style={{ margin: '6px 0 0 0', fontSize: bodyFontSize - 1, color: '#64748b', fontStyle: 'italic' }}>{headerText}</p>}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: bodyFontSize, color: '#475569', whiteSpace: 'pre-wrap' }}>
              {companyAddress}
              {companyContact && <div style={{ marginTop: 4, fontWeight: 500 }}>{companyContact}</div>}
            </div>
          </div>
        </header>

        {/* Form title (e.g. PURCHASE ORDER, INVOICE) */}
        <h2 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 700, color: textColor, letterSpacing: '0.05em' }}>
          {title}
        </h2>

        {/* Form-specific content */}
        {children}

        {/* Footer */}
        <footer className="print-form-footer" style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${tableBorderColor}`, textAlign: 'center', fontSize: footerFontSize, color: '#64748b' }}>
          {footerText && <p style={{ margin: '0 0 4px 0', fontWeight: 500 }}>{footerText}</p>}
          {showDatePrinted && <p style={{ margin: 0 }}>Printed on: {new Date().toLocaleString()}</p>}
        </footer>
      </div>
    </div>
  );
};

export default PrintLayout;
