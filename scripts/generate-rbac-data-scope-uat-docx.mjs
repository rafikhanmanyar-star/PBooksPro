/**
 * Converts docs/security/RBAC_DATA_SCOPE_UAT.md → RBAC_DATA_SCOPE_UAT.docx
 * Run: node scripts/generate-rbac-data-scope-uat-docx.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mdPath = path.join(root, 'docs', 'security', 'RBAC_DATA_SCOPE_UAT.md');
const outPath = path.join(root, 'docs', 'security', 'RBAC_DATA_SCOPE_UAT.docx');

function parseInline(text) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index) }));
    const token = m[0];
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Consolas', size: 20 }));
    }
    last = m.index + token.length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last) }));
  return runs.length ? runs : [new TextRun({ text: text || '' })];
}

function para(text, opts = {}) {
  return new Paragraph({
    children: parseInline(text),
    spacing: { after: 120 },
    ...opts,
  });
}

function heading(text, level) {
  const map = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  };
  return new Paragraph({
    children: parseInline(text.replace(/^#+\s*/, '')),
    heading: map[level] ?? HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    children: parseInline(text),
    bullet: { level },
    spacing: { after: 60 },
  });
}

function codeBlock(lines) {
  return lines.map((line) =>
    new Paragraph({
      children: [new TextRun({ text: line, font: 'Consolas', size: 18 })],
      spacing: { after: 40 },
      indent: { left: 360 },
    })
  );
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isTableSep(line) {
  return /^\|?[\s\-:|]+\|?$/.test(line.trim()) && line.includes('-');
}

function tableFromMarkdown(headers, rows) {
  const colCount = headers.length;
  const colWidth = Math.floor(100 / colCount);
  const widths = headers.map(() => colWidth);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: widths[i], type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: 'E8EEF4' },
        children: [new Paragraph({ children: parseInline(h) })],
      })
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell, i) =>
          new TableCell({
            width: { size: widths[i] ?? colWidth, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: parseInline(cell) })],
          })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
    rows: [headerRow, ...dataRows],
  });
}

function parseMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '---') {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', lines: code });
      continue;
    }

    if (line.startsWith('#')) {
      const level = line.match(/^#+/)[0].length;
      blocks.push({ type: 'heading', level: Math.min(level, 3), text: line.replace(/^#+\s*/, '') });
      i += 1;
      continue;
    }

    if (line.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (/^-\s/.test(line)) {
      blocks.push({ type: 'bullet', text: line.replace(/^-\s*/, '') });
      i += 1;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      blocks.push({ type: 'numbered', text: line.replace(/^\d+\.\s*/, ''), num: line.match(/^(\d+)/)[1] });
      i += 1;
      continue;
    }

    if (line.startsWith('>')) {
      blocks.push({ type: 'quote', text: line.replace(/^>\s?/, '') });
      i += 1;
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    blocks.push({ type: 'para', text: line });
    i += 1;
  }

  return blocks;
}

function blocksToDocx(blocks) {
  const children = [];

  // Title page from first heading + metadata paras
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'PBooks Pro', bold: true, size: 36 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: 'RBAC Data Scope — UAT', bold: true, size: 32 })],
    })
  );

  let skippedTitle = false;
  for (const block of blocks) {
    if (!skippedTitle && block.type === 'heading' && block.level === 1) {
      skippedTitle = true;
      continue;
    }

    switch (block.type) {
      case 'heading':
        if (block.level === 1) {
          children.push(new Paragraph({ text: '', pageBreakBefore: true }));
        }
        children.push(heading(block.text, block.level));
        break;
      case 'para':
        children.push(para(block.text));
        break;
      case 'bullet':
        children.push(bullet(block.text));
        break;
      case 'numbered':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `${block.num}. ${block.text}` })],
            spacing: { after: 60 },
            indent: { left: 360 },
          })
        );
        break;
      case 'quote':
        children.push(
          new Paragraph({
            children: parseInline(block.text),
            spacing: { after: 120 },
            indent: { left: 360 },
            border: { left: { color: '888888', size: 6, space: 8 } },
          })
        );
        break;
      case 'code':
        children.push(...codeBlock(block.lines));
        break;
      case 'table':
        children.push(tableFromMarkdown(block.headers, block.rows));
        children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        break;
      case 'hr':
        children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        break;
      default:
        break;
    }
  }

  return children;
}

const md = fs.readFileSync(mdPath, 'utf8');
const blocks = parseMarkdown(md);
const children = blocksToDocx(blocks);

const doc = new Document({
  title: 'RBAC Data Scope UAT',
  description: 'RBAC_DATA_SCOPE_UAT v1.0',
  sections: [
    {
      properties: {
        page: {
          orientation: PageOrientation.LANDSCAPE,
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
try {
  fs.writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
} catch (e) {
  if (e?.code === 'EBUSY') {
    const alt = outPath.replace(/\.docx$/, '_v1.0.docx');
    fs.writeFileSync(alt, buffer);
    console.log(`Target locked; wrote ${alt}`);
  } else throw e;
}
