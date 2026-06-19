import { usePageActive } from '../context/PageActiveContext';

/**
 * Returns whether React Query hooks in the current page scope should run.
 * Outside `PageActiveScope` (Header, Sidebar, etc.) always returns true.
 */
export function usePageQueryEnabled(): boolean {
  const { isActive, gateEnabled, pageGroup } = usePageActive();
  if (!gateEnabled || pageGroup === null) return true;
  return isActive;
}
