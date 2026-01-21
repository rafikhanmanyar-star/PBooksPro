/**
 * Document Service
 * 
 * Handles file storage and retrieval for documents (quotations, bills, agreements, etc.)
 * Uses IndexedDB for storing file data
 */

import { Document } from '../types';

const DB_NAME = 'FinanceTrackerDocuments';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

class DocumentService {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    private async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                reject(new Error('Failed to open IndexedDB'));
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });

        return this.initPromise;
    }

    /**
     * Convert File to base64 string
     */
    private async fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Convert base64 string to Blob URL
     */
    private base64ToBlobUrl(base64: string, mimeType: string): string {
        // Handle data URL format (data:mime/type;base64,...) or plain base64
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        try {
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error('Failed to convert base64 to blob:', error);
            throw new Error('Invalid base64 data');
        }
    }

    /**
     * Save a document file
     */
    async saveDocument(document: Document, file: File): Promise<string> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const base64Data = await this.fileToBase64(file);
        
        const documentData: Document = {
            ...document,
            fileData: base64Data,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            uploadedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(documentData);

            request.onsuccess = () => resolve(documentData.id);
            request.onerror = () => reject(new Error('Failed to save document'));
        });
    }

    /**
     * Get document file URL
     */
    async getDocumentUrl(documentId: string): Promise<string | null> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(documentId);

            request.onsuccess = () => {
                const doc = request.result as Document | undefined;
                if (!doc || !doc.fileData) {
                    resolve(null);
                    return;
                }

                const blobUrl = this.base64ToBlobUrl(doc.fileData, doc.mimeType);
                resolve(blobUrl);
            };

            request.onerror = () => reject(new Error('Failed to get document'));
        });
    }

    /**
     * Get document data
     */
    async getDocument(documentId: string): Promise<Document | null> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(documentId);

            request.onsuccess = () => {
                resolve(request.result as Document | null);
            };

            request.onerror = () => reject(new Error('Failed to get document'));
        });
    }

    /**
     * Delete a document
     */
    async deleteDocument(documentId: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(documentId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('Failed to delete document'));
        });
    }

    /**
     * Download document as file
     */
    async downloadDocument(documentId: string, fileName?: string): Promise<void> {
        const doc = await this.getDocument(documentId);
        if (!doc) throw new Error('Document not found');

        const url = await this.getDocumentUrl(documentId);
        if (!url) throw new Error('Failed to get document URL');

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || doc.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
}

// Lazy singleton instance - avoids potential TDZ errors during module initialization
let documentServiceInstance: DocumentService | null = null;

export function getDocumentService(): DocumentService {
    if (!documentServiceInstance) {
        documentServiceInstance = new DocumentService();
    }
    return documentServiceInstance;
}

// Backward compatible export
export const documentService = {
    saveDocument: (...args: Parameters<DocumentService['saveDocument']>) => 
        getDocumentService().saveDocument(...args),
    getDocument: (...args: Parameters<DocumentService['getDocument']>) => 
        getDocumentService().getDocument(...args),
    deleteDocument: (...args: Parameters<DocumentService['deleteDocument']>) => 
        getDocumentService().deleteDocument(...args),
    getAllDocuments: () => getDocumentService().getAllDocuments(),
    downloadDocument: (...args: Parameters<DocumentService['downloadDocument']>) => 
        getDocumentService().downloadDocument(...args),
};

