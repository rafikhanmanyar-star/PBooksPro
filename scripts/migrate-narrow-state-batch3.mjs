#!/usr/bin/env node
/** Final C6 pass: remaining components + hooks off useFullAppState. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** hookName, optional stateVar rename (default state) */
const REPLACEMENTS = [
  ['components/settings/SettingsPage.tsx', 'useSettingsPageState'],
  ['components/settings/ImportExportWizard.tsx', 'useImportExportState'],
  ['components/settings/BudgetManagement.tsx', 'useBudgetDashboardState'],
  ['components/settings/ContactsManagement.tsx', 'useEntityCatalogState', 'appState'],
  ['components/settings/AssetsManagement.tsx', 'useEntityCatalogState', 'appState'],
  ['components/settings/WarehouseManagement.tsx', 'useWarehouses', 'warehouses', 'useWarehouses()'],
  ['components/settings/ExportDataModal.tsx', 'useProjects', 'projects', 'useProjects()'],
  ['components/settings/TransactionLogViewer.tsx', 'MULTI_LOG'],
  ['components/settings/ErrorLogViewer.tsx', 'MULTI_ERR'],
  ['components/settings/ManualJournalEntrySection.tsx', 'MULTI_JOURNAL'],
  ['components/settings/AccountForm.tsx', 'useAccounts', 'accounts', 'useAccounts()'],
  ['components/settings/CategoryForm.tsx', 'useCategories', 'categories', 'useCategories()'],
  ['components/settings/BuildingForm.tsx', 'useBuildings', 'buildings', 'useBuildings()'],
  ['components/settings/UnitForm.tsx', 'useUnits', 'units', 'useUnits()'],
  ['components/settings/PrintTemplateForm.tsx', 'usePrintSettings', 'printSettings', 'usePrintSettings()'],
  ['components/settings/MessagingTemplatesForm.tsx', 'useWhatsAppTemplates', 'whatsAppTemplates', 'useWhatsAppTemplates()'],
  ['components/settings/SettingsDetailPage.tsx', 'useSettingsPageState'],
  ['components/settings/SettingsLedgerModal.tsx', 'useFinancialReportAppState'],
  ['components/ui/ProjectForm.tsx', 'useProjects', 'projects', 'useProjects()'],
  ['components/kpi/KPIPanel.tsx', 'useKPIAppState'],
  ['components/kpi/KPIDrilldown.tsx', 'useKPIAppState'],
  ['components/payroll/PayrollHub.tsx', 'usePayrollHubState', 'appState', 'usePayrollHubState()'],
  ['components/payroll/EmployeeForm.tsx', 'MULTI_EMP_FORM'],
  ['components/payroll/EmployeeProfile.tsx', 'MULTI_EMP_PROFILE'],
  ['components/payroll/modals/PayslipModal.tsx', 'usePayrollPaymentState', 'state', 'usePayrollPaymentState()'],
  ['components/personalTransactions/PersonalTransactionsTab.tsx', 'usePersonalFinanceState', 'state', 'usePersonalFinanceState()'],
  ['components/personalTransactions/MyWalletsTab.tsx', 'usePersonalFinanceState', 'state', 'usePersonalFinanceState()'],
  ['components/personalTransactions/AddPersonalTransactionModal.tsx', 'usePersonalFinanceState', 'state', 'usePersonalFinanceState()'],
  ['components/personalTransactions/PersonalCategoriesSettingsPanel.tsx', 'usePersonalFinanceState', 'state', 'usePersonalFinanceState()'],
  ['components/personalTransactions/ImportPersonalTransactionsPasteModal.tsx', 'usePersonalFinanceState', 'state', 'usePersonalFinanceState()'],
  ['components/chat/ChatModal.tsx', 'MULTI_CHAT'],
  ['components/auth/LoginPage.tsx', 'useUsers', 'users', 'useUsers()'],
  ['components/mobile/MobilePaymentsPage.tsx', 'useFinancialReportAppState'],
  ['components/contacts/WhatsAppMessageModal.tsx', 'useRentalReportAppState'],
  ['components/whatsapp/WhatsAppChatWindow.tsx', 'useRentalReportAppState'],
  ['components/marketing/MarketingPage.tsx', 'useMarketingPageState'],
  ['components/print/PrintController.tsx', 'usePrintSettings', 'printSettings', 'usePrintSettings()'],
  ['hooks/usePrint.ts', 'usePrintSettings', 'printSettings', 'usePrintSettings()'],
  ['hooks/usePrintForm.ts', 'REMOVE_UNUSED'],
  ['hooks/useGenerateDueInvoices.ts', 'FIX_RECURRING'],
  ['hooks/useEntityFormModal.tsx', 'FIX_ENTITY_MODAL'],
];

