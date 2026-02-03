/**
 * Document Upload Service
 *
 * Uploads entity documents (contract, bill) to local state and cloud API.
 * Documents are saved in both local and cloud DB and accessible to organization users by role.
 */

import type { Document } from '../types';
import { apiClient } from './api/client';

const ACCEPTED_TYPES = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64 || '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a document for an entity (contract or bill). Saves to cloud API when authenticated
 * and adds to local state via dispatch so local DB persists it. Returns the document id.
 */
export async function uploadEntityDocument(
  file: File,
  entityType: 'contract' | 'bill',
  entityId: string,
  dispatch: (action: { type: 'ADD_DOCUMENT'; payload: Document }) => void,
  currentUserId?: string
): Promise<string> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size must be under ${MAX_FILE_SIZE_MB} MB.`);
  }

  const base64 = await readFileAsBase64(file);
  const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const doc: Document = {
    id: documentId,
    name: file.name,
    type: entityType,
    entityId,
    entityType,
    fileData: base64,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
    uploadedBy: currentUserId,
  };

  const isCloud = typeof window !== 'undefined' && !!localStorage.getItem('auth_token');
  if (isCloud) {
    try {
      const created = await apiClient.post<Document>('/documents', {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        entityId: doc.entityId,
        entityType: doc.entityType,
        fileData: doc.fileData,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedAt: doc.uploadedAt,
        uploadedBy: doc.uploadedBy,
      });
      if (created?.id) {
        doc.id = created.id;
      }
    } catch (err) {
      console.error('Document upload to API failed, saving locally only:', err);
    }
  }

  dispatch({ type: 'ADD_DOCUMENT', payload: doc });
  return doc.id;
}

/**
 * Open a document by ID: use in-memory fileData if available, otherwise fetch from API and open in new tab.
 */
export async function openDocumentById(
  documentId: string,
  documentsFromState: Document[] | undefined,
  openInNewTab: (url: string) => void,
  showAlert: (msg: string) => void | Promise<void>
): Promise<void> {
  const doc = documentsFromState?.find(d => d.id === documentId);
  if (doc?.fileData) {
    try {
      const byteChars = atob(d.fileData);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: doc.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      openInNewTab(url);
    } catch {
      await showAlert('Failed to open document.');
    }
    return;
  }
  try {
    const baseUrl = apiClient.getBaseUrl().replace(/\/$/, '');
    const token = apiClient.getToken();
    const res = await fetch(`${baseUrl}/documents/${documentId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Failed to load document');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    openInNewTab(url);
  } catch {
    await showAlert('Document not available or failed to load.');
  }
}

export { ACCEPTED_TYPES, MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES };
