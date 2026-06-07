import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateUsageAgainstPlan, type UsageSnapshot } from './subscriptionUsageService.js';
import type { BillingPlanRow } from './billingPlanService.js';

const starterPlan: BillingPlanRow = {
  id: 'p1',
  plan_code: 'starter',
  name: 'Starter',
  description: '',
  monthly_price: '24',
  annual_price: '240',
  max_users: 3,
  max_projects: 5,
  max_storage_gb: 25,
  features_json: {},
  is_active: true,
  created_at: '',
  updated_at: '',
};

const professionalPlan: BillingPlanRow = {
  ...starterPlan,
  id: 'p2',
  plan_code: 'professional',
  name: 'Professional',
  max_users: 10,
  max_projects: 50,
};

const businessPlan: BillingPlanRow = {
  ...starterPlan,
  id: 'p3',
  plan_code: 'business',
  name: 'Business',
  max_users: -1,
  max_projects: -1,
};

describe('license enforcement quotas', () => {
  it('starter allows up to 3 users and 5 projects', () => {
    const ok: UsageSnapshot = { usersCount: 3, projectsCount: 5, storageBytes: 0, storageGb: 0 };
    const atLimit = evaluateUsageAgainstPlan(ok, starterPlan);
    assert.equal(atLimit.withinLimits, true);

    const over: UsageSnapshot = { usersCount: 4, projectsCount: 5, storageBytes: 0, storageGb: 0 };
    const blocked = evaluateUsageAgainstPlan(over, starterPlan);
    assert.equal(blocked.withinLimits, false);
    assert.match(blocked.violations.join(' '), /Users/);
  });

  it('professional allows up to 10 users and 50 projects', () => {
    const ok: UsageSnapshot = { usersCount: 10, projectsCount: 50, storageBytes: 0, storageGb: 0 };
    assert.equal(evaluateUsageAgainstPlan(ok, professionalPlan).withinLimits, true);

    const over: UsageSnapshot = { usersCount: 10, projectsCount: 51, storageBytes: 0, storageGb: 0 };
    assert.equal(evaluateUsageAgainstPlan(over, professionalPlan).withinLimits, false);
  });

  it('business plan has unlimited users and projects', () => {
    const heavy: UsageSnapshot = { usersCount: 500, projectsCount: 1000, storageBytes: 0, storageGb: 0 };
    assert.equal(evaluateUsageAgainstPlan(heavy, businessPlan).withinLimits, true);
  });
});