function patchImport(content, hookNames) {
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*useSelectiveState)['"];/g;
  const m = importRe.exec(content);
  if (!m) return content;
  const rel = m[2];
  let names = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== 'useFullAppState');
  for (const h of hookNames) {
    if (!names.includes(h)) names.push(h);
  }
  const newImport = `import { ${names.join(', ')} } from '${rel}';`;
  return content.replace(importRe, newImport);
}

function removeFullAppStateImport(content) {
  return content.replace(/,?\s*useFullAppState/g, '').replace(/\{\s*,/g, '{').replace(/,\s*\}/g, ' }');
}

function resolveReplacement(kind, varName, custom) {
  if (custom) {
    const trimmed = custom.trim();
    if (trimmed.startsWith('const ')) return trimmed;
    return `const ${varName} = ${trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed};`;
  }
  return `const ${varName} = ${kind}();`;
}

for (const entry of REPLACEMENTS) {
  const [rel, kind, varName = 'state', customReplacement] = entry;
  const replacement = resolveReplacement(kind, varName, customReplacement);
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.warn('skip missing', rel);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('useFullAppState') && kind !== 'REMOVE_UNUSED' && kind !== 'FIX_RECURRING' && kind !== 'FIX_ENTITY_MODAL') continue;

  const original = content;

  if (kind === 'REMOVE_UNUSED') {
    content = removeFullAppStateImport(content);
    content = content.replace(/\s*const state = useFullAppState\(\);\n/, '\n');
  } else if (kind === 'FIX_RECURRING') {
    content = patchImport(content, [
      'useInvoices',
      'useCategories',
      'useRentalAgreements',
      'useStateSelector',
    ]);
    content = removeFullAppStateImport(content);
    content = content.replace(
      /const state = useFullAppState\(\);\s*\n\s*const dispatch = useDispatchOnly\(\);/,
      `const recurringInvoiceTemplates = useStateSelector((s) => s.recurringInvoiceTemplates);
  const invoices = useInvoices();
  const categories = useCategories();
  const rentalAgreements = useRentalAgreements();
  const rentalInvoiceSettings = useStateSelector((s) => s.rentalInvoiceSettings);
  const dispatch = useDispatchOnly();`
    );
    content = content.replace(
      /const \{ rentalInvoiceSettings \} = state;/,
      '// rentalInvoiceSettings from hook'
    );
    content = content.replace(
      /const rentalAgreements = rentalAgreements \|\| \[\];/,
      'const rentalAgreementsList = rentalAgreements || [];'
    );
    content = content.replace(
      /rentalAgreements\.find\(/g,
      'rentalAgreementsList.find('
    );
  } else if (kind === 'FIX_ENTITY_MODAL') {
    content = content.replace(
      /import \{ useBuildings, useContacts, useDispatchOnly, useProperties \} from '\.\.\/hooks\/useSelectiveState';\nimport React[^\n]*\nimport \{ useDispatchOnly, useFullAppState \} from '\.\.\/hooks\/useSelectiveState';/,
      `import React, { useState, useCallback } from 'react';
import { useBuildings, useContacts, useDispatchOnly, useProperties } from '../hooks/useSelectiveState';`
    );
    content = removeFullAppStateImport(content);
    content = content.replace(/\s*const state = useFullAppState\(\);\s*\n\s*const dispatch = useDispatchOnly\(\);/, '\n  const dispatch = useDispatchOnly();');
    content = content.replace(
      /const state = useFullAppState\(\);\s*\n\s*\n\s*const getFormTitle/,
      `const contacts = useContacts();
  const buildings = useBuildings();
  const properties = useProperties();

  const getFormTitle`
    );
  } else if (kind === 'MULTI_LOG') {
    content = patchImport(content, ['useTransactionLog', 'useCurrentUser']);
    content = removeFullAppStateImport(content);
    content = content.replace(
      /const state = useFullAppState\(\);\s*\n\s*const dispatch = useDispatchOnly\(\);\s*\n\s*const \{ showConfirm, showToast \} = useNotification\(\);\s*\n\s*const \{ currentUser, transactionLog \} = state;/,
      `const dispatch = useDispatchOnly();
    const { showConfirm, showToast } = useNotification();
    const currentUser = useCurrentUser();
    const transactionLog = useTransactionLog();`
    );
  } else if (kind === 'MULTI_ERR') {
    content = patchImport(content, ['useErrorLog']);
    content = removeFullAppStateImport(content);
    content = content.replace(/const state = useFullAppState\(\);\s*\n\s*const dispatch = useDispatchOnly\(\);\s*\n\s*const \{ errorLog \} = state;/, `const dispatch = useDispatchOnly();
    const errorLog = useErrorLog();`);
  } else if (kind === 'MULTI_JOURNAL') {
    content = patchImport(content, ['useAccounts', 'useCurrentUser']);
    content = removeFullAppStateImport(content);
    content = content.replace(/const state = useFullAppState\(\);\s*\n\s*const \{ accounts \} = state;/, `const accounts = useAccounts();
  const currentUser = useCurrentUser();`);
  } else if (kind === 'MULTI_CHAT') {
    content = patchImport(content, ['useUsers', 'useCurrentUser']);
    content = removeFullAppStateImport(content);
    content = content.replace(
      /const state = useFullAppState\(\);\s*\n\s*const \{ users \} = state;\s*\n\s*const currentUser = user \|\| state\.currentUser;/,
      `const users = useUsers();
    const stateCurrentUser = useCurrentUser();
    const currentUser = user || stateCurrentUser;`
    );
  } else if (kind === 'MULTI_EMP_FORM') {
    content = patchImport(content, ['useProjects', 'useBuildings']);
    content = removeFullAppStateImport(content);
    content = content.replace(/const appState = useFullAppState\(\);/, '');
    content = content.replace(/appState\.projects/g, 'projects');
    content = content.replace(/appState\.buildings/g, 'buildings');
    content = content.replace(
      /(const \{ user, tenant \} = useAuth\(\);)/,
      `$1
  const projects = useProjects();
  const buildings = useBuildings();`
    );
  } else if (kind === 'MULTI_EMP_PROFILE') {
    content = patchImport(content, ['useProjects', 'useBuildings', 'useWhatsAppMode']);
    content = removeFullAppStateImport(content);
    content = content.replace(/const appState = useFullAppState\(\);/, '');
    content = content.replace(/appState\.projects/g, 'projects');
    content = content.replace(/appState\.buildings/g, 'buildings');
    content = content.replace(/appState\.whatsAppMode/g, 'whatsAppMode');
    content = content.replace(
      /(const \{ tenant \} = useAuth\(\)|const \{ user, tenant \} = useAuth\(\))/,
      (match) => `${match}
  const projects = useProjects();
  const buildings = useBuildings();
  const whatsAppMode = useWhatsAppMode();`
    );
  } else if (kind === 'useWarehouses') {
    content = patchImport(content, ['useWarehouses']);
    content = removeFullAppStateImport(content);
    content = content.replace(/const appState = useFullAppState\(\);/, 'const warehouses = useWarehouses();');
    content = content.replace(/appState\.warehouses/g, 'warehouses');
  } else if (replacement.includes('useProjects()') || replacement.includes('useAccounts()') || replacement.includes('usePrintSettings()')) {
    content = patchImport(content, [kind]);
    content = removeFullAppStateImport(content);
    content = content.replace(new RegExp(`const (state|appState) = useFullAppState\\(\\);\\s*\\n\\s*const \\{ ${varName} \\} = (state|appState);`), replacement + ';');
    content = content.replace(/const state = useFullAppState\(\);\s*\n\s*const printSettings = state\.printSettings;/, 'const printSettings = usePrintSettings();');
    content = content.replace(/const state = useFullAppState\(\);\s*\n\s*const \{ printSettings \} = state;/, 'const printSettings = usePrintSettings();');
  } else {
    content = patchImport(content, [kind]);
    content = removeFullAppStateImport(content);
    content = content.replace(new RegExp(`const ${varName} = useFullAppState\\(\\);`), replacement.replace('state', varName));
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('patched', rel);
  }
}

// PropertyForm: drop unused useFullAppState
const pf = path.join(ROOT, 'components/settings/PropertyForm.tsx');
if (fs.existsSync(pf)) {
  let c = fs.readFileSync(pf, 'utf8');
  const n = c.replace(/import \{ useDispatchOnly, useFullAppState \}/, 'import { useDispatchOnly }').replace(/\s*const state = useFullAppState\(\);\n/, '\n');
  if (n !== c) {
    fs.writeFileSync(pf, n, 'utf8');
    console.log('patched', 'components/settings/PropertyForm.tsx');
  }
}

console.log('batch3 done');
