import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapLicenseTypeToBillingCycle,
  mapLicenseTypeToPlanCode,
  resolvePlanPrice,
} from './paddleBillingService.js';
import { isUnlimited, planModules } from './billingPlanService.js';
import type { BillingPlanRow } from './billingPlanService.js';

describe('paddleBillingService plan mapping', () => {
  it('maps yearly full license to enterprise annual', () => {
    assert.equal(mapLicenseTypeToPlanCode('yearly'), 'enterprise');
    assert.equal(mapLicenseTypeToBillingCycle('yearly'), 'annual');
  });

  it('maps monthly full license to professional monthly', () => {
    assert.equal(mapLicenseTypeToPlanCode('monthly'), 'professional');
    assert.equal(mapLicenseTypeToBillingCycle('monthly'), 'monthly');
  });

  it('maps module payments to starter', () => {
    assert.equal(mapLicenseTypeToPlanCode('monthly', 'rental'), 'starter');
    assert.equal(mapLicenseTypeToPlanCode('yearly', 'real_estate'), 'starter');
  });
});

describe('billingPlanService helpers', () => {
  const plan: BillingPlanRow = {
    id: 'p1',
    plan_code: 'professional',
    name: 'Pro',
    description: '',
    monthly_price: '71.00',
    annual_price: '708.00',
    max_users: 50,
    max_projects: 100,
    max_storage_gb: 100,
    features_json: { modules: ['real_estate', 'rental'] },
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  it('extracts modules from plan features_json', () => {
    assert.deepEqual(planModules(plan), ['real_estate', 'rental']);
  });

  it('resolves plan prices', () => {
    assert.equal(resolvePlanPrice(plan, 'monthly'), 71);
    assert.equal(resolvePlanPrice(plan, 'annual'), 708);
  });

  it('detects unlimited limits', () => {
    assert.equal(isUnlimited(-1), true);
    assert.equal(isUnlimited(10), false);
  });
});
