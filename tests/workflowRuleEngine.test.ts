import { describe, expect, it } from 'vitest';
import { evaluateWorkflowRules } from '../shared/workflow/ruleEngine';
import { DEFAULT_WORKFLOW_CONFIG } from '../shared/workflow/workflowTypes';

describe('evaluateWorkflowRules', () => {
  it('defaults to level 1 when no rules match', () => {
    const result = evaluateWorkflowRules(DEFAULT_WORKFLOW_CONFIG, {
      entityType: 'purchase_order',
      amount: 5000,
    });
    expect(result.maxLevel).toBe(1);
    expect(result.matchedRuleIds).toEqual([]);
  });

  it('uses highest matching rule level capped by config', () => {
    const result = evaluateWorkflowRules(
      {
        levels: 2,
        rules: [
          { id: 'a', type: 'amount', level: 1, minAmount: 0, maxAmount: 10000 },
          { id: 'b', type: 'amount', level: 3, minAmount: 10001 },
        ],
      },
      { entityType: 'purchase_order', amount: 50000 }
    );
    expect(result.maxLevel).toBe(2);
    expect(result.matchedRuleIds).toContain('b');
  });

  it('matches entity-based rules', () => {
    const result = evaluateWorkflowRules(
      {
        levels: 3,
        rules: [{ id: 'c', type: 'entity', level: 2, entityType: 'contract' }],
      },
      { entityType: 'contract', amount: 0 }
    );
    expect(result.maxLevel).toBe(2);
  });
});
