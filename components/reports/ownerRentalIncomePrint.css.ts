/**
 * Print / PDF styles for Owner Rental Income ledger (7 columns on A4 landscape).
 * Screen table sizing uses Tailwind on the component — these rules apply only when printing or capturing PDF.
 */
const PRINT_CTX =
  '.report-print-content.owner-rental-income-report-print, .owner-rental-income-print-root.pdf-capture-active';

export const OWNER_RENTAL_INCOME_PRINT_CSS = `
  @page owner-rental-income {
    size: A4 landscape;
    margin: 8mm;
  }

  @media print {
    body.print-portal-active .report-print-content.owner-rental-income-report-print,
    body.print-portal-active .owner-rental-income-print-root {
      page: owner-rental-income;
    }
  }

  ${PRINT_CTX} {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    padding: 0 !important;
    background: #fff !important;
    color: #111 !important;
  }

  .owner-rental-income-print-header {
    display: none;
    margin-bottom: 8px;
    text-align: center;
    color: #111;
  }

  ${PRINT_CTX} .owner-rental-income-print-header {
    display: block;
  }

  @media print {
    .owner-rental-income-print-header {
      display: block !important;
    }
  }

  .owner-rental-income-print-header h2 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 700;
  }

  .owner-rental-income-print-header p {
    margin: 0;
    font-size: 10px;
    color: #444;
  }

  ${PRINT_CTX} [data-print-scroll-container] {
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
    border: none !important;
    border-radius: 0 !important;
  }

  ${PRINT_CTX} .owner-rental-income-print-table {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    font-size: 8px !important;
    line-height: 1.25 !important;
  }

  @media print {
    .owner-rental-income-print-root .owner-rental-income-print-table {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      font-size: 8px !important;
      line-height: 1.25 !important;
    }
  }

  ${PRINT_CTX} .owner-rental-income-print-table th,
  ${PRINT_CTX} .owner-rental-income-print-table td {
    white-space: nowrap !important;
    padding: 3px 4px !important;
    vertical-align: middle !important;
    border-bottom: 1px solid #ddd !important;
  }

  /* Text columns — ellipsis only where space is tight */
  ${PRINT_CTX} .owner-rental-income-print-table th.col-particulars,
  ${PRINT_CTX} .owner-rental-income-print-table td:nth-child(4) {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  /* Amount columns — always show full figures (no truncation) */
  ${PRINT_CTX} .owner-rental-income-print-table th.col-rent-in,
  ${PRINT_CTX} .owner-rental-income-print-table th.col-paid-out,
  ${PRINT_CTX} .owner-rental-income-print-table th.col-balance,
  ${PRINT_CTX} .owner-rental-income-print-table tbody td:nth-child(5),
  ${PRINT_CTX} .owner-rental-income-print-table tbody td:nth-child(6),
  ${PRINT_CTX} .owner-rental-income-print-table tbody td:nth-child(7),
  ${PRINT_CTX} .owner-rental-income-print-table tfoot td:nth-child(2),
  ${PRINT_CTX} .owner-rental-income-print-table tfoot td:nth-child(3),
  ${PRINT_CTX} .owner-rental-income-print-table tfoot td:nth-child(4) {
    overflow: visible !important;
    text-overflow: clip !important;
  }

  @media print {
    .owner-rental-income-print-root .owner-rental-income-print-table th,
    .owner-rental-income-print-root .owner-rental-income-print-table td {
      white-space: nowrap !important;
      padding: 3px 4px !important;
      vertical-align: middle !important;
      border-bottom: 1px solid #ddd !important;
    }
    .owner-rental-income-print-root .owner-rental-income-print-table th.col-particulars,
    .owner-rental-income-print-root .owner-rental-income-print-table td:nth-child(4) {
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    .owner-rental-income-print-root .owner-rental-income-print-table th.col-rent-in,
    .owner-rental-income-print-root .owner-rental-income-print-table th.col-paid-out,
    .owner-rental-income-print-root .owner-rental-income-print-table th.col-balance,
    .owner-rental-income-print-root .owner-rental-income-print-table tbody td:nth-child(5),
    .owner-rental-income-print-root .owner-rental-income-print-table tbody td:nth-child(6),
    .owner-rental-income-print-root .owner-rental-income-print-table tbody td:nth-child(7),
    .owner-rental-income-print-root .owner-rental-income-print-table tfoot td:nth-child(2),
    .owner-rental-income-print-root .owner-rental-income-print-table tfoot td:nth-child(3),
    .owner-rental-income-print-root .owner-rental-income-print-table tfoot td:nth-child(4) {
      overflow: visible !important;
      text-overflow: clip !important;
    }
  }

  ${PRINT_CTX} .owner-rental-income-print-table thead th {
    background: #f3f4f6 !important;
    color: #111 !important;
    font-weight: 600 !important;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    border-bottom: 2px solid #999 !important;
  }

  @media print {
    .owner-rental-income-print-root .owner-rental-income-print-table thead th {
      background: #f3f4f6 !important;
      color: #111 !important;
      font-weight: 600 !important;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      border-bottom: 2px solid #999 !important;
    }
  }

  ${PRINT_CTX} .owner-rental-income-print-table .col-date { width: 8%; }
  ${PRINT_CTX} .owner-rental-income-print-table .col-owner { width: 11%; }
  ${PRINT_CTX} .owner-rental-income-print-table .col-property { width: 9%; }
  ${PRINT_CTX} .owner-rental-income-print-table .col-particulars { width: 30%; }
  ${PRINT_CTX} .owner-rental-income-print-table .col-rent-in { width: 14%; }
  ${PRINT_CTX} .owner-rental-income-print-table .col-paid-out { width: 14%; }
  ${PRINT_CTX} .owner-rental-income-print-table .col-balance { width: 14%; }

  @media print {
    .owner-rental-income-print-root .owner-rental-income-print-table .col-date { width: 8%; }
    .owner-rental-income-print-root .owner-rental-income-print-table .col-owner { width: 11%; }
    .owner-rental-income-print-root .owner-rental-income-print-table .col-property { width: 9%; }
    .owner-rental-income-print-root .owner-rental-income-print-table .col-particulars { width: 30%; }
    .owner-rental-income-print-root .owner-rental-income-print-table .col-rent-in { width: 14%; }
    .owner-rental-income-print-root .owner-rental-income-print-table .col-paid-out { width: 14%; }
    .owner-rental-income-print-root .owner-rental-income-print-table .col-balance { width: 14%; }
  }

  ${PRINT_CTX} .owner-rental-income-print-table th.col-rent-in,
  ${PRINT_CTX} .owner-rental-income-print-table th.col-paid-out,
  ${PRINT_CTX} .owner-rental-income-print-table th.col-balance,
  ${PRINT_CTX} .owner-rental-income-print-table tbody td:nth-child(5),
  ${PRINT_CTX} .owner-rental-income-print-table tbody td:nth-child(6),
  ${PRINT_CTX} .owner-rental-income-print-table tbody td:nth-child(7),
  ${PRINT_CTX} .owner-rental-income-print-table tfoot td:nth-child(2),
  ${PRINT_CTX} .owner-rental-income-print-table tfoot td:nth-child(3),
  ${PRINT_CTX} .owner-rental-income-print-table tfoot td:nth-child(4) {
    text-align: right !important;
    font-variant-numeric: tabular-nums;
  }

  @media print {
    .owner-rental-income-print-root .owner-rental-income-print-table th.col-rent-in,
    .owner-rental-income-print-root .owner-rental-income-print-table th.col-paid-out,
    .owner-rental-income-print-root .owner-rental-income-print-table th.col-balance,
    .owner-rental-income-print-root .owner-rental-income-print-table tbody td:nth-child(5),
    .owner-rental-income-print-root .owner-rental-income-print-table tbody td:nth-child(6),
    .owner-rental-income-print-root .owner-rental-income-print-table tbody td:nth-child(7),
    .owner-rental-income-print-root .owner-rental-income-print-table tfoot td:nth-child(2),
    .owner-rental-income-print-root .owner-rental-income-print-table tfoot td:nth-child(3),
    .owner-rental-income-print-root .owner-rental-income-print-table tfoot td:nth-child(4) {
      text-align: right !important;
      font-variant-numeric: tabular-nums;
    }
  }

  ${PRINT_CTX} .owner-rental-income-print-table .text-success {
    color: #15803d !important;
  }

  ${PRINT_CTX} .owner-rental-income-print-table .text-danger {
    color: #b91c1c !important;
  }

  ${PRINT_CTX} .owner-rental-income-print-table .text-primary {
    color: #1d4ed8 !important;
  }

  ${PRINT_CTX} .owner-rental-income-print-table .text-app-text,
  ${PRINT_CTX} .owner-rental-income-print-table .text-app-muted {
    color: #111 !important;
  }

  ${PRINT_CTX} .owner-rental-income-print-table tfoot td {
    font-weight: 700 !important;
    border-top: 2px solid #999 !important;
    background: #f9fafb !important;
  }

  @media print {
    .owner-rental-income-print-root .owner-rental-income-print-table .text-success {
      color: #15803d !important;
    }
    .owner-rental-income-print-root .owner-rental-income-print-table .text-danger {
      color: #b91c1c !important;
    }
    .owner-rental-income-print-root .owner-rental-income-print-table .text-primary {
      color: #1d4ed8 !important;
    }
    .owner-rental-income-print-root .owner-rental-income-print-table .text-app-text,
    .owner-rental-income-print-root .owner-rental-income-print-table .text-app-muted {
      color: #111 !important;
    }
    .owner-rental-income-print-root .owner-rental-income-print-table tfoot td {
      font-weight: 700 !important;
      border-top: 2px solid #999 !important;
      background: #f9fafb !important;
    }
  }
`;
