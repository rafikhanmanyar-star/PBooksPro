/**
 * Run: npx tsx tests/elementToPdf.test.ts
 */
import { resolvePdfCaptureTarget } from '../utils/elementToPdf';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

{
  const scrollContainer = { id: 'scroll-container' } as HTMLElement;
  const root = {
    id: 'report-root',
    querySelector: (selector: string) => (selector === '[data-print-scroll-container]' ? scrollContainer : null),
  } as unknown as HTMLElement;

  const captureTarget = resolvePdfCaptureTarget(root);

  assert(captureTarget === root, 'PDF capture should include report header siblings outside the scroll container');
}

console.log('elementToPdf.test.ts: OK');
