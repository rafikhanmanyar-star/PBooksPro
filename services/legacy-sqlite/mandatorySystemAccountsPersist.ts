import type { Account } from '../../types';
import type { AccountsRepository } from './repositories/index';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart';
import { MANDATORY_SYSTEM_ACCOUNTS } from '../../constants/mandatorySystemAccounts';

export function ensureMandatorySystemAccountsPersisted(
  accountsRepo: AccountsRepository,
  existing: Account[]
): void {
  const have = new Set(existing.map((a) => a.id));
  for (const acc of MANDATORY_SYSTEM_ACCOUNTS) {
    if (have.has(acc.id)) continue;
    try {
      accountsRepo.insert({
        id: acc.id,
        tenantId: GLOBAL_SYSTEM_TENANT_ID,
        name: acc.name,
        type: acc.type,
        balance: 0,
        description: acc.description,
        isPermanent: true,
      } as Partial<Account>);
      have.add(acc.id);
    } catch (e) {
      console.warn(`[mandatorySystemAccounts] Could not insert ${acc.id}:`, e);
    }
  }
}
