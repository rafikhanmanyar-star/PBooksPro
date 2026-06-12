import type { Pool, PoolClient } from 'pg';
import type { MatchedUserAccount } from '../userTenantService.js';

export type EmailPasswordCredentials = {
  provider: 'email_password';
  email: string;
  password: string;
};

export type AuthCredentials = EmailPasswordCredentials;

export type AuthProviderContext = {
  db: Pool | PoolClient;
};

export interface AuthProvider {
  readonly id: string;
  authenticate(
    ctx: AuthProviderContext,
    credentials: AuthCredentials
  ): Promise<MatchedUserAccount[]>;
}

/** Future: GoogleProvider, MicrosoftProvider — register in providers/index.ts */
export type AuthProviderId = 'email_password' | 'google' | 'microsoft';
