import type { Category } from '../../types';
import type { CategoriesRepository } from './repositories/index';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart';
import { MANDATORY_SYSTEM_CATEGORIES } from '../../constants/mandatorySystemCategories';

export function ensureMandatorySystemCategoriesPersisted(
  categoriesRepo: CategoriesRepository,
  existing: Category[]
): void {
  const have = new Set(existing.map((c) => c.id));
  for (const cat of MANDATORY_SYSTEM_CATEGORIES) {
    if (have.has(cat.id)) continue;
    try {
      categoriesRepo.insert({
        id: cat.id,
        tenantId: GLOBAL_SYSTEM_TENANT_ID,
        name: cat.name,
        type: cat.type,
        isPermanent: true,
        isRental: cat.isRental ?? false,
        isHidden: cat.isHidden ?? false,
      } as Partial<Category>);
      have.add(cat.id);
    } catch (e) {
      console.warn(`[mandatorySystemCategories] Could not insert ${cat.id}:`, e);
    }
  }
}
