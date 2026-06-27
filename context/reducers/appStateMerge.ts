import type {
    AppState,
    AppAction,
    Invoice,
    Bill,
    ProjectReceivedAsset,
    SalesReturn,
    Transaction,
    ProjectAgreement,
} from '../../types';

export function mergeTenantSettingsFromAction(prev: AppState, action: AppAction): AppState | null {
    switch (action.type) {
        case 'TOGGLE_SYSTEM_TRANSACTIONS':
            return { ...prev, showSystemTransactions: action.payload };
        case 'TOGGLE_COLOR_CODING':
            return { ...prev, enableColorCoding: action.payload };
        case 'TOGGLE_BEEP_ON_SAVE':
            return { ...prev, enableBeepOnSave: action.payload };
        case 'TOGGLE_DATE_PRESERVATION':
            return { ...prev, enableDatePreservation: action.payload };
        case 'UPDATE_DEFAULT_PROJECT':
            return { ...prev, defaultProjectId: action.payload };
        case 'SET_WHATSAPP_MODE':
            return { ...prev, whatsAppMode: action.payload };
        case 'UPDATE_DASHBOARD_CONFIG':
            return { ...prev, dashboardConfig: action.payload };
        case 'UPDATE_ACCOUNT_CONSISTENCY':
            return { ...prev, accountConsistency: action.payload };
        case 'UPDATE_AGREEMENT_SETTINGS':
            return { ...prev, agreementSettings: action.payload };
        case 'UPDATE_PROJECT_AGREEMENT_SETTINGS':
            return { ...prev, projectAgreementSettings: action.payload };
        case 'UPDATE_RENTAL_INVOICE_SETTINGS':
            return { ...prev, rentalInvoiceSettings: action.payload };
        case 'UPDATE_PROJECT_INVOICE_SETTINGS':
            return { ...prev, projectInvoiceSettings: action.payload };
        case 'UPDATE_PROCUREMENT_SETTINGS':
            return { ...prev, procurementSettings: action.payload };
        case 'UPDATE_PRINT_SETTINGS':
            return { ...prev, printSettings: action.payload };
        case 'UPDATE_WHATSAPP_TEMPLATES':
            return { ...prev, whatsAppTemplates: action.payload };
        case 'UPDATE_PM_COST_PERCENTAGE':
            return { ...prev, pmCostPercentage: action.payload };
        case 'UPDATE_INVOICE_TEMPLATE':
            return { ...prev, invoiceHtmlTemplate: action.payload };
        default:
            return null;
    }
}

export function mergeInvoicesWithServerBaseline(base: Invoice[], server: Invoice[]): Invoice[] {
    const serverIds = new Set(server.map((i) => i.id).filter(Boolean));
    const out = [...server];
    for (const inv of base) {
        if (!inv.id || serverIds.has(inv.id)) continue;
        // Rows missing from the server list were soft-deleted (listInvoices omits deleted_at)
        // or never existed server-side. Do not resurrect synced invoices that were deleted.
        const hadServerVersion = typeof inv.version === 'number' && inv.version >= 1;
        if (hadServerVersion) continue;
        // Keep optimistic / not-yet-persisted creates (no server version yet)
        out.push(inv);
    }
    return out;
}

/** Same merge policy as invoices: keep optimistic bill rows until the server acknowledges them with a version. */
export function mergeBillsWithServerBaseline(base: Bill[], server: Bill[]): Bill[] {
    const serverIds = new Set(server.map((b) => b.id).filter(Boolean));
    const serverBillNumbers = new Set(
        server.map((b) => b.billNumber?.trim().toLowerCase()).filter((n): n is string => !!n)
    );
    const out = [...server];
    for (const bill of base) {
        if (!bill.id || serverIds.has(bill.id)) continue;
        const hadServerVersion = typeof bill.version === 'number' && bill.version >= 1;
        if (hadServerVersion) continue;
        const num = bill.billNumber?.trim().toLowerCase();
        if (num && serverBillNumbers.has(num)) continue;
        out.push(bill);
    }
    return out;
}

export function mergeProjectReceivedAssetsWithServerBaseline(base: ProjectReceivedAsset[], server: ProjectReceivedAsset[]): ProjectReceivedAsset[] {
    const serverIds = new Set(server.map((a) => a.id).filter(Boolean));
    const out = [...server];
    for (const a of base) {
        if (a.id && !serverIds.has(a.id)) {
            out.push(a);
        }
    }
    return out;
}

export function mergeSalesReturnsWithServerBaseline(base: SalesReturn[], server: SalesReturn[]): SalesReturn[] {
    const serverIds = new Set(server.map((sr) => sr.id).filter(Boolean));
    const out = [...server];
    for (const sr of base) {
        if (sr.id && !serverIds.has(sr.id)) {
            out.push(sr);
        }
    }
    return out;
}

/**
 * Merge server transaction rows into the current client baseline.
 * Server wins on id conflict. Keeps client rows missing from a stale partial
 * (sync-gap / concurrent full refresh after save or socket patch).
 */
export function mergeTransactionsWithServerBaseline(base: Transaction[], server: Transaction[]): Transaction[] {
    const serverIds = new Set(server.map((t) => t.id).filter(Boolean));
    const out = [...server];
    for (const tx of base) {
        if (!tx.id || serverIds.has(tx.id)) continue;
        out.push(tx);
    }
    return out;
}

/** Same merge policy as transactions — project selling agreements vanish without this on stale refresh. */
export function mergeProjectAgreementsWithServerBaseline(
    base: ProjectAgreement[],
    server: ProjectAgreement[]
): ProjectAgreement[] {
    const serverIds = new Set(server.map((a) => a.id).filter(Boolean));
    const out = [...server];
    for (const agreement of base) {
        if (!agreement.id || serverIds.has(agreement.id)) continue;
        out.push(agreement);
    }
    return out;
}

/** Merge a server partial snapshot into a client baseline (preserves optimistic rows). */
export function mergePartialStateIntoBaseline(
    base: AppState,
    partial: Partial<AppState>,
    tenantSettings: Partial<AppState> = {}
): AppState {
    return {
        ...base,
        ...partial,
        transactions: mergeTransactionsWithServerBaseline(base.transactions || [], partial.transactions || []),
        // Deferred entities: only replace when the partial actually contains the entity.
        // When loadStateBulkChunked runs (bootstrap without deferred entities), these keys
        // are absent from partial, so we preserve the existing state to prevent flash.
        invoices: partial.invoices !== undefined
            ? mergeInvoicesWithServerBaseline(base.invoices || [], partial.invoices)
            : (base.invoices || []),
        bills: partial.bills !== undefined
            ? mergeBillsWithServerBaseline(base.bills || [], partial.bills)
            : (base.bills || []),
        projectAgreements: partial.projectAgreements !== undefined
            ? mergeProjectAgreementsWithServerBaseline(base.projectAgreements || [], partial.projectAgreements)
            : (base.projectAgreements || []),
        contacts: partial.contacts !== undefined ? partial.contacts : (base.contacts || []),
        vendors: partial.vendors !== undefined ? partial.vendors : (base.vendors || []),
        personalTransactions: partial.personalTransactions !== undefined
            ? partial.personalTransactions
            : (base.personalTransactions || []),
        projectReceivedAssets: mergeProjectReceivedAssetsWithServerBaseline(
            base.projectReceivedAssets || [],
            partial.projectReceivedAssets || []
        ),
        salesReturns: mergeSalesReturnsWithServerBaseline(
            base.salesReturns || [],
            partial.salesReturns || []
        ),
        contracts: partial.contracts ?? base.contracts,
        ...tenantSettings,
    } as AppState;
}
