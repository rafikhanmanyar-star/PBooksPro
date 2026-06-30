import assert from 'node:assert';
import {
  buildNextProjectAgreementNumber,
  bumpProjectAgreementSettingsNextNumber,
} from '../utils/projectAgreementNumber';
import type { ProjectAgreement } from '../types';

const settings = { prefix: 'P-AGR-', nextNumber: 3, padding: 4 };

assert.equal(buildNextProjectAgreementNumber([], settings), 'P-AGR-0003');

const agreements = [
  { agreementNumber: 'P-AGR-0007' },
  { agreementNumber: 'P-AGR-0010' },
] as ProjectAgreement[];
assert.equal(buildNextProjectAgreementNumber(agreements, settings), 'P-AGR-0011');

const oldPrefixAgreements = [{ agreementNumber: 'OLD-0099' }] as ProjectAgreement[];
assert.equal(buildNextProjectAgreementNumber(oldPrefixAgreements, settings), 'P-AGR-0003');

assert.deepEqual(bumpProjectAgreementSettingsNextNumber(settings, 'P-AGR-0007'), {
  prefix: 'P-AGR-',
  nextNumber: 8,
  padding: 4,
});

const highNextSettings = { prefix: 'P-AGR-', nextNumber: 10, padding: 4 };
assert.deepEqual(
  bumpProjectAgreementSettingsNextNumber(highNextSettings, 'P-AGR-0003'),
  highNextSettings
);

console.log('projectAgreementNumber.test.ts OK');
