import type { AppState } from '../types';
import { ContactType } from '../types';

/** Resolve the vendor directory id used on quotations for a bill's vendor/contact selection. */
export function resolveBillVendorId(
  vendorId: string | undefined,
  contactId: string | undefined,
  state: Pick<AppState, 'vendors' | 'contacts'>
): string {
  const v = (vendorId ?? '').trim();
  if (v) return v;

  const c = (contactId ?? '').trim();
  if (!c) return '';

  if (state.vendors?.some((x) => x.id === c)) return c;

  const contact = state.contacts?.find((x) => x.id === c);
  if (contact) {
    const byName = state.vendors?.find(
      (x) => x.name.trim().toLowerCase() === contact.name.trim().toLowerCase()
    );
    if (byName) return byName.id;
    if (contact.type === ContactType.VENDOR) return c;
  }

  return c;
}

/** All vendor ids that may own quotations for this bill party (id + name aliases). */
export function resolveQuotationVendorIds(
  vendorId: string | undefined,
  contactId: string | undefined,
  state: Pick<AppState, 'vendors' | 'contacts'>
): string[] {
  const primary = resolveBillVendorId(vendorId, contactId, state);
  const ids = new Set<string>();
  if (primary) ids.add(primary);
  if (vendorId?.trim()) ids.add(vendorId.trim());
  if (contactId?.trim()) ids.add(contactId.trim());

  const vendor = state.vendors?.find((v) => v.id === primary || v.id === vendorId);
  if (vendor) {
    for (const qVendor of state.vendors ?? []) {
      if (qVendor.name.trim().toLowerCase() === vendor.name.trim().toLowerCase()) {
        ids.add(qVendor.id);
      }
    }
    const contact = state.contacts?.find(
      (c) => c.name.trim().toLowerCase() === vendor.name.trim().toLowerCase()
    );
    if (contact) ids.add(contact.id);
  }

  return [...ids];
}
