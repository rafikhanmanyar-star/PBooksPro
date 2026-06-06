import fs from 'fs';

const src = fs.readFileSync('context/AppContext.tsx', 'utf8');
const lines = src.split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const storeBody = slice(42, 79);
const repoBody = slice(81, 101);
const initialBody = slice(103, 304);
const effectsBody = slice(310, 494);
let reducerBody = slice(496, 1462).replace(/^const reducer = /, 'export function appReducer(');
const mergeBody = slice(1469, 1556);

const store = `import type React from 'react';
import type { AppState, AppAction } from '../types';

${storeBody
  .replace('function _notifyStateListeners()', 'export function _notifyStateListeners()')
  .replace('function enqueueTransactionApiSave(', 'export function enqueueTransactionApiSave(')}

export function _setAppState(state: AppState): void { _appState = state; }
export function _setAppDispatch(dispatch: React.Dispatch<AppAction>): void { _appDispatch = dispatch; }
export function _setInitialDataLoading(loading: boolean): void { _initialDataLoading = loading; }
`;

fs.mkdirSync('context/reducers', { recursive: true });
fs.mkdirSync('context/domains', { recursive: true });

fs.writeFileSync('context/appStateStore.ts', store);

const initial = `import type { AppState, Account, Category, User } from '../types';
import { MANDATORY_SYSTEM_ACCOUNTS } from '../services/database/mandatorySystemAccounts';
import { MANDATORY_SYSTEM_CATEGORIES } from '../services/database/mandatorySystemCategories';

${initialBody
  .replace(/^const initialState/, 'export const initialState')
  .replace(/^const DEFAULT_INVOICE_TEMPLATE/, 'export const DEFAULT_INVOICE_TEMPLATE')}
`;

fs.writeFileSync('context/appInitialState.ts', initial);

const repo = `${repoBody.replace(/^async function getAppStateRepository/, 'export async function getAppStateRepository')}\n`;
fs.writeFileSync('context/appRepositoryLoader.ts', repo);

const effects = `import type {
  AppState,
  Transaction,
  Invoice,
  Bill,
  ContractStatus,
  User,
  TransactionLogEntry,
} from '../../types';
import { findSalesReturnCategory } from '../../constants/salesReturnSystemCategories';
import { resolveSystemCategoryId } from '../../services/systemEntityIds';
import { resolveExpenseCategoryForBillPayment } from '../../utils/rentalBillPayments';
import {
  adjustOrRemoveRentAggregateExpenseAfterIncomeRemoved,
  findSecuritySettlementCascadeDeletePartners,
  syncBillPaymentIncomeFromPairedExpense,
  syncPairedBillExpenseFromSecurityIncome,
  syncPairedExpenseToRentFromSecurityIncome,
  syncRentFromSecurityIncomeToPairedExpense,
} from '../../utils/rentalSecurityDepositSettlement';
import { resolveOwnerForPropertyOnDate } from '../../services/propertyOwnershipService';
import { toLocalDateString } from '../../utils/dateUtils';

${effectsBody
  .replace(/^const updateContractStatus/, 'export const updateContractStatus')
  .replace(/^const applyTransactionEffect/, 'export const applyTransactionEffect')
  .replace(/^const createLogEntry/, 'export const createLogEntry')
  .replace(/^function stampTransactionOwnerId/, 'export function stampTransactionOwnerId')
  .replace(/^function enrichExpenseBillPaymentCategory/, 'export function enrichExpenseBillPaymentCategory')}
`;

fs.writeFileSync('context/reducers/appReducerEffects.ts', effects);

const reducerImports = `import type { AppState, AppAction } from '../../types';
import {
  applyTransactionEffect,
  createLogEntry,
  enrichExpenseBillPaymentCategory,
  stampTransactionOwnerId,
  updateContractStatus,
} from './appReducerEffects';
import { reconcileRentalAgreementsList } from '../../services/rentalAgreementReconcile';
import { findSalesReturnCategory } from '../../constants/salesReturnSystemCategories';
import { resolveSystemCategoryId } from '../../services/systemEntityIds';
import {
  adjustOrRemoveRentAggregateExpenseAfterIncomeRemoved,
  findSecuritySettlementCascadeDeletePartners,
  syncBillPaymentIncomeFromPairedExpense,
  syncPairedBillExpenseFromSecurityIncome,
  syncPairedExpenseToRentFromSecurityIncome,
  syncRentFromSecurityIncomeToPairedExpense,
} from '../../utils/rentalSecurityDepositSettlement';

`;

fs.writeFileSync('context/reducers/appReducer.ts', reducerImports + reducerBody + '\n');

const mergeImports = `import type { AppState, AppAction, Invoice, Bill, ProjectReceivedAsset, SalesReturn } from '../../types';

`;
const mergeExports = mergeBody
  .replace(/^function mergeTenantSettingsFromAction/, 'export function mergeTenantSettingsFromAction')
  .replace(/^function mergeInvoicesWithServerBaseline/, 'export function mergeInvoicesWithServerBaseline')
  .replace(/^function mergeBillsWithServerBaseline/, 'export function mergeBillsWithServerBaseline')
  .replace(
    /^function mergeProjectReceivedAssetsWithServerBaseline/,
    'export function mergeProjectReceivedAssetsWithServerBaseline'
  )
  .replace(/^function mergeSalesReturnsWithServerBaseline/, 'export function mergeSalesReturnsWithServerBaseline');

fs.writeFileSync('context/reducers/appStateMerge.ts', mergeImports + mergeExports + '\n');

console.log('Extracted modules OK');
