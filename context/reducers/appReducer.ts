import {
  AppState,
  AppAction,
  Transaction,
  InvoiceStatus,
  ContractStatus,
  SalesReturnStatus,
  SalesReturnReason,
  ProjectAgreementStatus,
  UserRole,
  AccountType,
  TransactionType,
  Unit,
  Bill,
} from '../../types';
import { initialState } from '../appInitialState';
import { toLocalDateString } from '../../utils/dateUtils';
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

export function appReducer(state: AppState, action: AppAction): AppState {
    // Real-time sync is now handled via Socket.IO in the backend with tenant isolation
    // but some actions like DELETE need to run logic. However, for SYNC_REQUEST (SET_STATE), we just replace state.
    // For single actions broadcasted, we apply them normally.

    switch (action.type) {
        case 'SET_STATE': {
            const payload = action.payload as Partial<AppState>;
            let changed = false;
            const next = { ...state };
            for (const key of Object.keys(payload)) {
                const k = key as keyof AppState;
                if (payload[k] !== state[k]) {
                    (next as any)[k] = payload[k];
                    changed = true;
                }
            }
            if (!changed) return state;
            // Backfill ownerId on transactions loaded without one (historical data fix).
            // Uses agreement-aware resolution so pre-transfer rental income stays
            // attributed to the old owner.
            if (payload.transactions && next.properties?.length > 0) {
                let anyStamped = false;
                const stamped = next.transactions.map(tx => {
                    if (tx.ownerId || !tx.propertyId) return tx;
                    const patched = stampTransactionOwnerId(tx, next);
                    if (patched !== tx) anyStamped = true;
                    return patched;
                });
                if (anyStamped) next.transactions = stamped;
            }
            return next;
        }
        case 'BATCH_UPSERT_ENTITIES': {
            const entities = action.payload;
            let anyChanged = false;
            const patches: Record<string, any[]> = {};

            const snakeToCamelKey: Record<string, string> = {
                rental_agreements: 'rentalAgreements',
                personal_categories: 'personalCategories',
                personal_transactions: 'personalTransactions',
                project_agreements: 'projectAgreements',
                plan_amenities: 'planAmenities',
                installment_plans: 'installmentPlans',
                recurring_invoice_templates: 'recurringInvoiceTemplates',
                pm_cycle_allocations: 'pmCycleAllocations',
                sales_returns: 'salesReturns',
                project_received_assets: 'projectReceivedAssets',
            };

            for (const [rawKey, items] of Object.entries(entities)) {
                if (!Array.isArray(items) || items.length === 0) continue;

                const entityKey = snakeToCamelKey[rawKey] || rawKey;
                const currentArray = (state as any)[entityKey];
                if (!Array.isArray(currentArray)) continue;

                const itemMap = new Map(currentArray.map((item: any) => [item.id, item]));
                let sliceChanged = false;

                items.forEach((item: any) => {
                    const isSoftDeleted = item.deletedAt || item.deleted_at;
                    if (isSoftDeleted) {
                        if (itemMap.has(item.id)) {
                            itemMap.delete(item.id);
                            sliceChanged = true;
                        }
                        return;
                    }
                    const existing = itemMap.get(item.id);
                    const merged = existing ? { ...existing, ...item } : item;
                    if (merged !== existing) {
                        itemMap.set(item.id, merged);
                        sliceChanged = true;
                    }
                });

                if (sliceChanged) {
                    patches[entityKey] = Array.from(itemMap.values());
                    anyChanged = true;
                }
            }

            if (anyChanged && patches.rentalAgreements?.length) {
                patches.rentalAgreements = reconcileRentalAgreementsList(patches.rentalAgreements);
            }

            return anyChanged ? { ...state, ...patches } : state;
        }
        case 'BATCH_WS_SYNC': {
            const { upserts, deletes } = action.payload as {
                upserts: Record<string, any[]>;
                deletes: Record<string, string[]>;
            };
            let newState = state;
            let anyChanged = false;

            if (upserts) {
                const patches: Record<string, any[]> = {};
                for (const [entityKey, items] of Object.entries(upserts)) {
                    if (!Array.isArray(items) || items.length === 0) continue;
                    const currentArray = (newState as any)[entityKey];
                    if (!Array.isArray(currentArray)) continue;
                    const itemMap = new Map(currentArray.map((item: any) => [item.id, item]));
                    let sliceChanged = false;
                    items.forEach((item: any) => {
                        const existing = itemMap.get(item.id);
                        const merged = existing ? { ...existing, ...item } : item;
                        if (merged !== existing) {
                            itemMap.set(item.id, merged);
                            sliceChanged = true;
                        }
                    });
                    if (sliceChanged) {
                        patches[entityKey] = Array.from(itemMap.values());
                        anyChanged = true;
                    }
                }
                if (anyChanged) newState = { ...newState, ...patches };
            }

            if (anyChanged && newState.rentalAgreements?.length) {
                newState = {
                    ...newState,
                    rentalAgreements: reconcileRentalAgreementsList(newState.rentalAgreements),
                };
            }

            if (deletes) {
                const deletePatches: Record<string, any[]> = {};
                for (const [entityKey, ids] of Object.entries(deletes)) {
                    if (!Array.isArray(ids) || ids.length === 0) continue;
                    const currentArray = (newState as any)[entityKey];
                    if (!Array.isArray(currentArray)) continue;
                    const idSet = new Set(ids);
                    const filtered = currentArray.filter((item: any) => !idSet.has(item.id));
                    if (filtered.length !== currentArray.length) {
                        deletePatches[entityKey] = filtered;
                        anyChanged = true;
                    }
                }
                if (Object.keys(deletePatches).length > 0) {
                    newState = { ...newState, ...deletePatches };
                }
            }

            return anyChanged ? newState : state;
        }
        case 'SET_PAGE':
            return { ...state, currentPage: action.payload };
        case 'LOGIN':
            return { ...state, currentUser: action.payload, currentPage: 'dashboard' };
        case 'LOGOUT':
            return { ...state, currentUser: null, currentPage: 'dashboard' };
        case 'SET_INITIAL_TABS':
            return { ...state, initialTabs: action.payload };
        case 'CLEAR_INITIAL_TABS':
            return { ...state, initialTabs: [] };
        case 'SET_INITIAL_TRANSACTION_TYPE':
            return { ...state, initialTransactionType: action.payload };
        case 'CLEAR_INITIAL_TRANSACTION_TYPE':
            return { ...state, initialTransactionType: null };
        case 'SET_INITIAL_TRANSACTION_FILTER':
            return { ...state, initialTransactionFilter: action.payload };
        case 'SET_INITIAL_IMPORT_TYPE':
            return { ...state, initialImportType: action.payload };
        case 'CLEAR_INITIAL_IMPORT_TYPE':
            return { ...state, initialImportType: null };
        case 'SET_EDITING_ENTITY':
            return { ...state, editingEntity: action.payload };
        case 'CLEAR_EDITING_ENTITY':
            return { ...state, editingEntity: null };
        case 'SET_UPDATE_AVAILABLE':
            return state;
        case 'UPDATE_INVOICE_TEMPLATE':
            return { ...state, invoiceHtmlTemplate: action.payload };

        // --- TRANSACTION HANDLERS ---
        case 'ADD_TRANSACTION': {
            const tx = enrichExpenseBillPaymentCategory(stampTransactionOwnerId(action.payload as Transaction, state), state);

            // Deduplicate: check if transaction with same ID exists
            const existingTxIndex = state.transactions.findIndex(t => t.id === tx.id);
            if (existingTxIndex >= 0) {
                // If it's a remote update or we already have it, just update it if needed or ignore
                // For transactions, we usually want to update it to ensure we have latest status/amounts
                const updatedTransactions = [...state.transactions];
                updatedTransactions[existingTxIndex] = { ...updatedTransactions[existingTxIndex], ...tx };

                let newStateWithTx = { ...state, transactions: updatedTransactions };
                // Re-apply effects (careful: this might duplicate effects if not idempotent)
                // However, applyTransactionEffect is usually additive/subtractive based on amounts
                // For deduplication, we should only apply if it was NOT already there, 
                // BUT if the amount changed, we might need to adjust.
                // For now, let's keep it simple: if it exists, replace data but don't re-apply effects 
                // unless we find a reason to. Most ADD_TRANSACTION calls are for NEW things. 
                // Remote ones (from WebSocket/Sync) should use UPDATE_TRANSACTION if they change things.
                return newStateWithTx;
            }

            let newStateWithTx = { ...state, transactions: [...state.transactions, tx] };
            newStateWithTx = applyTransactionEffect(newStateWithTx, tx, true);
            if (tx.contractId) newStateWithTx = updateContractStatus(newStateWithTx, tx.contractId);
            const logEntry = createLogEntry('CREATE', 'Transaction', tx.id, `Created ${tx.type}: ${tx.description} (${tx.amount})`, state.currentUser, tx);
            newStateWithTx.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return newStateWithTx;
        }

        case 'UPDATE_TRANSACTION': {
            const updatedTx = enrichExpenseBillPaymentCategory(stampTransactionOwnerId(action.payload as Transaction, state), state);
            const originalTx = state.transactions.find(t => t.id === updatedTx.id);
            if (!originalTx) return state;
            let tempState = applyTransactionEffect(state, originalTx, false);
            tempState = applyTransactionEffect(tempState, updatedTx, true);
            tempState.transactions = tempState.transactions.map(t => t.id === updatedTx.id ? updatedTx : t);
            if (originalTx.contractId) tempState = updateContractStatus(tempState, originalTx.contractId);
            if (updatedTx.contractId && updatedTx.contractId !== originalTx.contractId) tempState = updateContractStatus(tempState, updatedTx.contractId);
            else if (updatedTx.contractId) tempState = updateContractStatus(tempState, updatedTx.contractId);

            let synced = tempState;
            const cats = synced.categories;
            synced = syncPairedExpenseToRentFromSecurityIncome(synced, originalTx, updatedTx, cats) ?? synced;
            synced = syncRentFromSecurityIncomeToPairedExpense(synced, updatedTx, cats) ?? synced;
            synced = syncPairedBillExpenseFromSecurityIncome(synced, updatedTx, cats) ?? synced;
            synced = syncBillPaymentIncomeFromPairedExpense(synced, updatedTx, cats) ?? synced;

            const logEntry = createLogEntry('UPDATE', 'Transaction', updatedTx.id, `Updated ${updatedTx.type}: ${updatedTx.description}`, state.currentUser, { original: originalTx, new: updatedTx });
            synced.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return synced;
        }

        case 'DELETE_TRANSACTION': {
            const seedId = typeof action.payload === 'string' ? action.payload : '';
            const queue = seedId ? [seedId] : [];
            const done = new Set<string>();
            let nextState = state;
            let deletedSomething = false;

            while (queue.length > 0 && done.size < 200) {
                const txId = queue.pop()!;
                if (done.has(txId)) continue;

                const tx = nextState.transactions.find(t => t.id === txId);
                if (!tx) continue;

                const partners = findSecuritySettlementCascadeDeletePartners(
                    { transactions: nextState.transactions, categories: nextState.categories, bills: nextState.bills },
                    tx
                );
                for (const p of partners) {
                    if (!done.has(p)) queue.push(p);
                }

                const newStateWithoutTx = { ...nextState, transactions: nextState.transactions.filter(t => t.id !== txId) };
                let finalState = applyTransactionEffect(newStateWithoutTx, tx, false);
                if (tx.contractId) Object.assign(finalState, updateContractStatus(finalState, tx.contractId));

                const patched = adjustOrRemoveRentAggregateExpenseAfterIncomeRemoved(finalState, tx, nextState.categories);
                finalState = patched ?? finalState;

                const aid = tx.projectAssetId;
                if (aid && !finalState.transactions.some(t => t.projectAssetId === aid)) {
                    finalState = {
                        ...finalState,
                        projectReceivedAssets: (finalState.projectReceivedAssets || []).filter(a => a.id !== aid),
                    };
                }

                nextState = finalState;
                const logEntry = createLogEntry(
                    'DELETE',
                    'Transaction',
                    tx.id,
                    `Deleted ${tx.type}: ${tx.description}`,
                    state.currentUser,
                    tx
                );
                nextState.transactionLog = [logEntry, ...(nextState.transactionLog || [])];
                done.add(txId);
                deletedSomething = true;
            }

            if (!deletedSomething) return state;
            return nextState;
        }

        case 'BATCH_DELETE_TRANSACTIONS': {
            const { transactionIds, projectAssetIdToDelete } = action.payload;
            const uniqueIds = [...new Set(transactionIds)].filter(Boolean);
            if (uniqueIds.length === 0 && !projectAssetIdToDelete) return state;

            const queue = [...uniqueIds];
            const done = new Set<string>();
            let nextState = state;
            let deletedCount = 0;

            while (queue.length > 0 && done.size < 500) {
                const txId = queue.pop()!;
                if (done.has(txId)) continue;

                const tx = nextState.transactions.find(t => t.id === txId);
                if (!tx) continue;

                const partners = findSecuritySettlementCascadeDeletePartners(
                    { transactions: nextState.transactions, categories: nextState.categories, bills: nextState.bills },
                    tx
                );
                for (const p of partners) {
                    if (!done.has(p)) queue.push(p);
                }

                const newStateWithoutTx = { ...nextState, transactions: nextState.transactions.filter(t => t.id !== txId) };
                let finalState = applyTransactionEffect(newStateWithoutTx, tx, false);
                if (tx.contractId) Object.assign(finalState, updateContractStatus(finalState, tx.contractId));

                const patched = adjustOrRemoveRentAggregateExpenseAfterIncomeRemoved(finalState, tx, nextState.categories);
                finalState = patched ?? finalState;

                const aid = tx.projectAssetId;
                if (aid && !finalState.transactions.some(t => t.projectAssetId === aid)) {
                    finalState = {
                        ...finalState,
                        projectReceivedAssets: (finalState.projectReceivedAssets || []).filter(a => a.id !== aid),
                    };
                }

                nextState = finalState;
                const logEntry = createLogEntry(
                    'DELETE',
                    'Transaction',
                    tx.id,
                    `Deleted ${tx.type}: ${tx.description}`,
                    state.currentUser,
                    tx
                );
                nextState.transactionLog = [logEntry, ...(nextState.transactionLog || [])];
                done.add(txId);
                deletedCount++;
            }

            if (projectAssetIdToDelete) {
                nextState = {
                    ...nextState,
                    projectReceivedAssets: (nextState.projectReceivedAssets || []).filter(a => a.id !== projectAssetIdToDelete),
                };
            }

            if (deletedCount === 0 && nextState === state) return state;

            if (deletedCount > 0) {
                const summaryLog = createLogEntry(
                    'DELETE',
                    'Transaction',
                    'BATCH',
                    `Batch deleted ${deletedCount} transaction(s)`,
                    state.currentUser
                );
                nextState.transactionLog = [summaryLog, ...(nextState.transactionLog || [])];
            }
            return nextState;
        }

        case 'BATCH_ADD_TRANSACTIONS': {
            const txs = (action.payload as Transaction[]).map(tx => enrichExpenseBillPaymentCategory(stampTransactionOwnerId(tx, state), state));
            let batchState = { ...state, transactions: [...state.transactions, ...txs] };
            txs.forEach(tx => {
                batchState = applyTransactionEffect(batchState, tx, true);
                if (tx.contractId) batchState = updateContractStatus(batchState, tx.contractId);
            });
            const logEntry = createLogEntry('CREATE', 'Transaction', 'BATCH', `Batch added ${txs.length} transactions`, state.currentUser);
            batchState.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return batchState;
        }

        case 'RESTORE_TRANSACTION': {
            const txToRestore = enrichExpenseBillPaymentCategory(stampTransactionOwnerId(action.payload as Transaction, state), state);
            if (state.transactions.find(t => t.id === txToRestore.id)) return state; // Already exists
            let restoredState = { ...state, transactions: [...state.transactions, txToRestore] };
            restoredState = applyTransactionEffect(restoredState, txToRestore, true);
            if (txToRestore.contractId) restoredState = updateContractStatus(restoredState, txToRestore.contractId);
            const logEntry = createLogEntry('RESTORE', 'Transaction', txToRestore.id, `Restored ${txToRestore.type}: ${txToRestore.description}`, state.currentUser, txToRestore);
            restoredState.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return restoredState;
        }

        // --- ACCOUNT HANDLERS ---
        case 'ADD_ACCOUNT':
            return { ...state, accounts: [...state.accounts, action.payload] };
        case 'UPDATE_ACCOUNT':
            return { ...state, accounts: state.accounts.map(a => a.id === action.payload.id ? action.payload : a) };
        case 'DELETE_ACCOUNT':
            return { ...state, accounts: state.accounts.filter(a => a.id !== action.payload) };

        // --- CONTACT HANDLERS ---
        case 'ADD_CONTACT': {
            const contactToAdd = {
                ...action.payload,
                userId: action.payload?.userId || state.currentUser?.id || undefined,
                createdAt: action.payload?.createdAt || new Date().toISOString(),
                updatedAt: action.payload?.updatedAt || new Date().toISOString()
            };
            // Prevent duplicate contacts by ID
            if (state.contacts.find(c => c.id === contactToAdd.id)) {
                return state; // Already exists
            }
            return { ...state, contacts: [...state.contacts, contactToAdd] };
        }
        case 'UPDATE_CONTACT':
            return { ...state, contacts: state.contacts.map(c => c.id === action.payload.id ? action.payload : c) };
        case 'DELETE_CONTACT':
            return { ...state, contacts: state.contacts.filter(c => c.id !== action.payload) };

        // --- VENDOR HANDLERS ---
        case 'ADD_VENDOR': {
            const vendorToAdd = {
                ...action.payload,
                userId: action.payload?.userId || state.currentUser?.id || undefined,
                createdAt: action.payload?.createdAt || new Date().toISOString(),
                updatedAt: action.payload?.updatedAt || new Date().toISOString()
            };
            if (state.vendors.find(v => v.id === vendorToAdd.id)) {
                return { ...state, vendors: state.vendors.map(v => v.id === vendorToAdd.id ? vendorToAdd : v) };
            }
            return { ...state, vendors: [...state.vendors, vendorToAdd] };
        }
        case 'UPDATE_VENDOR':
            return { ...state, vendors: state.vendors.map(v => v.id === action.payload.id ? action.payload : v) };
        case 'DELETE_VENDOR':
            return { ...state, vendors: state.vendors.filter(v => v.id !== action.payload) };

        // --- ENTITY HANDLERS (Projects, Buildings, etc) ---
        case 'ADD_PROJECT':
            // Check if project already exists (prevents duplicates from WebSocket events)
            const existingProject = state.projects.find(p => p.id === action.payload.id);
            if (existingProject) {
                // If exists, update it instead of adding duplicate
                return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
            }
            return { ...state, projects: [...state.projects, action.payload] };
        case 'UPDATE_PROJECT':
            return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_PROJECT':
            return { ...state, projects: state.projects.filter(p => p.id !== action.payload) };

        case 'ADD_BUILDING':
            // Check if building already exists (prevents duplicates from WebSocket events)
            const existingBuilding = state.buildings.find(b => b.id === action.payload.id);
            if (existingBuilding) {
                // If exists, update it instead of adding duplicate
                return { ...state, buildings: state.buildings.map(b => b.id === action.payload.id ? action.payload : b) };
            }
            return { ...state, buildings: [...state.buildings, action.payload] };
        case 'UPDATE_BUILDING':
            return { ...state, buildings: state.buildings.map(b => b.id === action.payload.id ? action.payload : b) };
        case 'DELETE_BUILDING':
            return { ...state, buildings: state.buildings.filter(b => b.id !== action.payload) };

        case 'ADD_PROPERTY': {
            const existingProperty = state.properties.find(p => p.id === action.payload.id);
            if (existingProperty) {
                return { ...state, properties: state.properties.map(p => p.id === action.payload.id ? action.payload : p) };
            }
            return {
                ...state,
                properties: [...state.properties, action.payload],
            };
        }
        case 'UPDATE_PROPERTY':
            return {
                ...state,
                properties: state.properties.map((p) =>
                    String(p.id) === String(action.payload.id) ? action.payload : p
                ),
            };
        case 'DELETE_PROPERTY': {
            return {
                ...state,
                properties: state.properties.filter(p => p.id !== action.payload),
            };
        }

        case 'ADD_UNIT':
            // Check if unit already exists (prevents duplicates from WebSocket events)
            const existingUnit = state.units.find(u => u.id === action.payload.id);
            if (existingUnit) {
                // If exists, update it instead of adding duplicate
                return { ...state, units: state.units.map(u => u.id === action.payload.id ? action.payload : u) };
            }
            return { ...state, units: [...state.units, action.payload] };
        case 'UPDATE_UNIT': {
            const p = action.payload as Unit;
            return {
                ...state,
                units: state.units.map((u) => {
                    if (u.id !== p.id) return u;
                    const merged = { ...u, ...p };
                    const nm = merged.name != null ? String(merged.name).trim() : '';
                    if (nm) merged.unitNumber = nm;
                    return merged;
                }),
            };
        }
        case 'DELETE_UNIT':
            return { ...state, units: state.units.filter(u => u.id !== action.payload) };

        case 'ADD_CATEGORY':
            // Check if category already exists (prevents duplicates from WebSocket events)
            const existingCategory = state.categories.find(c => c.id === action.payload.id);
            if (existingCategory) {
                // If exists, update it instead of adding duplicate
                return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
            }
            return { ...state, categories: [...state.categories, action.payload] };
        case 'UPDATE_CATEGORY':
            return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
        case 'DELETE_CATEGORY':
            return { ...state, categories: state.categories.filter(c => c.id !== action.payload) };

        case 'ADD_USER':
            return { ...state, users: [...state.users, action.payload] };
        case 'UPDATE_USER':
            return { ...state, users: state.users.map(u => u.id === action.payload.id ? action.payload : u) };
        case 'DELETE_USER':
            return { ...state, users: state.users.filter(u => u.id !== action.payload) };

        // --- INVOICE/BILL HANDLERS ---
        case 'ADD_INVOICE':
            if (state.invoices.find(i => i.id === action.payload.id)) {
                return { ...state, invoices: state.invoices.map(i => i.id === action.payload.id ? action.payload : i) };
            }
            return { ...state, invoices: [...state.invoices, action.payload] };
        case 'UPDATE_INVOICE': {
            const inv = { ...action.payload };
            const paid = inv.paidAmount || 0;
            const amt = inv.amount || 0;
            if (paid >= amt - 0.1) inv.status = InvoiceStatus.PAID;
            else if (paid > 0.1) inv.status = InvoiceStatus.PARTIALLY_PAID;
            else if (inv.status !== InvoiceStatus.DRAFT) inv.status = InvoiceStatus.UNPAID;
            return { ...state, invoices: state.invoices.map(i => i.id === inv.id ? inv : i) };
        }
        case 'DELETE_INVOICE':
            return { ...state, invoices: state.invoices.filter(i => i.id !== action.payload) };

        case 'ADD_BILL':
            if (state.bills.find(b => b.id === action.payload.id)) {
                return { ...state, bills: state.bills.map(b => b.id === action.payload.id ? action.payload : b) };
            }
            return { ...state, bills: [...state.bills, action.payload] };
        case 'UPDATE_BILL': {
            const updatedBill = action.payload as Bill;
            const originalBill = state.bills.find(b => b.id === updatedBill.id);
            if (!originalBill) {
                // POST /bills can return the canonical row id (bill_number upsert) while the creator
                // still holds an optimistic row under a different client id — drop that phantom.
                const num = updatedBill.billNumber?.trim().toLowerCase();
                const droppedIds = new Set<string>();
                let bills = state.bills;
                if (num) {
                    bills = bills.filter((b) => {
                        const isOptimisticPhantom =
                            b.billNumber?.trim().toLowerCase() === num &&
                            !(typeof b.version === 'number' && b.version >= 1);
                        if (isOptimisticPhantom && b.id) droppedIds.add(b.id);
                        return !isOptimisticPhantom;
                    });
                }
                if (!bills.some((b) => b.id === updatedBill.id)) {
                    bills = [...bills, updatedBill];
                } else {
                    bills = bills.map((b) => (b.id === updatedBill.id ? updatedBill : b));
                }
                let pmCycleAllocations = state.pmCycleAllocations;
                if (droppedIds.size > 0 && pmCycleAllocations?.length) {
                    pmCycleAllocations = pmCycleAllocations.map((a) =>
                        a.billId && droppedIds.has(a.billId) ? { ...a, billId: updatedBill.id } : a
                    );
                }
                return { ...state, bills, pmCycleAllocations };
            }

            let newState = { ...state, bills: state.bills.map(b => b.id === updatedBill.id ? updatedBill : b) };

            // Keep pm_cycle_allocations in sync with PM fee bills (payment, amount, status)
            const relatedAllocation = state.pmCycleAllocations?.find((a) => a.billId === updatedBill.id);
            const paymentChanged =
                originalBill.paidAmount !== updatedBill.paidAmount || originalBill.status !== updatedBill.status;
            const pmBillAmountChanged =
                !!relatedAllocation && originalBill.amount !== updatedBill.amount;
            if (relatedAllocation && (paymentChanged || pmBillAmountChanged)) {
                let updatedAllocation = { ...relatedAllocation };
                if (paymentChanged) {
                    updatedAllocation.paidAmount = updatedBill.paidAmount || 0;
                    updatedAllocation.status =
                        updatedBill.status === InvoiceStatus.PAID
                            ? 'paid'
                            : updatedBill.status === InvoiceStatus.PARTIALLY_PAID
                              ? 'partially_paid'
                              : 'unpaid';
                }
                if (pmBillAmountChanged) {
                    updatedAllocation.amount = updatedBill.amount;
                    const fr = relatedAllocation.feeRate || 0;
                    if (fr > 0.0001) {
                        updatedAllocation.expenseTotal = updatedBill.amount / (fr / 100);
                    }
                }
                newState.pmCycleAllocations = newState.pmCycleAllocations!.map((a) =>
                    a.id === updatedAllocation.id ? updatedAllocation : a
                );
            }

            // If contractId is being added or changed, update existing transactions
            const contractIdChanged = updatedBill.contractId !== originalBill.contractId;
            const hasPayments = updatedBill.paidAmount > 0;

            if (contractIdChanged) {
                // If bill had a contract and it's being changed or removed, unlink transactions from old contract
                if (originalBill.contractId) {
                    newState.transactions = newState.transactions.map(tx => {
                        if (tx.billId === updatedBill.id && tx.contractId === originalBill.contractId) {
                            // Remove contractId from transaction (unless it's being set to a new contract)
                            return { ...tx, contractId: updatedBill.contractId || undefined };
                        }
                        return tx;
                    });
                    // Update old contract status
                    newState = updateContractStatus(newState, originalBill.contractId);
                }

                // If bill is being linked to a contract (new or changed), link transactions to new contract
                if (updatedBill.contractId) {
                    // Link all bill transactions to the new contract
                    newState.transactions = newState.transactions.map(tx => {
                        if (tx.billId === updatedBill.id) {
                            return { ...tx, contractId: updatedBill.contractId };
                        }
                        return tx;
                    });

                    // Update contract status to reflect the payments
                    newState = updateContractStatus(newState, updatedBill.contractId);
                }
            }

            return newState;
        }
        case 'DELETE_BILL': {
            const billId = action.payload as string;
            return {
                ...state,
                bills: state.bills.filter((b) => b.id !== billId),
                pmCycleAllocations: (state.pmCycleAllocations || []).filter((a) => a.billId !== billId),
            };
        }

        // --- PM CYCLE ALLOCATIONS ---
        case 'ADD_PM_CYCLE_ALLOCATION':
            return {
                ...state,
                pmCycleAllocations: [...(state.pmCycleAllocations || []), action.payload]
            };
        case 'UPDATE_PM_CYCLE_ALLOCATION':
            return {
                ...state,
                pmCycleAllocations: (state.pmCycleAllocations || []).map(a =>
                    a.id === action.payload.id ? action.payload : a
                )
            };
        case 'DELETE_PM_CYCLE_ALLOCATION':
            return {
                ...state,
                pmCycleAllocations: (state.pmCycleAllocations || []).filter(a => a.id !== action.payload)
            };

        case 'ADD_QUOTATION':
            return { ...state, quotations: [...(state.quotations || []), action.payload] };
        case 'UPDATE_QUOTATION':
            return { ...state, quotations: (state.quotations || []).map(q => q.id === action.payload.id ? action.payload : q) };
        case 'DELETE_QUOTATION':
            return { ...state, quotations: (state.quotations || []).filter(q => q.id !== action.payload) };
        case 'ADD_DOCUMENT':
            return { ...state, documents: [...(state.documents || []), action.payload] };
        case 'UPDATE_DOCUMENT':
            return { ...state, documents: (state.documents || []).map(d => d.id === action.payload.id ? action.payload : d) };
        case 'DELETE_DOCUMENT':
            return { ...state, documents: (state.documents || []).filter(d => d.id !== action.payload) };

        case 'ADD_BUDGET':
            return { ...state, budgets: [...state.budgets, action.payload] };
        case 'UPDATE_BUDGET':
            return { ...state, budgets: state.budgets.map(b => b.id === action.payload.id ? action.payload : b) };
        case 'DELETE_BUDGET':
            return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload) };

        // --- AGREEMENT HANDLERS ---
        case 'ADD_RENTAL_AGREEMENT': {
            const next = [...state.rentalAgreements, action.payload];
            return { ...state, rentalAgreements: reconcileRentalAgreementsList(next) };
        }
        case 'UPDATE_RENTAL_AGREEMENT': {
            const mapped = state.rentalAgreements.map(r => (r.id === action.payload.id ? action.payload : r));
            return { ...state, rentalAgreements: reconcileRentalAgreementsList(mapped) };
        }
        case 'DELETE_RENTAL_AGREEMENT':
            return { ...state, rentalAgreements: state.rentalAgreements.filter(r => r.id !== action.payload) };

        case 'ADD_PROJECT_AGREEMENT':
            return {
                ...state,
                projectAgreements: [
                    ...state.projectAgreements,
                    { ...action.payload, userId: action.payload?.userId || state.currentUser?.id || undefined }
                ]
            };
        case 'UPDATE_PROJECT_AGREEMENT':
            return { ...state, projectAgreements: state.projectAgreements.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_PROJECT_AGREEMENT':
            return { ...state, projectAgreements: state.projectAgreements.filter(p => p.id !== action.payload) };
        case 'CANCEL_PROJECT_AGREEMENT': {
            const { agreementId, penaltyPercentage, penaltyAmount, refundAmount, penaltyCategoryId, salesReturnId } = action.payload;
            const updatedAgreement = state.projectAgreements.find(pa => pa.id === agreementId);
            if (!updatedAgreement) return state;

            // Update agreement status and cancellation details
            const newAgreements = state.projectAgreements.map(pa =>
                pa.id === agreementId ? { ...pa, status: ProjectAgreementStatus.CANCELLED, cancellationDetails: { date: new Date().toISOString(), penaltyAmount, penaltyPercentage, refundAmount } } : pa
            );

            let newState = { ...state, projectAgreements: newAgreements };

            // 1. Update unit status to unsold (clear contactId from units)
            if (updatedAgreement.unitIds && updatedAgreement.unitIds.length > 0) {
                newState.units = newState.units.map(unit => {
                    if (updatedAgreement.unitIds.includes(unit.id)) {
                        return { ...unit, contactId: undefined };
                    }
                    return unit;
                });
            }

            // 2. Zero out pending invoices (set paidAmount = amount to void them for balance sheet)
            const agreementInvoices = newState.invoices.filter(inv => inv.agreementId === agreementId);
            const pendingInvoices = agreementInvoices.filter(inv =>
                inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID
            );

            // Zero out pending invoices by setting paidAmount = amount (voids them for balance sheet)
            // Also add a description to mark them as voided from cancelled agreement
            newState.invoices = newState.invoices.map(inv => {
                if (pendingInvoices.some(pInv => pInv.id === inv.id)) {
                    return {
                        ...inv,
                        paidAmount: inv.amount,
                        status: InvoiceStatus.PAID, // Mark as paid to void them
                        description: `VOIDED (Cancelled Agreement #${updatedAgreement.agreementNumber}) - ${inv.description || ''}`.trim()
                    };
                }
                return inv;
            });

            // 3. Record Penalty - Reduce Unit Selling Income AND add as Penalty Income
            if (penaltyAmount > 0) {
                // Get Unit Selling Income category to reduce it
                const unitSellingCategoryId = updatedAgreement.sellingPriceCategoryId;
                if (!unitSellingCategoryId) {
                    return newState;
                }

                // Sales Return Penalty (system) → legacy Penalty Income
                let penaltyCategoryId =
                    findSalesReturnCategory(state.categories, 'PENALTY')?.id
                    ?? resolveSystemCategoryId(state.categories, 'sys-cat-penalty-inc')
                    ?? state.categories.find(c => c.name === 'Penalty Income')?.id;
                if (!penaltyCategoryId) {
                    console.warn('Sales Return / Penalty Income category not found');
                    return newState;
                }

                // Use Cash account for the penalty reduction transaction
                // This ensures the penalty reduction appears in P&L (not excluded like Internal Clearing)
                const cashAccount = state.accounts.find(a => a.name === 'Cash') || state.accounts.find(a => a.type === AccountType.BANK);
                if (!cashAccount) {
                    return newState;
                }

                // Step 1: Reduce Unit Selling Income by penalty amount (expense with Unit Selling Income category)
                // This reduces income in P&L when sales return is processed
                const reduceIncomeByPenaltyTx: Transaction = {
                    id: `reduce-income-penalty-${Date.now()}`,
                    type: TransactionType.EXPENSE, // Expense reduces income (via category)
                    amount: Math.round(penaltyAmount), // Round to whole number
                    date: toLocalDateString(new Date()),
                    description: `Revenue Reduction - Penalty for Cancelled Agreement #${updatedAgreement.agreementNumber}`,
                    accountId: cashAccount.id, // Use Cash account so it appears in P&L
                    contactId: updatedAgreement.clientId,
                    projectId: updatedAgreement.projectId,
                    categoryId: unitSellingCategoryId, // Unit Selling Income category to reduce it
                    agreementId: agreementId
                };
                newState.transactions = [...newState.transactions, reduceIncomeByPenaltyTx];
                newState = applyTransactionEffect(newState, reduceIncomeByPenaltyTx, true);

                // Step 2: Add Penalty as INCOME in Penalty Income category
                const penaltyTx: Transaction = {
                    id: `penalty-${Date.now()}`,
                    type: TransactionType.INCOME, // Penalty is income to company
                    amount: Math.round(penaltyAmount), // Round to whole number
                    date: toLocalDateString(new Date()),
                    description: `Cancellation Penalty - Agreement #${updatedAgreement.agreementNumber} (${penaltyPercentage}% of ${updatedAgreement.sellingPrice.toLocaleString()})`,
                    accountId: cashAccount.id, // Use Cash account (penalty is retained)
                    contactId: updatedAgreement.clientId,
                    projectId: updatedAgreement.projectId,
                    categoryId: penaltyCategoryId, // Penalty Income category
                    agreementId: agreementId
                };
                newState.transactions = [...newState.transactions, penaltyTx];
                newState = applyTransactionEffect(newState, penaltyTx, true);
            }

            // 4. Record Refundable Amount
            // NOTE: We do NOT reduce income by refund amount at this point
            // The refund amount will reduce income only when it's actually paid to the owner
            // This ensures P&L shows correct figures:
            // - After sales return processed: Unit Selling Income = (original income - penalty)
            // - After refund paid: Unit Selling Income = (original income - penalty - refund)
            if (refundAmount > 0) {
                // No transaction is created here - the refund reduction will happen when refund is paid
                // The refund amount is tracked in the Sales Return record
                // When refund is paid via ProjectOwnerPayoutModal, it will:
                // 1. Create an EXPENSE transaction with Unit Selling Income category
                // 2. This will reduce Unit Selling Income in P&L (revenue reduction)
                // 3. Reduce Cash/Bank account (cash outflow)
            }

            return newState;
        }

        case 'ADD_PROJECT_RECEIVED_ASSET': {
            const existing = state.projectReceivedAssets?.find((a) => a.id === action.payload.id);
            if (existing) {
                return {
                    ...state,
                    projectReceivedAssets: (state.projectReceivedAssets || []).map((a) =>
                        a.id === action.payload.id ? action.payload : a
                    ),
                };
            }
            return { ...state, projectReceivedAssets: [...(state.projectReceivedAssets || []), action.payload] };
        }
        case 'UPDATE_PROJECT_RECEIVED_ASSET':
            return {
                ...state,
                projectReceivedAssets: (state.projectReceivedAssets || []).map((a) =>
                    a.id === action.payload.id ? action.payload : a
                ),
            };
        case 'DELETE_PROJECT_RECEIVED_ASSET':
            return {
                ...state,
                projectReceivedAssets: (state.projectReceivedAssets || []).filter((a) => a.id !== action.payload),
            };

        case 'ADD_SALES_RETURN':
            return { ...state, salesReturns: [...(state.salesReturns || []), action.payload] };
        case 'UPDATE_SALES_RETURN':
            return { ...state, salesReturns: (state.salesReturns || []).map(sr => sr.id === action.payload.id ? action.payload : sr) };
        case 'DELETE_SALES_RETURN':
            return { ...state, salesReturns: (state.salesReturns || []).filter(sr => sr.id !== action.payload) };
        case 'PROCESS_SALES_RETURN': {
            const returnRecord = state.salesReturns.find(sr => sr.id === action.payload.returnId);
            if (!returnRecord) return state;
            return {
                ...state,
                salesReturns: state.salesReturns.map(sr =>
                    sr.id === action.payload.returnId
                        ? { ...sr, status: SalesReturnStatus.PROCESSED, processedDate: new Date().toISOString() }
                        : sr
                )
            };
        }
        case 'MARK_RETURN_REFUNDED': {
            const returnRecord = state.salesReturns.find(sr => sr.id === action.payload.returnId);
            if (!returnRecord) return state;
            return {
                ...state,
                salesReturns: state.salesReturns.map(sr =>
                    sr.id === action.payload.returnId
                        ? { ...sr, status: SalesReturnStatus.REFUNDED, refundedDate: action.payload.refundDate }
                        : sr
                )
            };
        }
        case 'ADD_CONTRACT':
            return { ...state, contracts: [...(state.contracts || []), action.payload] };
        case 'UPDATE_CONTRACT': {
            const next: AppState = {
                ...state,
                contracts: (state.contracts || []).map((c) =>
                    c.id === action.payload.id ? action.payload : c
                ),
            };
            // Form may still send status "Completed" after totalAmount was raised; re-sync from paid vs total.
            return updateContractStatus(next, action.payload.id);
        }
        case 'DELETE_CONTRACT':
            return { ...state, contracts: (state.contracts || []).filter(c => c.id !== action.payload) };

        // --- RECURRING TEMPLATES ---
        case 'ADD_RECURRING_TEMPLATE':
            return { ...state, recurringInvoiceTemplates: [...state.recurringInvoiceTemplates, action.payload] };
        case 'UPDATE_RECURRING_TEMPLATE':
            return { ...state, recurringInvoiceTemplates: state.recurringInvoiceTemplates.map(t => t.id === action.payload.id ? action.payload : t) };
        case 'DELETE_RECURRING_TEMPLATE':
            return { ...state, recurringInvoiceTemplates: state.recurringInvoiceTemplates.filter(t => t.id !== action.payload) };


        // --- SETTINGS ---
        case 'UPDATE_DASHBOARD_CONFIG':
            return { ...state, dashboardConfig: action.payload };
        case 'UPDATE_ACCOUNT_CONSISTENCY':
            return { ...state, accountConsistency: action.payload };
        case 'UPDATE_AGREEMENT_SETTINGS':
            return { ...state, agreementSettings: action.payload };
        case 'UPDATE_PROJECT_AGREEMENT_SETTINGS':
            return { ...state, projectAgreementSettings: action.payload };
        case 'UPDATE_RENTAL_INVOICE_SETTINGS':
            return { ...state, rentalInvoiceSettings: action.payload };
        case 'UPDATE_PROJECT_INVOICE_SETTINGS':
            return { ...state, projectInvoiceSettings: action.payload };
        case 'UPDATE_PROCUREMENT_SETTINGS':
            return { ...state, procurementSettings: action.payload };
        case 'UPDATE_PRINT_SETTINGS':
            return { ...state, printSettings: action.payload };
        case 'UPDATE_WHATSAPP_TEMPLATES':
            return { ...state, whatsAppTemplates: action.payload };
        case 'ADD_INSTALLMENT_PLAN':
            return { ...state, installmentPlans: [...state.installmentPlans, action.payload] };
        case 'UPDATE_INSTALLMENT_PLAN':
            return { ...state, installmentPlans: state.installmentPlans.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_INSTALLMENT_PLAN':
            return { ...state, installmentPlans: state.installmentPlans.filter(p => p.id !== action.payload) };
        case 'ADD_PLAN_AMENITY':
            return { ...state, planAmenities: [...(state.planAmenities || []), action.payload] };
        case 'UPDATE_PLAN_AMENITY':
            return { ...state, planAmenities: (state.planAmenities || []).map(a => a.id === action.payload.id ? action.payload : a) };
        case 'DELETE_PLAN_AMENITY':
            return { ...state, planAmenities: (state.planAmenities || []).filter(a => a.id !== action.payload) };

        case 'UPDATE_PM_COST_PERCENTAGE':
            return { ...state, pmCostPercentage: action.payload };
        case 'UPDATE_DEFAULT_PROJECT':
            return { ...state, defaultProjectId: action.payload };
        case 'SET_LAST_SERVICE_CHARGE_RUN':
            return { ...state, lastServiceChargeRun: action.payload };
        case 'SET_WHATSAPP_MODE':
            return { ...state, whatsAppMode: action.payload };

        case 'TOGGLE_SYSTEM_TRANSACTIONS': return { ...state, showSystemTransactions: action.payload };
        case 'TOGGLE_COLOR_CODING': return { ...state, enableColorCoding: action.payload };
        case 'TOGGLE_BEEP_ON_SAVE': return { ...state, enableBeepOnSave: action.payload };
        case 'TOGGLE_DATE_PRESERVATION': return { ...state, enableDatePreservation: action.payload };
        case 'UPDATE_PRESERVED_DATE': return { ...state, lastPreservedDate: action.payload };

        case 'ADD_ERROR_LOG':
            return { ...state, errorLog: [action.payload, ...state.errorLog].slice(0, 50) };
        case 'CLEAR_ERROR_LOG':
            return { ...state, errorLog: [] };

        case 'RESET_TRANSACTIONS': {
            const logEntry = createLogEntry('CLEAR_ALL', 'Transactions', '', 'Cleared all transactions, invoices, bills, contracts, agreements, and sales returns', state.currentUser);
            return {
                ...state,
                transactions: [],
                invoices: [],
                bills: [],
                contracts: [],
                rentalAgreements: [],
                projectAgreements: [],
                salesReturns: [],
                // Preserve settings: recurringInvoiceTemplates, accounts (balances + bank opening reset), contacts, categories, projects, buildings, properties, units
                accounts: state.accounts.map(acc => {
                    const bankLike = acc.type === AccountType.BANK || acc.type === AccountType.CASH;
                    return { ...acc, balance: 0, ...(bankLike ? { openingBalance: 0 } : {}) };
                }),
                transactionLog: [logEntry, ...(state.transactionLog || [])]
            };
        }
        case 'LOAD_SAMPLE_DATA':
            // Return initial state (or a sample set if defined)
            return { ...initialState, users: state.users, printSettings: state.printSettings }; // Keep users/settings

        default:
            return state;
    }
}
