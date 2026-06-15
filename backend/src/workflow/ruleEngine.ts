/**
 * AUTO-GENERATED — do not edit. Source: shared/workflow/ruleEngine.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

import type {
  WorkflowConfig,
  WorkflowEvaluationContext,
  WorkflowEvaluationResult,
  WorkflowRule,
} from './workflowTypes.js';

function ruleMatches(rule: WorkflowRule, ctx: WorkflowEvaluationContext): boolean {
  if (rule.enabled === false) return false;

  switch (rule.type) {
    case 'amount': {
      const amount = ctx.amount ?? 0;
      if (rule.minAmount != null && amount < rule.minAmount) return false;
      if (rule.maxAmount != null && amount > rule.maxAmount) return false;
      return true;
    }
    case 'department':
      return !!ctx.departmentId && ctx.departmentId === rule.departmentId;
    case 'project':
      return !!ctx.projectId && ctx.projectId === rule.projectId;
    case 'entity':
      return ctx.entityType === rule.entityType;
    case 'role':
      return !!ctx.requesterRole && ctx.requesterRole === rule.role;
    default:
      return false;
  }
}

/** Evaluate tenant rules and return the highest required approval level (capped by config). */
export function evaluateWorkflowRules(
  config: WorkflowConfig,
  ctx: WorkflowEvaluationContext
): WorkflowEvaluationResult {
  const cap = config.levels;
  let maxLevel: 1 | 2 | 3 = 1;
  const matchedRuleIds: string[] = [];

  for (const rule of config.rules) {
    if (!ruleMatches(rule, ctx)) continue;
    matchedRuleIds.push(rule.id);
    if (rule.level > maxLevel) maxLevel = rule.level;
  }

  if (maxLevel > cap) maxLevel = cap;
  return { maxLevel, matchedRuleIds };
}
