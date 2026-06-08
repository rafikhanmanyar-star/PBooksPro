#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const FIX_LINE = {
  'components/settings/SettingsPage.tsx': '    const state = useSettingsPageState();',
  'components/settings/ImportExportWizard.tsx': '  const state = useImportExportState();',
  'components/settings/BudgetManagement.tsx': 'BUDGET_SPECIAL',
  'components/settings/ContactsManagement.tsx': '    const appState = useEntityCatalogState();',
  'components/settings/AssetsManagement.tsx': '    const appState = useEntityCatalogState();',
  'components/settings/WarehouseManagement.tsx': '    const warehouses = useWarehouses();',
  'components/settings/ExportDataModal.tsx': '    const projects = useProjects();',
  'components/settings/TransactionLogViewer.tsx': 'TRANSACTION_LOG_SPECIAL',
  'components/settings/ErrorLogViewer.tsx': 'ERROR_LOG_SPECIAL',
  'components/settings/ManualJournalEntrySection.tsx': 'MANUAL_JOURNAL_SPECIAL',
  'components/settings/AccountForm.tsx': '    const accounts = useAccounts();',
  'components/settings/CategoryForm.tsx': '    const categories = useCategories();',
  'components/settings/BuildingForm.tsx': '    const buildings = useBuildings();',
  'components/settings/UnitForm.tsx': '    const units = useUnits();',
  'components/settings/PrintTemplateForm.tsx': '    const printSettings = usePrintSettings();',
  'components/settings/MessagingTemplatesForm.tsx': '    const whatsAppTemplates = useWhatsAppTemplates();',
  'components/settings/SettingsDetailPage.tsx': '    const state = useSettingsPageState();',
  'components/settings/SettingsLedgerModal.tsx': '    const state = useFinancialReportAppState();',
  'components/ui/ProjectForm.tsx': '    const projects = useProjects();',
  'components/kpi/KPIPanel.tsx': '    const state = useKPIAppState();',
  'components/kpi/KPIDrilldown.tsx': '    const state = useKPIAppState();',
  'components/payroll/PayrollHub.tsx': 'PAYROLL_HUB_SPECIAL',
  'components/payroll/EmployeeForm.tsx': 'EMPLOYEE_FORM_SPECIAL',
  'components/payroll/EmployeeProfile.tsx': 'EMPLOYEE_PROFILE_SPECIAL',
  'components/payroll/modals/PayslipModal.tsx': 'PAYSLIP_MODAL_SPECIAL',
  'components/personalTransactions/PersonalTransactionsTab.tsx': 'PERSONAL_SPECIAL',
  'components/personalTransactions/MyWalletsTab.tsx': 'PERSONAL_SPECIAL',
  'components/personalTransactions/AddPersonalTransactionModal.tsx': 'PERSONAL_SPECIAL',
  'components/personalTransactions/PersonalCategoriesSettingsPanel.tsx': 'PERSONAL_SPECIAL',
  'components/personalTransactions/ImportPersonalTransactionsPasteModal.tsx': 'PERSONAL_SPECIAL',
  'components/chat/ChatModal.tsx': 'CHAT_SPECIAL',
  'components/auth/LoginPage.tsx': '    const users = useUsers();',
  'components/mobile/MobilePaymentsPage.tsx': '    const state = useFinancialReportAppState();',
  'components/contacts/WhatsAppMessageModal.tsx': '    const state = useRentalReportAppState();',
  'components/whatsapp/WhatsAppChatWindow.tsx': '    const state = useRentalReportAppState();',
  'components/marketing/MarketingPage.tsx': '    const state = useMarketingPageState();',
  'components/print/PrintController.tsx': '  const printSettings = usePrintSettings();',
  'hooks/usePrint.ts': 'USE_PRINT_SPECIAL',
  'hooks/usePrintForm.ts': 'REMOVE_STATE',
  'hooks/useGenerateDueInvoices.ts': 'RECURRING_SPECIAL',
  'hooks/useEntityFormModal.tsx': 'ENTITY_MODAL_SPECIAL',
};

