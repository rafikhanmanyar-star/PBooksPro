/**
 * Generates doc/PAYROLL_MODULE_UAT.docx
 * Run: node scripts/generate-payroll-uat-docx.mjs
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
import {
  META,
  UI_SHELL,
  RECENT_CHANGES,
  TEST_SECTIONS,
  E2E_STEPS,
  API_SMOKE,
} from './payroll-uat-test-cases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'doc', 'PAYROLL_MODULE_UAT.docx');

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 120 },
  });
}

function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });
}

function checkbox(text) {
  return new Paragraph({ text: `☐ ${text}`, spacing: { after: 60 } });
}

function multilineCell(text) {
  const lines = String(text ?? '').split('\n');
  return lines.map((line, i) =>
    new Paragraph({
      children: [new TextRun({ text: line, size: i === 0 ? 20 : 18 })],
      spacing: { after: i < lines.length - 1 ? 40 : 0 },
    })
  );
}

function tableFromRows(headers, rows, colWidths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h, i) =>
        new TableCell({
          width: colWidths?.[i] ? { size: colWidths[i], type: WidthType.PERCENTAGE } : undefined,
          shading: { type: ShadingType.CLEAR, fill: 'E8EEF4' },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
        })
    ),
  });
  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell, i) =>
          new TableCell({
            width: colWidths?.[i] ? { size: colWidths[i], type: WidthType.PERCENTAGE } : undefined,
            children: multilineCell(cell),
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

function caseTable(cases) {
  return tableFromRows(
    ['ID', 'Test case', 'Persona', 'UI guide', 'Expected', 'Result', 'Tester', 'Date', 'Notes'],
    cases.map((c) => [c.id, c.name, c.persona ?? 'Payroll Admin', c.uiGuide, c.expected, '', '', '', '']),
    [6, 11, 9, 28, 16, 6, 7, 7, 10]
  );
}

const ALL_IDS = TEST_SECTIONS.flatMap((s) => s.cases.map((c) => c.id));

const children = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'PBooks Pro', bold: true, size: 36 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Payroll Module', bold: true, size: 32 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: 'User Acceptance Test (UAT)', size: 28 })],
  }),
  tableFromRows(
    ['Field', 'Value'],
    [
      ['Document ID', META.id],
      ['UAT version', META.version],
      ['Product build', META.productVersion],
      ['Last updated', META.date],
      ['Changelog', META.changelog],
    ],
    [28, 72]
  ),
  new Paragraph({ text: '', pageBreakBefore: true }),

  heading('What changed in v2.0'),
  ...RECENT_CHANGES.map(bullet),

  heading('UI navigation reference'),
  ...UI_SHELL.split('\n').map((line) => bullet(line.replace(/^•\s*/, ''))),

  heading('Test environment'),
  tableFromRows(
    ['Item', 'Value'],
    [
      ['Stack', 'npm run test:staging (API :3001 + Electron)'],
      ['Database', 'pBookspro_Staging (PostgreSQL only)'],
      ['SoD testing', 'Two users: Preparer (runs.create) + Approver (runs.approve, not creator)'],
      ['Login', 'test company / Rafi / Rafi1234'],
    ],
    [30, 70]
  ),
  heading('Pre-flight', HeadingLevel.HEADING_2),
  ...['Migrations applied', 'Bank account + expense category exist', 'Second approver user configured'].map(checkbox),

  heading('How to execute'),
  bullet('Follow UI guide column: sidebar → Payroll sub-tab → button → modal.'),
  bullet('Record Pass / Fail / Blocked / N/A.'),
  bullet('SoD tests (Section 7) require two different user sessions.'),

  ...TEST_SECTIONS.flatMap(({ section, cases }) => [
    new Paragraph({ text: '', pageBreakBefore: true }),
    heading(section),
    caseTable(cases),
  ]),

  heading('End-to-end happy path (with SoD)'),
  tableFromRows(
    ['Step', 'Action', 'UI guide', 'Verification', 'Result'],
    E2E_STEPS.map((r) => [r.step, r.action, r.uiGuide, r.verification, '']),
    [6, 18, 38, 28, 10]
  ),

  heading('API smoke checks'),
  tableFromRows(
    ['Endpoint', 'Method', 'Expect', 'Related UI', 'Result'],
    API_SMOKE.map((r) => [r.endpoint, r.method, r.expect, r.uiGuide, '']),
    [34, 8, 14, 36, 8]
  ),

  heading('Acceptance criteria'),
  ...[
    'E2E path (8 steps) passes on staging',
    'SoD approval (SOD-01 through SOD-05) passes with two users',
    'Audit Log (AUD-01 through AUD-05) shows events after mutations',
    'Void/delete payslip flows (CYC-06, CYC-07) behave correctly',
    'No open Critical/High defects',
  ].map(checkbox),

  heading('Execution log'),
  tableFromRows(
    ['ID', 'Result', 'Tester', 'Date', 'Notes'],
    ALL_IDS.map((id) => [id, '', '', '', '']),
    [12, 12, 18, 14, 44]
  ),

  heading('Sign-off'),
  tableFromRows(
    ['Role', 'Name', 'Signature', 'Date'],
    [
      ['QA / UAT Lead', '', '', ''],
      ['HR / Payroll Owner', '', '', ''],
      ['Engineering', '', '', ''],
    ],
    [25, 25, 25, 25]
  ),
];

const doc = new Document({
  title: META.title,
  description: META.id,
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
    const alt = outPath.replace(/\.docx$/, `_v${META.version}.docx`);
    fs.writeFileSync(alt, buffer);
    console.log(`Target locked; wrote ${alt}`);
  } else throw e;
}
