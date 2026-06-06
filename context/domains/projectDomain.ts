/**
 * Project domain — projects, agreements, contracts, budgets, PM allocations.
 */
import { useMemo } from 'react';
import { useProjects, useDispatchOnly, useStateSelector } from '../../hooks/useSelectiveState';

export function useProjectDomain() {
  const projects = useProjects();
  const projectAgreements = useStateSelector((s) => s.projectAgreements);
  const contracts = useStateSelector((s) => s.contracts);
  const budgets = useStateSelector((s) => s.budgets);
  const pmCycleAllocations = useStateSelector((s) => s.pmCycleAllocations);
  const projectInvoiceSettings = useStateSelector((s) => s.projectInvoiceSettings);
  const dispatch = useDispatchOnly();

  return useMemo(
    () => ({
      projects,
      projectAgreements,
      contracts,
      budgets,
      pmCycleAllocations,
      projectInvoiceSettings,
      dispatch,
    }),
    [
      projects,
      projectAgreements,
      contracts,
      budgets,
      pmCycleAllocations,
      projectInvoiceSettings,
      dispatch,
    ]
  );
}
