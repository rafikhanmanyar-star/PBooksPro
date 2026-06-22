/**
 * Generates docs/UAT/PBooksPro_Master_UAT_Manual.docx and .md
 * Run: node scripts/generate-master-uat.mjs
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
  PageBreak,
  PageOrientation,
} from 'docx';
import {
  META,
  VERSION_HISTORY,
  TEST_ENV,
  EXECUTION_GUIDELINES,
} from './master-uat/helpers.mjs';
import { CHAPTERS, ALL_CASES, getCoverageSummary, EXCLUDED_FEATURES } from './master-uat/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'UAT');
const docxPath = path.join(outDir, 'PBooksPro_Master_UAT_Manual.docx');
const mdPath = path.join(outDir, 'PBooksPro_Master_UAT_Manual.md');

const coverage = getCoverageSummary();

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

function multilineParas(text, size = 18) {
  return String(text ?? '')
    .split('\n')
    .map((line, i) =>
      new Paragraph({
        children: [new TextRun({ text: line, size })],
        spacing: { after: i < String(text).split('\n').length - 1 ? 40 : 0 },
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
            children: multilineParas(cell),
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

function testCaseBlock(c) {
  const ni = c.notImplemented ? ' [NOT IMPLEMENTED]' : '';
  const rows = [
    ['Test Case ID', c.id],
    ['Module', c.module],
    ['Feature', c.feature + ni],
    ['Objective', c.objective],
    ['Navigation Path', c.navigation],
    ['Prerequisites', c.prerequisites],
    ['Test Data', c.testData],
    ['Step-by-Step Instructions', c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')],
    ['Expected Result', c.expected],
    ['Actual Result', ''],
    ['Status (Pass / Fail / Blocked / N/A)', ''],
    ['Screenshot Reference', ''],
    ['Remarks', c.defaultRemarks ?? ''],
  ];
  return [
    new Paragraph({
      spacing: { before: 180, after: 60 },
      children: [new TextRun({ text: `${c.id} — ${c.feature}`, bold: true, size: 22 })],
    }),
    tableFromRows(['Field', 'Value'], rows, [28, 72]),
  ];
}

function chapterIntro(ch) {
  return [
    heading(`Chapter ${ch.number} — ${ch.title}`),
    heading('Purpose', HeadingLevel.HEADING_2),
    para(ch.purpose),
    heading('Business Flow', HeadingLevel.HEADING_2),
    ...ch.businessFlow.split('\n').map((line) => bullet(line)),
    heading('Required Test Data', HeadingLevel.HEADING_2),
    ...ch.requiredTestData.map(bullet),
    heading('Dependencies', HeadingLevel.HEADING_2),
    ...ch.dependencies.map(bullet),
    heading('Expected Outputs', HeadingLevel.HEADING_2),
    ...ch.expectedOutputs.map(bullet),
  ];
}

function chapterOutro(ch) {
  return [
    heading('Chapter Completion Checklist', HeadingLevel.HEADING_2),
    ...ch.checklist.map((item) => new Paragraph({ text: `☐ ${item}`, spacing: { after: 60 } })),
    tableFromRows(
      ['Metric', 'Count'],
      [
        ['Pass Count', ''],
        ['Fail Count', ''],
        ['Blocked / N/A Count', ''],
        ['Observations', ''],
      ],
      [35, 65]
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildDocxChildren() {
  const children = [
    // Cover page
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 200 },
      children: [new TextRun({ text: 'PBooks Pro', bold: true, size: 56 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Master User Acceptance Testing (UAT) Manual', bold: true, size: 36 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: 'Official Acceptance Document for All Releases', size: 24, italics: true })],
    }),
    tableFromRows(
      ['Field', 'Value'],
      [
        ['Document ID', META.id],
        ['Version', META.version],
        ['Product Build', META.productVersion],
        ['Last Updated', META.date],
        ['Document Owner', META.documentOwner],
        ['Total Test Cases', String(coverage.totalCases)],
      ],
      [30, 70]
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // Version history
    heading('Version History'),
    tableFromRows(
      ['Version', 'Date', 'Author', 'Changes'],
      VERSION_HISTORY.map((v) => [v.version, v.date, v.author, v.changes]),
      [12, 15, 20, 53]
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // TOC
    heading('Table of Contents'),
    ...[
      'Test Execution Guidelines',
      'UAT Coverage Summary',
      'Features Excluded / Not Implemented',
      ...CHAPTERS.map((ch) => `Chapter ${ch.number} — ${ch.title} (${ch.idRange})`),
      'UAT Summary Sheet',
      'Business Sign-Off Page',
    ].map((item, i) => para(`${i + 1}. ${item}`)),
    new Paragraph({ children: [new PageBreak()] }),

    // Execution guidelines
    heading('Test Execution Guidelines'),
    ...EXECUTION_GUIDELINES.map(bullet),
    heading('Test Environment', HeadingLevel.HEADING_2),
    tableFromRows(
      ['Item', 'Value'],
      Object.entries(TEST_ENV).map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').trim(), v]),
      [25, 75]
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // Coverage summary
    heading('UAT Coverage Summary'),
    tableFromRows(
      ['Chapter', 'Title', 'ID Range', 'Cases', 'NOT IMPLEMENTED', 'Modules'],
      coverage.chapters.map((c) => [
        String(c.chapter),
        c.title,
        c.idRange,
        String(c.total),
        String(c.notImplemented),
        c.modules,
      ]),
      [6, 18, 12, 8, 12, 44]
    ),
    para(`Total test cases: ${coverage.totalCases}`, { bold: true }),
    para(`Implemented test scenarios: ${coverage.implementedCases}`, { bold: true }),
    para(`NOT IMPLEMENTED markers in manual: ${coverage.notImplementedCases}`, { bold: true }),
    para(`Modules covered: ${coverage.modulesCovered.join(', ')}`, { bold: true }),
    new Paragraph({ children: [new PageBreak()] }),

    // Excluded features
    heading('Features Excluded / Not Implemented'),
    tableFromRows(
      ['Feature', 'Reason'],
      EXCLUDED_FEATURES.map((f) => [f.feature, f.reason]),
      [35, 65]
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // Chapters
    ...CHAPTERS.flatMap((ch) => [
      ...chapterIntro(ch),
      heading('Test Cases', HeadingLevel.HEADING_2),
      ...ch.cases.flatMap((c) => testCaseBlock(c)),
      ...chapterOutro(ch),
    ]),

    // Summary sheet
    heading('UAT Summary Sheet'),
    tableFromRows(
      ['Module / Chapter', 'Passed', 'Failed', 'Blocked', 'Not Tested', 'Overall Result'],
      CHAPTERS.map((ch) => [`Ch.${ch.number} ${ch.title}`, '', '', '', '', '']),
      [34, 10, 10, 10, 12, 24]
    ),
    tableFromRows(
      ['Grand Total', 'Passed', 'Failed', 'Blocked', 'Not Tested', 'Acceptance'],
      [['All Modules', '', '', '', '', '']],
      [34, 10, 10, 10, 12, 24]
    ),
    new Paragraph({ children: [new PageBreak()] }),

    // Sign-off
    heading('Business Sign-Off Page'),
    tableFromRows(
      ['Role', 'Name', 'Signature', 'Date'],
      [
        ['Prepared By', '', '', ''],
        ['Tested By', '', '', ''],
        ['Reviewed By', '', '', ''],
        ['Approved By', '', '', ''],
      ],
      [22, 26, 26, 26]
    ),
    para('Acceptance Status: ☐ Accepted  ☐ Accepted with Conditions  ☐ Rejected'),
    para('Conditions / Notes:'),
    para('_'.repeat(80)),
    para('_'.repeat(80)),
  ];

  return children;
}

function buildMarkdown() {
  const lines = [];
  const ln = (s = '') => lines.push(s);

  ln(`# ${META.title}`);
  ln();
  ln(`| Field | Value |`);
  ln(`|-------|-------|`);
  ln(`| Document ID | ${META.id} |`);
  ln(`| Version | ${META.version} |`);
  ln(`| Product Build | ${META.productVersion} |`);
  ln(`| Last Updated | ${META.date} |`);
  ln(`| Total Test Cases | ${coverage.totalCases} |`);
  ln();
  ln(`> Regenerate: \`node scripts/generate-master-uat.mjs\``);
  ln();

  ln('## Version History');
  ln();
  ln('| Version | Date | Author | Changes |');
  ln('|---------|------|--------|---------|');
  for (const v of VERSION_HISTORY) {
    ln(`| ${v.version} | ${v.date} | ${v.author} | ${v.changes} |`);
  }
  ln();

  ln('## Test Execution Guidelines');
  ln();
  for (const g of EXECUTION_GUIDELINES) ln(`- ${g}`);
  ln();

  ln('## Test Environment');
  ln();
  ln('| Item | Value |');
  ln('|------|-------|');
  for (const [k, v] of Object.entries(TEST_ENV)) {
    ln(`| ${k} | ${v} |`);
  }
  ln();

  ln('## UAT Coverage Summary');
  ln();
  ln('| Chapter | Title | ID Range | Cases | NOT IMPLEMENTED | Modules |');
  ln('|---------|-------|----------|-------|-----------------|---------|');
  for (const c of coverage.chapters) {
    ln(`| ${c.chapter} | ${c.title} | ${c.idRange} | ${c.total} | ${c.notImplemented} | ${c.modules} |`);
  }
  ln();
  ln(`**Total test cases:** ${coverage.totalCases}`);
  ln(`**Implemented scenarios:** ${coverage.implementedCases}`);
  ln(`**NOT IMPLEMENTED markers:** ${coverage.notImplementedCases}`);
  ln(`**Modules covered:** ${coverage.modulesCovered.join(', ')}`);
  ln();

  ln('## Features Excluded / Not Implemented');
  ln();
  ln('| Feature | Reason |');
  ln('|---------|--------|');
  for (const f of EXCLUDED_FEATURES) {
    ln(`| ${f.feature} | ${f.reason} |`);
  }
  ln();

  for (const ch of CHAPTERS) {
    ln(`---`);
    ln();
    ln(`# Chapter ${ch.number} — ${ch.title}`);
    ln();
    ln(`**Test Case Range:** ${ch.idRange}`);
    ln();
    ln('## Purpose');
    ln(ch.purpose);
    ln();
    ln('## Business Flow');
    ln('```text');
    ln(ch.businessFlow);
    ln('```');
    ln();
    ln('## Required Test Data');
    for (const t of ch.requiredTestData) ln(`- ${t}`);
    ln();
    ln('## Dependencies');
    for (const d of ch.dependencies) ln(`- ${d}`);
    ln();
    ln('## Expected Outputs');
    for (const o of ch.expectedOutputs) ln(`- ${o}`);
    ln();
    ln('## Test Cases');
    ln();

    for (const c of ch.cases) {
      const ni = c.notImplemented ? ' **[NOT IMPLEMENTED]**' : '';
      ln(`### ${c.id} — ${c.feature}${ni}`);
      ln();
      ln('| Field | Value |');
      ln('|-------|-------|');
      ln(`| Module | ${c.module} |`);
      ln(`| Feature | ${c.feature} |`);
      ln(`| Objective | ${c.objective} |`);
      ln(`| Navigation Path | ${c.navigation} |`);
      ln(`| Prerequisites | ${c.prerequisites} |`);
      ln(`| Test Data | ${c.testData.replace(/\n/g, '<br>')} |`);
      ln(`| Step-by-Step Instructions | ${c.steps.map((s, i) => `${i + 1}. ${s}`).join('<br>')} |`);
      ln(`| Expected Result | ${c.expected} |`);
      ln(`| Actual Result | |`);
      ln(`| Status | Pass / Fail / Blocked / N/A |`);
      ln(`| Screenshot Reference | |`);
      ln(`| Remarks | ${c.defaultRemarks ?? ''} |`);
      ln();
    }

    ln('## Chapter Completion Checklist');
    ln();
    for (const item of ch.checklist) ln(`- [ ] ${item}`);
    ln();
    ln('| Pass Count | Fail Count | Blocked/N/A | Observations |');
    ln('|------------|------------|-------------|--------------|');
    ln('| | | | |');
    ln();
  }

  ln('---');
  ln();
  ln('## UAT Summary Sheet');
  ln();
  ln('| Module / Chapter | Passed | Failed | Blocked | Not Tested | Overall Result |');
  ln('|------------------|--------|--------|---------|------------|----------------|');
  for (const ch of CHAPTERS) {
    ln(`| Ch.${ch.number} ${ch.title} | | | | | |`);
  }
  ln(`| **Grand Total** | | | | | |`);
  ln();

  ln('## Business Sign-Off Page');
  ln();
  ln('| Role | Name | Signature | Date |');
  ln('|------|------|-----------|------|');
  ln('| Prepared By | | | |');
  ln('| Tested By | | | |');
  ln('| Reviewed By | | | |');
  ln('| Approved By | | | |');
  ln();
  ln('**Acceptance Status:** ☐ Accepted  ☐ Accepted with Conditions  ☐ Rejected');
  ln();
  ln('**Conditions / Notes:**');
  ln();
  ln('---');

  return lines.join('\n');
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const md = buildMarkdown();
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`Wrote ${mdPath} (${(Buffer.byteLength(md) / 1024).toFixed(1)} KB)`);

  const doc = new Document({
    title: META.title,
    description: META.id,
    sections: [
      {
        properties: {
          page: {
            orientation: PageOrientation.PORTRAIT,
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: buildDocxChildren(),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  try {
    fs.writeFileSync(docxPath, buffer);
    console.log(`Wrote ${docxPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  } catch (e) {
    if (e?.code === 'EBUSY') {
      const alt = docxPath.replace(/\.docx$/, `_v${META.version}.docx`);
      fs.writeFileSync(alt, buffer);
      console.log(`Target locked; wrote ${alt}`);
    } else throw e;
  }

  console.log(`\nCoverage: ${coverage.totalCases} test cases across ${CHAPTERS.length} chapters`);
  console.log(`NOT IMPLEMENTED markers: ${coverage.notImplementedCases}`);
  console.log(`Modules: ${coverage.modulesCovered.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
