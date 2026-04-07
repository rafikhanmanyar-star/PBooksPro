/**
 * Contacts module API facade (LAN / PostgreSQL backend).
 * Prefer this over direct SQLite when `isLocalOnlyMode()` is false.
 *
 * Implementation: {@link ContactsApiRepository} → GET/POST/PUT/DELETE `/api/contacts`.
 */
import { ContactsApiRepository } from './repositories/contactsApi';
import type { Contact } from '../../types';

const repo = new ContactsApiRepository();

export const contactsModuleApi = {
  getAll: (): Promise<Contact[]> => repo.findAll(),
  getById: (id: string): Promise<Contact | null> => repo.findById(id),
  create: (contact: Partial<Contact>): Promise<Contact> => repo.create(contact),
  update: (id: string, contact: Partial<Contact>): Promise<Contact> => repo.update(id, contact),
  delete: (id: string): Promise<void> => repo.delete(id),
};
