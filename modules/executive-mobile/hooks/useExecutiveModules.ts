import { useMemo } from 'react';
import { useLicense } from '../../../context/LicenseContext';
import { isLocalOnlyMode } from '../../../config/apiUrl';
import {
  EXECUTIVE_ACCORDION_SECTIONS,
  EXECUTIVE_MODULE_NAV,
  type ExecutiveNavItem,
} from '../constants/moduleNav';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';

function isModuleLicensed(item: ExecutiveNavItem, hasModule: (key: string) => boolean): boolean {
  if (!item.licenseKey) return true;
  if (isLocalOnlyMode()) return true;
  return hasModule(item.licenseKey);
}

function isVisibleInExecutiveApp(item: ExecutiveNavItem, hasModule: (key: string) => boolean): boolean {
  if (!item.showInExecutiveApp) return false;
  return isModuleLicensed(item, hasModule);
}

export function useExecutiveModules() {
  const { hasModule } = useLicense();

  const visibleModules = useMemo(
    () =>
      EXECUTIVE_MODULE_NAV.filter(
        (m) =>
          isVisibleInExecutiveApp(m, hasModule) &&
          m.id !== 'quickTransaction' &&
          m.id !== 'notifications' &&
          m.id !== 'approvals' &&
          m.summaryKey
      ),
    [hasModule]
  );

  const accordionSections = useMemo(
    () =>
      EXECUTIVE_ACCORDION_SECTIONS.filter((section) => {
        const nav = EXECUTIVE_MODULE_NAV.find((m) => m.id === section.moduleId);
        if (!nav) return false;
        return isVisibleInExecutiveApp(nav, hasModule);
      }),
    [hasModule]
  );

  const isModuleVisible = (moduleId: ExecutiveModuleId | string) => {
    const nav = EXECUTIVE_MODULE_NAV.find((m) => m.id === moduleId);
    if (!nav) return false;
    return isVisibleInExecutiveApp(nav, hasModule);
  };

  return { visibleModules, accordionSections, isModuleVisible, hasModule };
}
