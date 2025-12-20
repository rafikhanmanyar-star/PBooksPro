
import React from 'react';
import { Peer } from 'peerjs';
import { AppState, AppAction, TransactionLogEntry } from '../types';

type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error';
type SyncRole = 'host' | 'client' | null;

interface SyncState {
    status: SyncStatus;
    role: SyncRole;
    peerId: string | null;
    connectedPeerId: string | null;
    error: string | null;
    progress: {
        message: string;
        percentage: number;
    } | null;
}

class SyncService {
    private peer: Peer | null = null;
    private conn: any = null;
    private dispatch: React.Dispatch<AppAction> | null = null;
    private getState: (() => AppState) | null = null;
    private statusListeners: ((state: SyncState) => void)[] = [];
    private heartbeatInterval: any = null;
    private heartbeatCheckInterval: any = null;
    private lastHeartbeat: number = 0;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;

    private state: SyncState = {
        status: 'disconnected',
        role: null,
        peerId: null,
        connectedPeerId: null,
        error: null,
        progress: null
    };

    public init(dispatch: React.Dispatch<AppAction>, getState: () => AppState) {
        this.dispatch = dispatch;
        this.getState = getState;
    }

    private updateState(updates: Partial<SyncState>) {
        this.state = { ...this.state, ...updates };
        this.notifyListeners();
    }

    private updateProgress(message: string, percentage: number) {
        this.updateState({ 
            status: percentage < 100 ? 'syncing' : 'connected',
            progress: percentage < 100 ? { message, percentage } : null 
        });
    }

    public subscribe(listener: (state: SyncState) => void) {
        this.statusListeners.push(listener);
        listener(this.state);
        return () => {
            this.statusListeners = this.statusListeners.filter(l => l !== listener);
        };
    }

    private notifyListeners() {
        this.statusListeners.forEach(l => l(this.state));
    }

    public async startHosting(): Promise<string> {
        this.updateState({ status: 'connecting', role: 'host', error: null });

        return new Promise((resolve, reject) => {
            try {
                this.peer = new Peer({ debug: 1 });

                this.peer.on('open', (id) => {
                    this.updateState({ status: 'connecting', peerId: id });
                    resolve(id);
                });

                this.peer.on('connection', (conn) => {
                    if (this.conn && this.conn.open) {
                        this.conn.close();
                    }
                    this.conn = conn;
                    this.setupConnection('host');
                });

                this.peer.on('error', (err) => {
                    console.error('Peer error:', err);
                    if (err.type === 'network' || err.type === 'peer-unavailable' || err.type === 'socket-error') {
                        this.attemptReconnect();
                    } else {
                        this.updateState({ status: 'error', error: err.message });
                        reject(err);
                    }
                });
                
                this.peer.on('disconnected', () => {
                    console.log('Peer disconnected from server, attempting reconnect...');
                    this.attemptReconnect();
                });
            } catch (err) {
                this.updateState({ status: 'error', error: String(err) });
                reject(err);
            }
        });
    }

