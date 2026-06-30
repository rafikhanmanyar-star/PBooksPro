import type { AgreementSettings, ProjectAgreement } from '../types';

export function buildNextProjectAgreementNumber(
  projectAgreements: ProjectAgreement[],
  settings?: AgreementSettings | null
): string {
  const agreementSettings = settings || { prefix: 'P-AGR-', nextNumber: 1, padding: 4 };
  const prefix = agreementSettings.prefix || 'P-AGR-';
  let maxNum = agreementSettings.nextNumber || 1;
  projectAgreements.forEach((agr) => {
    if (agr.agreementNumber && agr.agreementNumber.startsWith(prefix)) {
      const numPart = parseInt(agr.agreementNumber.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart >= maxNum) maxNum = numPart + 1;
    }
  });
  return `${prefix}${String(maxNum).padStart(agreementSettings.padding ?? 4, '0')}`;
}

export function bumpProjectAgreementSettingsNextNumber(
  settings: AgreementSettings,
  usedAgreementNumber: string
): AgreementSettings {
  const prefix = settings.prefix || 'P-AGR-';
  if (!usedAgreementNumber.startsWith(prefix)) return settings;
  const numPart = parseInt(usedAgreementNumber.slice(prefix.length), 10);
  if (isNaN(numPart) || numPart < (settings.nextNumber || 1)) return settings;
  return { ...settings, nextNumber: numPart + 1 };
}
