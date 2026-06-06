import fs from 'fs';

const srcPath = 'context/AppContext.tsx';
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split(/\r?\n/);

// Remove lines 39-1556 (1-based): store through merge functions, keep AppContext createContext at 306-308
// After removal, insert new imports after existing imports (before AppContext creation)

const newImports = `
import { initialState } from './appInitialState';
import { getAppStateRepository } from './appRepositoryLoader';
import {
  _getAppState,
  _getAppDispatch,
  _getInitialDataLoading,
  _subscribeAppState,
  _notifyStateListeners,
  _setAppState,
  _setAppDispatch,
  _setInitialDataLoading,
  enqueueTransactionApiSave,
  RENTAL_ROLLUP_SYNC_INVALIDATE_MIN_MS,
  rentalRollupLastInvalidateAfterSyncAt,
} from './appStateStore';
import { appReducer } from './reducers/appReducer';
import {
  mergeTenantSettingsFromAction,
  mergeInvoicesWithServerBaseline,
  mergeBillsWithServerBaseline,
  mergeProjectReceivedAssetsWithServerBaseline,
  mergeSalesReturnsWithServerBaseline,
} from './reducers/appStateMerge';

// Re-export store accessors for backward compatibility (useSelectiveState, personalFinanceSync, etc.)
export {
  _getAppState,
  _getAppDispatch,
  _getInitialDataLoading,
  _subscribeAppState,
} from './appStateStore';
`;

// Keep lines 1-37 (imports through syncQueueStub), skip 39-1556, keep 1557+
const head = lines.slice(0, 37);
const tail = lines.slice(1556); // line 1557 onwards (export const AppProvider)

// Trim unused imports from head - remove MANDATORY_SYSTEM, rental utils used only in reducer, etc.
// Safer to leave imports and let typecheck catch unused - or run eslint later

const out = [...head, newImports, ...tail].join('\n');
fs.writeFileSync(srcPath, out);
console.log('Patched AppContext.tsx:', out.split('\n').length, 'lines');
