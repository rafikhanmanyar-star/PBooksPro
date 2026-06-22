/**
 * Generates doc/PAYROLL_MODULE_UAT.md
 * Run: node scripts/generate-payroll-uat-md.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { META, UI_SHELL, RECENT_CHANGES, TEST_SECTIONS, E2E_STEPS, API_SMOKE } from './payroll-uat-test-cases.mjs';

const outPath = path.join(path.resolve(fileURLToPath(import.meta.url), '..', '..'), 'doc', 'PAYROLL_MODULE_UAT.md');

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function caseTable(cases) {
  const h =
    '| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |\n|----|-----------|---------|----------|----------|--------|--------|------|-------|';
  const rows = cases.map(
    (c) =>
      `| ${c.id} | ${esc(c.name)} | ${esc(c.persona ?? 'Payroll Admin')} | ${esc(c.uiGuide)} | ${esc(c.expected)} | | | | |`
  );
  return [h, ...rows].join('\n');
}

const body = TEST_SECTIONS.map((s) => `## ${s.section}\n\n${caseTable(s.cases)}`).join('\n\n---\n\n');

const md = `# ${META.title}

**Document ID:** ${META.id}  
**UAT version:** ${META.version}  
**Product build:** ${META.productVersion}  
**Last updated:** ${META.date}  

> Regenerate Word: \`node scripts/generate-payroll-uat-docx.mjs\`

**Changelog:** ${META.changelog}

---

## What changed in v2.0

${RECENT_CHANGES.map((c) => `- ${c}`).join('\n')}

---

## UI navigation reference

\`\`\`text
${UI_SHELL}
\`\`\`

---

## Test environment

| Item | Value |
|------|-------|
| Stack | \`npm run test:staging\` |
| Database | PostgreSQL \`pBookspro_Staging\` (API-only) |
| SoD | Two users: Preparer + independent Approver |
| Login | test company / Rafi / Rafi1234 |

---

${body}

---

## End-to-end happy path (with SoD)

| Step | Action | UI guide | Verification | Result |
|------|--------|----------|--------------|--------|
${E2E_STEPS.map((r) => `| ${r.step} | ${esc(r.action)} | ${esc(r.uiGuide)} | ${esc(r.verification)} | |`).join('\n')}

---

## API smoke checks

| Endpoint | Method | Expect | Related UI | Result |
|----------|--------|--------|------------|--------|
${API_SMOKE.map((r) => `| ${r.endpoint} | ${r.method} | ${r.expect} | ${esc(r.uiGuide)} | |`).join('\n')}

---

## Acceptance criteria

- [ ] E2E path passes with two-user SoD approval
- [ ] Audit Log shows run approve, pay, void events
- [ ] Dashboard KPIs match Processing data
- [ ] Void vs Delete payslip rules verified
- [ ] Real-time sync on pay/approve

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA / UAT Lead | | | |
| HR / Payroll Owner | | | |
| Engineering | | | |
`;

fs.writeFileSync(outPath, md);
console.log(`Wrote ${outPath}`);
