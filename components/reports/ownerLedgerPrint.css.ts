/**
 * Print-only styles for Owner Ledger (Project) report.
 * Scoped by #print-area — use with window.print(), not the portal print flow.
 */
export const OWNER_LEDGER_PRINT_CSS = `
@media print {
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  html, body {
    height: auto !important;
    overflow: visible !important;
    background: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    font-size: 12px;
    line-height: 1.35;
    color: #000 !important;
  }

  /* App shell — hide navigation, header, mobile footer */
  body header.sticky,
  body aside.fixed,
  body footer {
    display: none !important;
  }

  /* KPI panel + “show KPI” tab (fixed right, slate) — not matched by aside.fixed */
  body .fixed.right-0.z-30,
  body .fixed.top-0.right-0.h-full.bg-slate-800 {
    display: none !important;
  }

  .no-print,
  .owner-ledger-no-print {
    display: none !important;
  }

  /* LRU persistent routes: remove inactive shells from print */
  #main-container > .layout-content-area.opacity-0 {
    display: none !important;
  }

  /* Root flex shell — h-screen collapses badly in print */
  #root > div.flex.h-screen {
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  #root > div.flex.h-screen > div.flex-1.flex.flex-col {
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  .main-content-offset {
    padding-left: 0 !important;
    padding-right: 0 !important;
    margin-right: 0 !important;
  }

  main#main-container {
    position: relative !important;
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    flex: 0 0 auto !important;
    background: white !important;
  }

  /* Visible route only (Tailwind opacity-100 on active persistent page) */
  #main-container > .layout-content-area.opacity-100 {
    position: relative !important;
    inset: auto !important;
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    opacity: 1 !important;
    visibility: visible !important;
    background: white !important;
  }

  #print-area {
    position: relative !important;
    width: 100% !important;
    max-width: 100% !important;
    padding: 12px !important;
    margin: 0 !important;
    background: white !important;
    box-sizing: border-box !important;
    color: #111 !important;
  }

  #print-area * {
    box-sizing: border-box;
  }

  /* Dark theme: app text tokens print near-white on white paper — force ink */
  #print-area .text-app-text,
  #print-area .text-app-muted {
    color: #111827 !important;
  }

  #print-area .text-ds-danger {
    color: #b91c1c !important;
  }

  #print-area .text-ds-success {
    color: #15803d !important;
  }

  #print-area .text-primary {
    color: #1d4ed8 !important;
  }

  #print-area .bg-app-card,
  #print-area .bg-app-toolbar,
  #print-area .bg-app-table-header {
    background-color: #fff !important;
  }

  #print-area .print-container-inner {
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: white !important;
  }

  #print-area h1,
  #print-area h2,
  #print-area h3 {
    margin: 0 0 0.35em 0;
    color: #000 !important;
  }

  #print-area .owner-ledger-title-block {
    text-align: center;
    margin-bottom: 14px;
    page-break-after: avoid;
  }

  #print-area .owner-ledger-title-block h2 {
    font-size: 18px;
    font-weight: 700;
  }

  #print-area .owner-ledger-title-block p {
    margin: 4px 0 0 0;
    font-size: 11px;
    color: #333 !important;
  }

  /* Company header (ReportHeader) */
  #print-area .owner-ledger-company-header {
    display: block !important;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 2px solid #1e293b !important;
    page-break-after: avoid;
  }

  /* Summary grids */
  #print-area .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fafafa !important;
    page-break-inside: avoid;
  }

  #print-area .summary-grid .summary-col {
    font-size: 11px;
    line-height: 1.45;
  }

  #print-area .summary-grid strong {
    font-weight: 600;
  }

  /* Ledger table */
  #print-area .owner-ledger-print-table {
    width: 100% !important;
    border-collapse: collapse !important;
    margin-top: 8px;
    font-size: 11px;
    table-layout: fixed;
  }

  #print-area .owner-ledger-print-table thead {
    display: table-header-group !important;
  }

  #print-area .owner-ledger-print-table tfoot {
    display: table-footer-group !important;
  }

  #print-area .owner-ledger-print-table th,
  #print-area .owner-ledger-print-table td {
    border: 1px solid #ccc !important;
    padding: 6px 5px !important;
    text-align: left;
    vertical-align: top;
    word-wrap: break-word;
  }

  #print-area .owner-ledger-print-table th {
    background: #f3f3f3 !important;
    font-weight: 600;
    color: #000 !important;
  }

  #print-area .owner-ledger-print-table td.num,
  #print-area .owner-ledger-print-table th.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  #print-area .owner-ledger-print-table tr {
    page-break-inside: avoid;
  }

  #print-area .owner-ledger-print-table tr.totals td {
    font-weight: 700 !important;
    background: #f9f9f9 !important;
    border-top: 2px solid #999 !important;
  }

  #print-area .owner-ledger-table-wrap {
    overflow: visible !important;
    max-height: none !important;
    min-height: 0 !important;
    border: 1px solid #ccc !important;
    border-radius: 4px;
  }

  /* Report settings footer */
  #print-area .owner-ledger-report-footer {
    display: block !important;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #ccc;
    font-size: 10px;
    color: #555 !important;
    text-align: center;
  }

  #print-area .owner-ledger-print-footer {
    margin-top: 16px;
    padding-top: 8px;
    font-size: 10px;
    text-align: center;
    color: #666 !important;
    border-top: 1px solid #ddd;
  }

  /* Drop screen-only chrome inside print area */
  #print-area .shadow-ds-card,
  #print-area .sticky {
    box-shadow: none !important;
    position: static !important;
  }
}
`;
