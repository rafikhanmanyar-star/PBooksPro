/**
 * PDF capture target regression tests.
 * Run: npx tsx tests/elementToPdf.test.ts
 */
import assert from 'node:assert/strict';
import { resolvePdfCaptureElement } from '../utils/elementToPdf';

function fakeElement(options: {
  scrollContainer?: unknown;
  captureRoot?: boolean;
}): HTMLElement {
  return {
    hasAttribute(name: string) {
      return name === 'data-pdf-capture-root' ? Boolean(options.captureRoot) : false;
    },
    querySelector(selector: string) {
      return selector === '[data-print-scroll-container]' ? options.scrollContainer ?? null : null;
    },
  } as unknown as HTMLElement;
}

{
  const scrollContainer = fakeElement({});
  const root = fakeElement({ scrollContainer });

  assert.equal(
    resolvePdfCaptureElement(root),
    scrollContainer,
    'regular reports should capture the scroll container so overflow rows are included'
  );
}

{
  const scrollContainer = fakeElement({});
  const root = fakeElement({ scrollContainer, captureRoot: true });

  assert.equal(
    resolvePdfCaptureElement(root),
    root,
    'reports with header siblings should be able to capture the full root'
  );
}
