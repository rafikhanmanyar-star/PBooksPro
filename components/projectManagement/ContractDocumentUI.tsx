import React, { useCallback } from 'react';
import type { Contract, Document } from '../../types';
import { ICONS } from '../../constants';
import Button from '../ui/Button';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { useNotification } from '../../context/NotificationContext';
import { openDocumentById } from '../../services/documentUploadService';

export function contractHasAttachedDocument(
    contract: Pick<Contract, 'documentId' | 'documentPath'>
): boolean {
    return !!(String(contract.documentId ?? '').trim() || String(contract.documentPath ?? '').trim());
}

export function getContractDocumentFileName(
    contract: Pick<Contract, 'documentId' | 'documentPath'>,
    documents?: Document[]
): string {
    const docId = String(contract.documentId ?? '').trim();
    if (docId) {
        const doc = documents?.find((d) => d.id === docId);
        return doc?.fileName || doc?.name || 'Document';
    }
    const path = String(contract.documentPath ?? '').trim();
    if (path) {
        return path.split(/[/\\]/).pop() || 'Document';
    }
    return '';
}

export async function openContractDocument(
    contract: Pick<Contract, 'documentId' | 'documentPath'>,
    documents: Document[] | undefined,
    showAlert: (msg: string) => void | Promise<void>
): Promise<void> {
    const docId = String(contract.documentId ?? '').trim();
    const docPath = String(contract.documentPath ?? '').trim();

    if (docId) {
        await openDocumentById(docId, documents, (url) => window.open(url, '_blank'), showAlert);
        return;
    }
    if (docPath && (window as { electronAPI?: { openDocumentFile?: (opts: { filePath: string }) => Promise<{ success?: boolean; error?: string }> } }).electronAPI?.openDocumentFile) {
        try {
            const result = await (window as { electronAPI: { openDocumentFile: (opts: { filePath: string }) => Promise<{ success?: boolean; error?: string }> } }).electronAPI.openDocumentFile({ filePath: docPath });
            if (!result?.success) await showAlert(`Failed to open: ${result?.error || 'Unknown'}`);
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Error opening document');
        }
        return;
    }
    if (docPath) {
        await showAlert('File system access not available');
        return;
    }
    await showAlert('No document attached to this contract.');
}

type ContractDocumentListHintProps = {
    contract: Contract;
    documents?: Document[];
    className?: string;
};

/** Compact attachment indicator for contract tables/lists. */
export const ContractDocumentListHint: React.FC<ContractDocumentListHintProps> = ({
    contract,
    documents,
    className = '',
}) => {
    if (!contractHasAttachedDocument(contract)) return null;
    const fileName = getContractDocumentFileName(contract, documents);
    return (
        <span
            className={`inline-flex items-center gap-1 text-[10px] text-primary font-medium mt-0.5 max-w-full ${className}`}
            title={`Attached: ${fileName}`}
        >
            <span className="w-3 h-3 shrink-0 opacity-80">{ICONS.fileText}</span>
            <span className="truncate">{fileName}</span>
        </span>
    );
};

type ContractDocumentAttachmentPanelProps = {
    contract: Contract;
    documents?: Document[];
    className?: string;
    compact?: boolean;
};

/** Read-only attached document card with Open action (view mode). */
export const ContractDocumentAttachmentPanel: React.FC<ContractDocumentAttachmentPanelProps> = ({
    contract,
    documents: documentsProp,
    className = '',
    compact = false,
}) => {
    const stateDocuments = useStateSelector((s) => s.documents);
    const documents = documentsProp ?? stateDocuments;
    const { showAlert } = useNotification();

    const handleOpen = useCallback(
        async (e?: React.MouseEvent) => {
            e?.stopPropagation();
            await openContractDocument(contract, documents, showAlert);
        },
        [contract, documents, showAlert]
    );

    if (!contractHasAttachedDocument(contract)) return null;

    const fileName = getContractDocumentFileName(contract, documents);

    if (compact) {
        return (
            <div className={`rounded-lg border border-app-border bg-app-card p-2.5 flex items-center justify-between gap-2 ${className}`}>
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-primary/10 rounded flex items-center justify-center shrink-0">
                        <div className="w-3.5 h-3.5 text-primary">{ICONS.fileText}</div>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] text-app-muted uppercase tracking-wide">Attachment</p>
                        <p className="text-xs font-medium text-app-text truncate" title={fileName}>
                            {fileName}
                        </p>
                    </div>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={handleOpen}>
                    Open
                </Button>
            </div>
        );
    }

    return (
        <div className={`no-print mb-6 ${className}`}>
            <h4 className="font-bold text-app-text mb-2 border-b border-app-border pb-1">Contract Document</h4>
            <div className="p-4 bg-app-toolbar rounded-lg border border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                        <div className="w-5 h-5 text-primary">{ICONS.fileText}</div>
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-app-text">Document attached</p>
                        <p className="text-xs text-app-muted truncate" title={fileName}>
                            {fileName}
                        </p>
                    </div>
                </div>
                <Button type="button" variant="secondary" onClick={handleOpen} className="shrink-0">
                    Open Document
                </Button>
            </div>
        </div>
    );
};
