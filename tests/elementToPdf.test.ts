import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveElementToPdfCapturePlan } from '../utils/elementToPdf';

test('PDF capture uses the report root when a scroll container is nested inside it', () => {
  const scrollContainer = { id: 'scroll' };
  const root = {
    id: 'root',
    querySelectorAll: (selector: string) => (selector === '[data-print-scroll-container]' ? [scrollContainer] : []),
  };

  const plan = resolveElementToPdfCapturePlan(root as unknown as HTMLElement);

  assert.equal(plan.captureEl, root);
  assert.deepEqual(plan.scrollContainers, [scrollContainer]);
});
