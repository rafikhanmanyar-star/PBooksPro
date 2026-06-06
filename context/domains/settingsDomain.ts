/**
 * Settings / UI domain — print templates, navigation, current user, feature flags.
 */
import { useMemo } from 'react';
import { useDispatchOnly, useStateSelector } from '../../hooks/useSelectiveState';

export function useSettingsDomain() {
  const currentUser = useStateSelector((s) => s.currentUser);
  const users = useStateSelector((s) => s.users);
  const printSettings = useStateSelector((s) => s.printSettings);
  const whatsAppTemplates = useStateSelector((s) => s.whatsAppTemplates);
  const invoiceHtmlTemplate = useStateSelector((s) => s.invoiceHtmlTemplate);
  const currentPage = useStateSelector((s) => s.currentPage);
  const enableColorCoding = useStateSelector((s) => s.enableColorCoding);
  const enableBeepOnSave = useStateSelector((s) => s.enableBeepOnSave);
  const dispatch = useDispatchOnly();

  return useMemo(
    () => ({
      currentUser,
      users,
      printSettings,
      whatsAppTemplates,
      invoiceHtmlTemplate,
      currentPage,
      enableColorCoding,
      enableBeepOnSave,
      dispatch,
    }),
    [
      currentUser,
      users,
      printSettings,
      whatsAppTemplates,
      invoiceHtmlTemplate,
      currentPage,
      enableColorCoding,
      enableBeepOnSave,
      dispatch,
    ]
  );
}