    private attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts && this.peer && !this.peer.destroyed) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            setTimeout(() => {
                if (this.peer && !this.peer.destroyed) {
                    this.peer.reconnect();
                }
            }, 2000 * this.reconnectAttempts); 
        } else if (this.state.status !== 'disconnected') {
            this.updateState({ status: 'error', error: 'Connection lost. Please restart sync.' });
        }
    }

    public async joinSession(hostId: string): Promise<void> {
        this.updateState({ status: 'connecting', role: 'client', error: null });

        return new Promise((resolve, reject) => {
            try {
                this.peer = new Peer({ debug: 1 });

                this.peer.on('open', (id) => {
                    this.updateState({ peerId: id });
                    if (!this.peer) return;
                    this.conn = this.peer.connect(hostId, {
                        reliable: true,
                        serialization: 'json'
                    });
                    this.setupConnection('client');
                    resolve();
                });

                this.peer.on('error', (err) => {
                     console.error('Peer join error:', err);
                     this.updateState({ status: 'error', error: 'Could not connect to host. Check ID.' });
                     reject(err);
                });
                
                this.peer.on('disconnected', () => {
                     this.peer?.reconnect();
                });

            } catch (err) {
                 this.updateState({ status: 'error', error: String(err) });
                 reject(err);
            }
        });
    }

    public disconnect() {
        this.stopHeartbeat();
        if (this.conn) {
            this.conn.close();
        }
        if (this.peer) {
            this.peer.destroy();
        }
        this.peer = null;
        this.conn = null;
        this.updateState({ status: 'disconnected', role: null, peerId: null, connectedPeerId: null, progress: null });
    }

    private setupConnection(role: SyncRole) {
        if (!this.conn) return;

        this.conn.on('open', () => {
            this.updateState({ status: 'connected', connectedPeerId: this.conn.peer });
            console.log(`Connected to ${this.conn.peer} as ${role}`);
            this.reconnectAttempts = 0; 
            this.lastHeartbeat = Date.now();

            this.startHeartbeat();

            if (this.getState) {
                const appState = this.getState();
                const syncPayload = this.prepareSyncPayload(appState);
                this.sendData({ type: 'SYNC_REQUEST', payload: syncPayload });
            }
        });

        this.conn.on('data', (data: any) => {
            this.lastHeartbeat = Date.now();
            this.handleIncomingData(data);
        });

        this.conn.on('close', () => {
            console.log("Connection closed.");
            this.stopHeartbeat();
            this.updateState({ status: 'disconnected', connectedPeerId: null });
        });
        
        this.conn.on('error', (err: any) => {
            console.error("Connection error", err);
        });
    }
    
    private startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.conn && this.conn.open) {
                try {
                    this.conn.send({ type: 'HEARTBEAT', timestamp: Date.now() });
                } catch (e) {
                    console.warn("Failed to send heartbeat", e);
                }
            }
        }, 2000);

        this.heartbeatCheckInterval = setInterval(() => {
            if (this.state.status === 'connected') {
                const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
                if (timeSinceLastHeartbeat > 15000) { 
                    console.warn("Heartbeat timeout. Peer might be disconnected.");
                    this.updateState({ status: 'error', error: 'Connection unstable' });
                }
            }
        }, 5000);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatCheckInterval) {
            clearInterval(this.heartbeatCheckInterval);
            this.heartbeatCheckInterval = null;
        }
    }

    private sendData(data: any) {
        if (this.conn && this.conn.open) {
            try {
                this.conn.send(data);
            } catch (e) {
                console.error("Failed to send data", e);
                this.updateState({ status: 'error', error: 'Transmission failed' });
            }
        }
    }

    public broadcastAction(action: AppAction) {
        const LOCAL_ACTIONS = [
            'SET_PAGE', 'SET_EDITING_ENTITY', 'CLEAR_EDITING_ENTITY', 'SET_INITIAL_TABS',
            'CLEAR_INITIAL_TABS', 'SET_INITIAL_TRANSACTION_TYPE', 'CLEAR_INITIAL_TRANSACTION_TYPE',
            'SET_INITIAL_TRANSACTION_FILTER', 'LOGIN', 'LOGOUT', 'SET_UPDATE_AVAILABLE'
        ];

        if (this.state.status === 'connected' && !LOCAL_ACTIONS.includes(action.type)) {
             // CRITICAL: If this is a State Restore or Reset, we must trigger a full SYNC_REQUEST
             // This ensures the receiver enters the "Syncing..." state and runs the merge logic
             // rather than just replacing state blindly without UI feedback.
             if (action.type === 'SET_STATE' || action.type === 'LOAD_SAMPLE_DATA') {
                 // For SET_STATE, the payload is the new state. For LOAD_SAMPLE_DATA, we need the resulting state.
                 // Note: Since we are in the middleware, for LOAD_SAMPLE_DATA we might be sending the action before the state updates locally.
                 // However, SET_STATE (Restore) comes with the full payload.
                 
                 let payloadToSync;
                 if (action.type === 'SET_STATE') {
                     payloadToSync = action.payload;
                 } else {
                     // For RESET/LOAD_SAMPLE, we send the action, but also force a sync shortly after?
                     // Actually, just sending the action is fine for simple resets, but for Restore (SET_STATE), 
                     // we MUST send SYNC_REQUEST because the payload is the Data.
                     // Here we'll rely on the receiver to handle LOAD_SAMPLE_DATA action if we send it as action,
                     // but for robustness with Restore (SET_STATE), we send SYNC_REQUEST.
                     payloadToSync = null; 
                 }

                 if (payloadToSync) {
                     const cleanPayload = this.prepareSyncPayload(payloadToSync);
                     this.sendData({ type: 'SYNC_REQUEST', payload: cleanPayload });
                 } else {
                     // For non-payload resets, standard action broadcast is okay
                     this.sendData({ type: 'ACTION', payload: action });
                 }
             } else {
                 this.sendData({ type: 'ACTION', payload: action });
             }
        }
    }

    private prepareSyncPayload(appState: AppState) {
        const { editingEntity, currentPage, initialTransactionFilter, initialTabs, ...syncState } = appState as any;
        return syncState;
    }

    private async handleIncomingData(data: any) {
        if (data.type === 'HEARTBEAT') return;

        if (!this.dispatch || !this.getState) return;

        if (data.type === 'SYNC_REQUEST') {
            this.updateState({ status: 'syncing' });
            const remoteState = data.payload;
            const localState = this.getState();
            
            // Perform async merge
            const mergedState = await this.mergeStates(localState, remoteState);
            
            (mergedState as any)._isRemote = true; 
            mergedState.currentPage = localState.currentPage;
            mergedState.editingEntity = localState.editingEntity;
            
            this.dispatch({ type: 'SET_STATE', payload: mergedState });
            
            // Small delay to let UI show 100% before switching state back to connected
            setTimeout(() => {
                this.updateState({ status: 'connected', progress: null });
            }, 500);
        } 
        else if (data.type === 'ACTION') {
            const action = data.payload;
            (action as any)._isRemote = true; 
            this.dispatch(action);
        }
    }

    private async mergeStates(local: AppState, remote: any): Promise<AppState> {
        this.updateProgress('Analyzing Transaction Logs...', 10);
        await new Promise(r => setTimeout(r, 50)); // UI Breath

        // 1. Merge Logs & Determine Deletions
        // We combine both logs to find items that have been deleted on either side.
        const combinedLogs = [...(local.transactionLog || []), ...(remote.transactionLog || [])];
        
        // Map most recent action timestamp for every entityID
        const deletionMap = new Map<string, number>(); 
        const restoreMap = new Map<string, number>();

        combinedLogs.forEach((log: TransactionLogEntry) => {
            const ts = new Date(log.timestamp).getTime();
            if (log.entityId) {
                if (log.action === 'DELETE') {
                    const existing = deletionMap.get(log.entityId) || 0;
                    if (ts > existing) deletionMap.set(log.entityId, ts);
                }
                if (log.action === 'RESTORE' || log.action === 'CREATE') {
                    const existing = restoreMap.get(log.entityId) || 0;
                    if (ts > existing) restoreMap.set(log.entityId, ts);
                }
            }
        });

        // An item is effectively deleted if it has a DELETE action that is newer than any RESTORE/CREATE action
        const isDeleted = (id: string) => {
            const delTime = deletionMap.get(id);
            if (!delTime) return false;
            const resTime = restoreMap.get(id) || 0;
            return delTime > resTime;
        };

        const merged = { ...local };
        const totalSteps = 10;
        let currentStep = 0;

        const mergeArrays = (localArr: any[], remoteArr: any[], entityName: string) => {
            currentStep++;
            this.updateProgress(`Syncing ${entityName}...`, 10 + (currentStep / totalSteps * 80));
            
            if (!Array.isArray(localArr)) localArr = [];
            if (!Array.isArray(remoteArr)) remoteArr = [];
            
            const map = new Map();
            
            // Add local items
            localArr.forEach(item => map.set(item.id, item));
            
            // Add/Overwrite with remote items
            remoteArr.forEach(item => {
                if (!map.has(item.id)) {
                    map.set(item.id, item);
                } else {
                    // Simple conflict resolution: 
                    // 1. Prefer higher paidAmount for financial docs
                    // 2. Otherwise default to preserving local (or remote if we want "last sync wins")
                    // Real conflict res needs timestamps on entities.
                    const localItem = map.get(item.id);
                    if (('paidAmount' in item) && (item.paidAmount > (localItem.paidAmount || 0))) {
                        map.set(item.id, item);
                    }
                    // For now, if IDs match and it's not a financial doc with better progress, we keep Local.
                    // This prevents overwriting unsaved form edits on the active device.
                }
            });

            // Filter out deleted items
            const mergedList = Array.from(map.values()).filter(item => !isDeleted(item.id));
            return mergedList;
        };

        // --- Execute Merges ---
        merged.accounts = mergeArrays(local.accounts, remote.accounts, 'Accounts');
        merged.contacts = mergeArrays(local.contacts, remote.contacts, 'Contacts');
        merged.categories = mergeArrays(local.categories, remote.categories, 'Categories');
        merged.users = mergeArrays(local.users, remote.users, 'Users');

        merged.projects = mergeArrays(local.projects, remote.projects, 'Projects');
        merged.buildings = mergeArrays(local.buildings, remote.buildings, 'Buildings');
        merged.properties = mergeArrays(local.properties, remote.properties, 'Properties');
        merged.units = mergeArrays(local.units, remote.units, 'Units');

        merged.rentalAgreements = mergeArrays(local.rentalAgreements, remote.rentalAgreements, 'Rental Agreements');
        merged.projectAgreements = mergeArrays(local.projectAgreements, remote.projectAgreements, 'Project Agreements');
        merged.contracts = mergeArrays(local.contracts || [], remote.contracts || [], 'Contracts');

        merged.invoices = mergeArrays(local.invoices, remote.invoices, 'Invoices');
        merged.bills = mergeArrays(local.bills, remote.bills, 'Bills');
        
        merged.projectStaff = mergeArrays(local.projectStaff, remote.projectStaff, 'Staff');
        merged.rentalStaff = mergeArrays(local.rentalStaff, remote.rentalStaff, 'Staff');
        
        merged.projectPayslips = mergeArrays(local.projectPayslips, remote.projectPayslips, 'Payslips');
        merged.rentalPayslips = mergeArrays(local.rentalPayslips, remote.rentalPayslips, 'Payslips');

        merged.transactions = mergeArrays(local.transactions, remote.transactions, 'Transactions');
        
        merged.budgets = mergeArrays(local.budgets, remote.budgets, 'Budgets');
        merged.recurringInvoiceTemplates = mergeArrays(local.recurringInvoiceTemplates, remote.recurringInvoiceTemplates, 'Recurring Templates');

        // --- Merge Configs ---
        this.updateProgress('Finalizing Configuration...', 95);
        
        if (remote.printSettings) merged.printSettings = { ...local.printSettings, ...remote.printSettings };
        if (remote.whatsAppTemplates) merged.whatsAppTemplates = { ...local.whatsAppTemplates, ...remote.whatsAppTemplates };
        
        const mergeSeq = (loc: any, rem: any) => (!rem ? loc : { ...loc, ...rem, nextNumber: Math.max(loc?.nextNumber || 1, rem?.nextNumber || 1) });
        merged.agreementSettings = mergeSeq(local.agreementSettings, remote.agreementSettings);
        merged.projectAgreementSettings = mergeSeq(local.projectAgreementSettings, remote.projectAgreementSettings);
        merged.rentalInvoiceSettings = mergeSeq(local.rentalInvoiceSettings, remote.rentalInvoiceSettings);
        merged.projectInvoiceSettings = mergeSeq(local.projectInvoiceSettings, remote.projectInvoiceSettings);

        if (remote.pmCostPercentage !== undefined) merged.pmCostPercentage = remote.pmCostPercentage;
        if (remote.invoiceHtmlTemplate && remote.invoiceHtmlTemplate.length > (local.invoiceHtmlTemplate?.length || 0)) {
             merged.invoiceHtmlTemplate = remote.invoiceHtmlTemplate;
        }

        // Merge Logs (Union + Sort)
        // We keep deleted logs to ensure future syncs respect the deletion
        const uniqueLogIds = new Set(local.transactionLog?.map(l => l.id));
        const newLogs = (remote.transactionLog || []).filter((l: any) => !uniqueLogIds.has(l.id));
        merged.transactionLog = [...(local.transactionLog || []), ...newLogs]
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 1000); // Keep last 1000 logs to keep packet size manageable over time

        this.updateProgress('Sync Complete!', 100);
        return merged;
    }
}

export const syncService = new SyncService();
