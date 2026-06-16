import { useEffect, useRef } from 'react';
import { useDispatchOnly, useContacts, useProjects, useUnits } from './useSelectiveState';
import { usePermissions } from './usePermissions';
import { getAppStateApiService } from '../services/api/appStateApi';
import type { AppAction } from '../types';

/**
 * Ensures projects, units, and contacts are loaded for sales / marketing workflows.
 * Refetches from the API when local state is empty (e.g. after upgrade or partial sync).
 */
export function useProjectSellingCatalogBootstrap(): void {
  const dispatch = useDispatchOnly();
  const projects = useProjects();
  const units = useUnits();
  const contacts = useContacts();
  const { canReadProjectSellingCatalog } = usePermissions();
  const bootstrapStarted = useRef(false);

  useEffect(() => {
    if (!canReadProjectSellingCatalog) return;
    if (bootstrapStarted.current) return;
    const needsCatalog =
      (projects?.length ?? 0) === 0 || (units?.length ?? 0) === 0 || (contacts?.length ?? 0) === 0;
    if (!needsCatalog) return;

    bootstrapStarted.current = true;
    void (async () => {
      try {
        const partial = await getAppStateApiService().loadStateBulk(
          'projects,units,contacts,categories,planAmenities'
        );
        if (
          (partial.projects?.length ?? 0) > 0 ||
          (partial.units?.length ?? 0) > 0 ||
          (partial.contacts?.length ?? 0) > 0 ||
          (partial.categories?.length ?? 0) > 0 ||
          (partial.planAmenities?.length ?? 0) > 0
        ) {
          dispatch({
            type: 'SET_STATE',
            payload: partial,
            _isRemote: true,
          } as AppAction);
        }
      } catch {
        bootstrapStarted.current = false;
      }
    })();
  }, [
    canReadProjectSellingCatalog,
    projects?.length,
    units?.length,
    contacts?.length,
    dispatch,
  ]);
}
