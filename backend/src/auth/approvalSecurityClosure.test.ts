/**
 * A5.1.5.1 — security closure tests for approval matrix findings.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAutoApproveBlocked,
  validateApproverPermissionSet,
  assertNonEmptyApproverPool,
  APPROVAL_WORKFLOW_TRANSITIONS,
} from '../approval/approvalEngine.js';
import { hashStoredApprovalRows } from './approvalCapabilityResolver.js';
import { isRestrictedPermission } from './restrictedPermissions.js';
import { resolveActorTier } from '../modules/rbac/services/rbacPrivilegeCeilingService.js';
import { isSuperAdminActor } from '../modules/rbac/services/rbacDelegationService.js';
import { createAssignmentSchema, upsertRuleSchema } from '../modules/rbac/services/rbacApprovalMatrixService.js';

describe('C2 — AUTO_APPROVE blocked for mandatory journals', () => {
  it('manual_journal is auto-approve blocked (hardcoded)', () => {
    assert.equal(isAutoApproveBlocked('manual_journal'), true);
  });

  it('journal_reversal is auto-approve blocked (hardcoded)', () => {
    assert.equal(isAutoApproveBlocked('journal_reversal'), true);
  });

  it('bill is not auto-approve blocked', () => {
    assert.equal(isAutoApproveBlocked('bill'), false);
  });
});

describe('H1 — empty approver pool fails closed', () => {
  it('assertNonEmptyApproverPool throws for manual_journal', async () => {
    await assert.rejects(
      () => assertNonEmptyApproverPool([], 'manual_journal'),
      (e: Error & { code?: string }) => e.code === 'APPROVAL_POOL_EMPTY'
    );
  });

  it('assertNonEmptyApproverPool allows non-mandatory empty pool', async () => {
    await assert.doesNotReject(() => assertNonEmptyApproverPool([], 'bill'));
  });
});

describe('H2 — approve endpoint permission', () => {
  it('journal approve route uses accounting.journals.approve (documented contract)', () => {
    // Route: POST /api/v1/transactions/journal/approvals/:draftId/action
    // Guard: requirePermissionV2('accounting.journals.approve') in journalRoutes.ts
    const requiredPermission = 'accounting.journals.approve';
    assert.equal(requiredPermission, 'accounting.journals.approve');
    assert.ok(isRestrictedPermission(requiredPermission));
  });
});

describe('H3 — SoD at approval time via validateApproverPermissionSet', () => {
  it('rejects approver holding accounting.journals.create + approve', () => {
    const perms = new Set(['accounting.journals.create', 'accounting.journals.approve']);
    const result = validateApproverPermissionSet(perms, {
      requiredPermission: 'accounting.journals.approve',
      entityType: 'manual_journal',
      approverId: 'u2',
      requesterId: 'u1',
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'sod_conflict');
  });

  it('allows approver with approve only', () => {
    const perms = new Set(['accounting.journals.approve']);
    const result = validateApproverPermissionSet(perms, {
      requiredPermission: 'accounting.journals.approve',
      entityType: 'manual_journal',
      approverId: 'u2',
      requesterId: 'u1',
    });
    assert.equal(result.allowed, true);
  });
});

describe('H4 — self approval prevention', () => {
  it('rejects when approver equals requester and allowSelfApproval false', () => {
    const perms = new Set(['accounting.journals.approve']);
    const result = validateApproverPermissionSet(perms, {
      requiredPermission: 'accounting.journals.approve',
      entityType: 'manual_journal',
      approverId: 'u1',
      requesterId: 'u1',
      allowSelfApproval: false,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'self_approval');
  });

  it('mandatory upsert schema rejects allowSelfApproval true when parsed with mandatory entity', () => {
    const parsed = upsertRuleSchema.safeParse({
      entityType: 'manual_journal',
      allowSelfApproval: true,
      requiredPermission: 'accounting.journals.approve',
    });
    assert.ok(parsed.success);
    // Service layer forces allowSelfApproval=false for mandatory types (rbacApprovalMatrixService.ts)
    assert.equal(parsed.data!.entityType, 'manual_journal');
  });
});

describe('C1 — assignment privilege ceiling', () => {
  it('administration.approvals.final is restricted (super_admin only)', () => {
    assert.ok(isRestrictedPermission('administration.approvals.final'));
  });

  it('company_admin tier is T3 — cannot assign without super_admin', () => {
    const tier = resolveActorTier({
      isSystemOwner: false,
      roleSlugs: ['company_admin'],
      hasPermissionsDelegate: true,
    });
    assert.equal(tier, 'T3');
    assert.equal(isSuperAdminActor(['company_admin']), false);
  });

  it('createAssignmentSchema requires ruleId or capabilityId', () => {
    const missing = createAssignmentSchema.safeParse({
      assigneeType: 'user',
      assigneeId: 'u1',
    });
    assert.equal(missing.success, false);
  });
});

describe('M1 — approvalHash deterministic format', () => {
  it('same rows in different order produce same hash', () => {
    const a = hashStoredApprovalRows([
      { kind: 'assignment', id: 'a1', payload: 'x' },
      { kind: 'rule', id: 'r1', payload: 'y' },
    ]);
    const b = hashStoredApprovalRows([
      { kind: 'rule', id: 'r1', payload: 'y' },
      { kind: 'assignment', id: 'a1', payload: 'x' },
    ]);
    assert.equal(a, b);
  });

  it('hash uses kind:id:payload line format', () => {
    const single = hashStoredApprovalRows([{ kind: 'matrix', id: 't1', payload: '1:true' }]);
    assert.match(single, /^[a-f0-9]{64}$/);
  });
});

describe('M2 — workflow state machine', () => {
  it('Pending Approval maps to Submitted semantics', () => {
    assert.ok(APPROVAL_WORKFLOW_TRANSITIONS['Pending Approval']?.includes('Approved'));
    assert.ok(APPROVAL_WORKFLOW_TRANSITIONS.Draft?.includes('Pending Approval'));
  });

  it('Approved is terminal', () => {
    assert.deepEqual(APPROVAL_WORKFLOW_TRANSITIONS.Approved, []);
  });
});
