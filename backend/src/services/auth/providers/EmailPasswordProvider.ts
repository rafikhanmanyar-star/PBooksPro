import {
  findAccountsByLoginIdentifier,
  filterAccountsByPassword,
} from '../userTenantService.js';
import type { AuthProvider, AuthProviderContext, AuthCredentials } from './types.js';

/**
 * Primary credential provider — email + password.
 * Login identifier is normalized email (username fallback removed after migration 116).
 */
export class EmailPasswordProvider implements AuthProvider {
  readonly id = 'email_password' as const;

  async authenticate(ctx: AuthProviderContext, credentials: AuthCredentials) {
    if (credentials.provider !== 'email_password') return [];
    const email = credentials.email.trim().toLowerCase();
    if (!email || !credentials.password) return [];

    const accounts = await findAccountsByLoginIdentifier(ctx.db, email);
    return filterAccountsByPassword(accounts, credentials.password);
  }
}
