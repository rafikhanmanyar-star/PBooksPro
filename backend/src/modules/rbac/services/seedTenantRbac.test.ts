import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSystemRoleSeedPermissionKeys,
  SYSTEM_ROLE_DEFINITIONS,
  SOD_HELPER_ROLE_TEMPLATES,
  getRoleTemplateById,
} from '../../../auth/roleTemplates.js';
import { findSodViolation } from './rbacSodService.js';

describe('seedTenantRbac seed data', () => {
  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    if (def.usesFullCatalog) continue;
    it(`system role ${def.slug} has no SoD violations in seed permissions`, () => {
      const keys = getSystemRoleSeedPermissionKeys(def.slug);
      assert.ok(keys.length > 0, `${def.slug} should have seed permissions`);
      const violation = findSodViolation(new Set(keys), def.slug);
      assert.equal(violation, null);
    });
  }

  it('company_admin seed excludes payroll.runs.approve (SoD split)', () => {
    const keys = getSystemRoleSeedPermissionKeys('company_admin');
    assert.equal(keys.includes('payroll.runs.approve'), false);
    assert.equal(keys.includes('payroll.runs.create'), true);
  });

  for (const slug of SOD_HELPER_ROLE_TEMPLATES) {
    it(`SoD helper template ${slug} has no violations`, () => {
      const template = getRoleTemplateById(slug);
      assert.ok(template);
      const violation = findSodViolation(new Set(template!.permissionKeys), slug);
      assert.equal(violation, null);
    });
  }
});
