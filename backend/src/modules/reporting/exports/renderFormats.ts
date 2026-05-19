type Row = Record<string, unknown>;

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/["\r\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsvBuffer(
  rows: Row[],
  columnOrder: string[],
  labels: Record<string, string>
): Buffer {
  const header = columnOrder.map((k) => escapeCsvCell(labels[k] ?? k)).join(',');
  const lines = rows.map((r) => columnOrder.map((k) => escapeCsvCell(r[k])).join(','));
  return Buffer.from(`${header}\n${lines.join('\n')}\n`, 'utf-8');
}

export async function buildXlsxBuffer(
  rows: Row[],
  columnOrder: string[],
  labels: Record<string, string>
): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const header = columnOrder.map((k) => labels[k] ?? k);
  const data = rows.map((r) => columnOrder.map((k) => r[k]));
  const aoa = [header, ...data];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Report');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  return Buffer.from(out);
}

export async function buildPdfGridBuffer(params: {
  title: string;
  columns: string[];
  labels: Record<string, string>;
  rows: Row[];
}): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const grid = preparePdfGridForExport(params);
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));
  doc.fontSize(14).text(params.title, { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9);
  // Simple row layout
  for (let r = -1; r < grid.rows.length; r++) {
    const parts = r < 0 ? grid.titles : grid.rows[r]!;
    doc.text(parts.join('  |  '), { continued: false, width: 780 });
    if (doc.y > 540) doc.addPage();
  }
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

export function preparePdfGridForExport(params: {
  columns: string[];
  labels: Record<string, string>;
  rows: Row[];
}): { titles: string[]; rows: string[][] } {
  const titles = params.columns.map((c) => String(params.labels[c] ?? c));
  const rows = params.rows.map((row) =>
    params.columns.map((col) =>
      row[col] === null || row[col] === undefined ? '' : String(row[col])
    )
  );
  return { titles, rows };
}
