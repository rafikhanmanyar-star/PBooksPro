import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortalUsage,
  mapSubscriptionToPaymentStatus,
  paymentStatusLabel,
} from './billingPortalService.js';
import type { UsageStatus } from './subscriptionUsageService.js';

describe('billingPortalService', () => {
  it('maps subscription status to payment status', () => {
    assert.equal(mapSubscriptionToPaymentStatus('active'), 'valid');
    assert.equal(mapSubscriptionToPaymentStatus('trialing'), 'trialing');
    assert.equal(mapSubscriptionToPaymentStatus('past_due'), 'past_due');
    assert.equal(mapSubscriptionToPaymentStatus('canceled'), 'canceled');
  });

  it('returns human-readable payment labels', () => {
    assert.equal(paymentStatusLabel('valid'), 'Paid & current');
    assert.equal(paymentStatusLabel('past_due'), 'Payment past due');
  });

  it('builds portal usage with percentages', () => {
    const usage: UsageStatus = {
      current: { usersCount: 2, projectsCount: 3, storageBytes: 0, storageGb: 1.5 },
      limits: { maxUsers: 3, maxProjects: 5, maxStorageGb: 10 },
      withinLimits: true,
      violations: [],
    };
    const portal = buildPortalUsage(usage);
    assert.equal(portal.usersCount, 2);
    assert.equal(portal.projectsCount, 3);
    assert.equal(portal.usersPercent, 67);
    assert.equal(portal.projectsPercent, 60);
    assert.equal(portal.withinLimits, true);
  });

  it('handles unlimited plan limits', () => {
    const usage: UsageStatus = {
      current: { usersCount: 100, projectsCount: 200, storageBytes: 0, storageGb: 50 },
      limits: { maxUsers: -1, maxProjects: -1, maxStorageGb: 500 },
      withinLimits: true,
      violations: [],
    };
    const portal = buildPortalUsage(usage);
    assert.equal(portal.usersPercent, 0);
    assert.equal(portal.projectsPercent, 0);
  });
});
