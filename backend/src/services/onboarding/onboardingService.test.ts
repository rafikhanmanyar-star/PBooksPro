import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidOnboardingStep, ONBOARDING_STEP_IDS } from '../../constants/onboardingSteps.js';

describe('onboardingSteps', () => {
  it('defines nine wizard steps ending with completion', () => {
    assert.equal(ONBOARDING_STEP_IDS.length, 9);
    assert.equal(ONBOARDING_STEP_IDS[0], 'welcome');
    assert.equal(ONBOARDING_STEP_IDS[ONBOARDING_STEP_IDS.length - 1], 'completion');
  });

  it('validates step ids', () => {
    assert.equal(isValidOnboardingStep('fiscal_year'), true);
    assert.equal(isValidOnboardingStep('invalid'), false);
  });
});