function fixFile(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return;
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  const fix = FIX_LINE[rel];
  if (!fix) return;

  if (fix === 'REMOVE_STATE') {
    c = c.replace(/\s*const state =\(\);\n/, '\n');
  } else if (fix === 'BUDGET_SPECIAL') {
    c = c.replace(
      /import \{ useBills, useBudgets, useCategories, useDispatchOnly, useInvoices, useProjects, useStateSelector, useTransactions, useBudgetDashboardState \} from '\.\.\/\.\.\/hooks\/useSelectiveState';\nimport React[^\n]*\nimport \{ useBills, useBudgets, useCategories, useDispatchOnly, useInvoices, useProjects, useStateSelector, useTransactions, useBudgetDashboardState \} from '\.\.\/\.\.\/hooks\/useSelectiveState';/,
      `import { useDispatchOnly, useBudgetDashboardState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useEffect } from 'react';`
    );
    c = c.replace(
      /const state =\(\);\s*\n\s*const \{ categories, projects, transactions, invoices, bills, budgets \} = state;\s*\n\s*const \[selectedProjectId, setSelectedProjectId\] = useState<string>\(state\.defaultProjectId \|\| ''\);/,
      `const { categories, projects, transactions, invoices, bills, budgets, defaultProjectId } = useBudgetDashboardState();
    const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId || '');`
    );
  } else if (fix === 'TRANSACTION_LOG_SPECIAL') {
    c = c.replace(/const state =\(\);\s*\n\s*const dispatch = useDispatchOnly\(\);\s*\n\s*const \{ showConfirm, showToast \} = useNotification\(\);\s*\n\s*const \{ currentUser, transactionLog \} = state;/,
      `const dispatch = useDispatchOnly();
    const { showConfirm, showToast } = useNotification();
    const currentUser = useCurrentUser();
    const transactionLog = useTransactionLog();`);
  } else if (fix === 'ERROR_LOG_SPECIAL') {
    c = c.replace(/const state =\(\);\s*\n\s*const dispatch = useDispatchOnly\(\);\s*\n\s*const \{ errorLog \} = state;/,
      `const dispatch = useDispatchOnly();
    const errorLog = useErrorLog();`);
  } else if (fix === 'MANUAL_JOURNAL_SPECIAL') {
    c = c.replace(/const state =\(\);\s*\n\s*const \{ accounts \} = state;/,
      `const accounts = useAccounts();
  const currentUser = useCurrentUser();`);
  } else if (fix === 'PAYROLL_HUB_SPECIAL') {
    c = c.replace(/const appState =\(\);/, 'const { accounts, transactions, whatsAppMode } = usePayrollHubState();');
    c = c.replace(/appState\.transactions/g, 'transactions');
    c = c.replace(/appState\.accounts/g, 'accounts');
    c = c.replace(/appState\.whatsAppMode/g, 'whatsAppMode');
  } else if (fix === 'EMPLOYEE_FORM_SPECIAL') {
    c = c.replace(/const appState =\(\);/, '');
    if (!c.includes('const projects = useProjects()')) {
      c = c.replace(/(const \{ user, tenant \} = useAuth\(\);)/, `$1
  const projects = useProjects();
  const buildings = useBuildings();`);
    }
  } else if (fix === 'EMPLOYEE_PROFILE_SPECIAL') {
    c = c.replace(/const appState =\(\);/, '');
    if (!c.includes('const projects = useProjects()')) {
      c = c.replace(/(const \{ user, tenant \} = useAuth\(\);)/, `$1
  const projects = useProjects();
  const buildings = useBuildings();
  const whatsAppMode = useWhatsAppMode();`);
    }
    c = c.replace(/appState\.projects/g, 'projects');
    c = c.replace(/appState\.buildings/g, 'buildings');
    c = c.replace(/appState\.whatsAppMode/g, 'whatsAppMode');
  } else if (fix === 'PAYSLIP_MODAL_SPECIAL') {
    c = c.replace(/const state =\(\);\s*\n\s*const \{ accounts, categories, projects: appProjects, transactions \} = state;/,
      `const { accounts, categories, projects: appProjects, transactions } = usePayrollPaymentState();`);
  } else if (fix === 'PERSONAL_SPECIAL') {
    c = c.replace(/const state =\(\);[\s\S]*?const \{([^}]+)\} = state;/, (m, inner) => {
      return `const {${inner}} = usePersonalFinanceState();`;
    });
  } else if (fix === 'CHAT_SPECIAL') {
    c = c.replace(/const state =\(\);\s*\n\s*const \{ users \} = state;\s*\n\s*const currentUser = user \|\| state\.currentUser;/,
      `const users = useUsers();
    const stateCurrentUser = useCurrentUser();
    const currentUser = user || stateCurrentUser;`);
  } else if (fix === 'USE_PRINT_SPECIAL') {
    c = c.replace(/const state =\(\);\s*\n\s*const printSettings = state\.printSettings \|\| options\.printSettings;/,
      'const printSettingsFromState = usePrintSettings();\n  const printSettings = options.printSettings ?? printSettingsFromState;');
    c = c.replace(/const state =\(\);[\s\S]*?printSettings: providedPrintSettings/, 'printSettings: providedPrintSettings');
    if (c.includes('const state =();')) {
      c = c.replace(/const state =\(\);\s*\n/, 'const printSettingsFromState = usePrintSettings();\n');
      c = c.replace(/providedPrintSettings \|\| state\.printSettings/, 'providedPrintSettings ?? printSettingsFromState');
    }
  } else if (fix === 'RECURRING_SPECIAL') {
    c = c.replace(/const state =\(\);\s*\n\s*const dispatch = useDispatchOnly\(\);/,
      `const recurringInvoiceTemplates = useStateSelector((s) => s.recurringInvoiceTemplates);
  const invoices = useInvoices();
  const categories = useCategories();
  const rentalAgreements = useRentalAgreements();
  const rentalInvoiceSettings = useStateSelector((s) => s.rentalInvoiceSettings);
  const dispatch = useDispatchOnly();`);
    c = c.replace(/const \{ rentalInvoiceSettings \} = state;\s*\n\s*\/\/ rentalInvoiceSettings from hook\n?/, '');
    if (c.includes('const rentalAgreements = rentalAgreements')) {
      c = c.replace('const rentalAgreements = rentalAgreements || [];', 'const rentalAgreementsList = rentalAgreements || [];');
      c = c.replace(/rentalAgreements\.find\(/g, 'rentalAgreementsList.find(');
    }
  } else if (fix === 'ENTITY_MODAL_SPECIAL') {
    c = c.replace(/import \{ useBuildings, useContacts, useDispatchOnly, useProperties \} from '\.\.\/hooks\/useSelectiveState';\nimport React[^\n]*\nimport \{ useDispatchOnly \} from '\.\.\/hooks\/useSelectiveState';/,
      `import { useBuildings, useContacts, useDispatchOnly, useProperties } from '../hooks/useSelectiveState';
import React, { useState, useCallback } from 'react';`);
    c = c.replace(/\s*const state =\(\);\s*\n\s*const dispatch = useDispatchOnly\(\);/, '\n  const dispatch = useDispatchOnly();');
    if (c.includes('const state =();')) {
      c = c.replace(/const state =\(\);\s*\n\s*\n\s*const getFormTitle/, `const contacts = useContacts();
  const buildings = useBuildings();
  const properties = useProperties();

  const getFormTitle`);
    }
  } else {
    c = c.replace(/const (state|appState) =\(\);/, fix.trim().startsWith('const') ? fix : `    ${fix}`);
  }

  // ExportDataModal: remove state.projects destructure if only projects needed
  if (rel === 'components/settings/ExportDataModal.tsx') {
    c = c.replace(/const projects = useProjects\(\);\s*\n\s*const \{ projects \} = state;/, '    const projects = useProjects();');
    c = c.replace(/const state =\(\);\s*\n\s*const \{ projects \} = state;/, '    const projects = useProjects();');
  }

  if (rel === 'components/settings/PropertyForm.tsx') {
    c = c.replace(/\s*const state = useFullAppState\(\);\n/, '\n');
    c = c.replace(/\s*const state =\(\);\n/, '\n');
  }

  if (c !== orig) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('fixed', rel);
  }
}

for (const rel of Object.keys(FIX_LINE)) fixFile(rel);
fixFile('components/settings/PropertyForm.tsx');
console.log('repair done');
