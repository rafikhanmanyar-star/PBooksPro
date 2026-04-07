/**
 * Refresh personal categories + transactions in AppState from the API (PostgreSQL).
 */

import { _getAppDispatch, _getAppState } from '../../context/AppContext';
import { PersonalCategoriesApiRepository } from '../../services/api/repositories/personalCategoriesApi';
import { PersonalTransactionsApiRepository } from '../../services/api/repositories/personalTransactionsApi';

export async function refreshPersonalStateFromApi(): Promise<void> {
  const [cats, txs] = await Promise.all([
    new PersonalCategoriesApiRepository().findAll(),
    new PersonalTransactionsApiRepository().findAll(),
  ]);
  const d = _getAppDispatch();
  const s = _getAppState();
  d({
    type: 'SET_STATE',
    payload: {
      ...s,
      personalCategories: cats.filter((c) => !c.deletedAt),
      personalTransactions: txs.filter((t) => !t.deletedAt),
    },
  });
}
