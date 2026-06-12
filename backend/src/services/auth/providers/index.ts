import type { Pool, PoolClient } from 'pg';
import { EmailPasswordProvider } from './EmailPasswordProvider.js';
import type { AuthCredentials, AuthProvider, AuthProviderId } from './types.js';
import type { MatchedUserAccount } from '../userTenantService.js';

const emailPasswordProvider = new EmailPasswordProvider();

const providers: Record<AuthProviderId, AuthProvider | undefined> = {
  email_password: emailPasswordProvider,
  google: undefined,
  microsoft: undefined,
};

export function getAuthProvider(id: AuthProviderId): AuthProvider {
  const provider = providers[id];
  if (!provider) {
    throw new Error(`Auth provider "${id}" is not implemented yet`);
  }
  return provider;
}

export async function authenticateWithProvider(
  db: Pool | PoolClient,
  providerId: AuthProviderId,
  credentials: AuthCredentials
): Promise<MatchedUserAccount[]> {
  const provider = getAuthProvider(providerId);
  return provider.authenticate({ db }, credentials);
}

export { EmailPasswordProvider };
export type { AuthCredentials, AuthProvider, AuthProviderId };
