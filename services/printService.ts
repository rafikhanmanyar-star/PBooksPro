/**
 * Centralized print service for consistent printing across the application
 */

import { PrintSettings } from '../types';
import { STANDARD_PRINT_STYLES } from '../utils/printStyles';

/**
 * Print options for printPrintableArea
 */
export interface PrintOptions {
  elementId?: string;
  printSettings?: PrintSettings;
  includeTemplate?: boolean;
}

/**
 * Print a printable area element
 * @param options - Print options including element ID and print settings
 */
export const printPrintableArea = (options: PrintOptions = {}): void => {
  const { elementId = 'printable-area', printSettings, includeTemplate = true } = options;

  try {
    // Find the printable area element
    const printableElement = document.querySelector(`.${elementId}`) as HTMLElement;
    
    if (!printableElement) {
      console.warn(`Print: Printable area with class "${elementId}" not found. Using window.print() as fallback.`);
      window.print();
      return;
    }

    // Ensure print styles are injected
    injectPrintStyles();

    // Trigger print
    window.print();
  } catch (error) {
    console.error('Print error:', error);
    // Fallback to standard print
    window.print();
  }
};

/**
 * Print from HTML template (for invoices and similar documents)
 * @param html - HTML string to print
 * @param printSettings - Optional print settings for template integration
 */
export const printFromTemplate = (html: string, printSettings?: PrintSettings): void => {
  try {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    if (!printWindow) {
      console.error('Print: Unable to open print window. Popup may be blocked.');
      return;
    }

    // Inject print styles into the new window
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Print</title>
        <style>
          ${STANDARD_PRINT_STYLES}
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `;

    printWindow.document.write(fullHtml);
    printWindow.document.close();

    // Wait for content to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        // Close window after print dialog closes (optional)
        // printWindow.close();
      }, 250);
    };
  } catch (error) {
    console.error('Print template error:', error);
  }
};

/**
 * Print a window (fallback method)
 */
export const printWindow = (): void => {
  window.print();
};

/**
 * Inject print styles into the document if not already present
 */
let stylesInjected = false;

const injectPrintStyles = (): void => {
  if (stylesInjected) return;

  const styleId = 'print-service-styles';
  if (document.getElementById(styleId)) {
    stylesInjected = true;
    return;
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = STANDARD_PRINT_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
};

/**
 * Get print template wrapper HTML (for future use if needed)
 * This can be used to wrap content with print template header/footer
 * @param content - Content HTML string
 * @param printSettings - Print settings for template
 * @returns Wrapped HTML string
 */
export const getPrintTemplateWrapper = (
  content: string,
  printSettings: PrintSettings
): string => {
  const {
    companyName = '',
    companyAddress = '',
    companyContact = '',
    logoUrl,
    showLogo = false,
    headerText = '',
    footerText = '',
    showDatePrinted = false
  } = printSettings;

  const logoHtml = showLogo && logoUrl
    ? `<img src="${logoUrl}" alt="Company Logo" style="max-height: 80px; width: auto;" />`
    : '';

  const headerHtml = `
    <div style="margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #1e293b;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="display: flex; gap: 16px; align-items: center;">
          ${logoHtml}
          <div>
            <h1 style="font-size: 24px; font-weight: bold; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">${companyName}</h1>
            ${headerText ? `<p style="font-size: 14px; color: #64748b; font-style: italic; margin-top: 4px;">${headerText}</p>` : ''}
          </div>
        </div>
        <div style="text-align: right; font-size: 14px; color: #475569;">
          <div style="white-space: pre-wrap;">${companyAddress}</div>
          <div style="margin-top: 4px; font-weight: 500;">${companyContact}</div>
        </div>
      </div>
    </div>
  `;

  const footerHtml = `
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 12px; color: #64748b;">
      ${footerText ? `<p style="font-weight: 500; margin-bottom: 4px;">${footerText}</p>` : ''}
      ${showDatePrinted ? `<p>Printed on: ${new Date().toLocaleString()}</p>` : ''}
    </div>
  `;

  return `${headerHtml}${content}${footerHtml}`;
};

