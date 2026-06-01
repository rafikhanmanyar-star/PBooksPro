import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePdfCanvasSize, resolvePdfCaptureTargets } from '../utils/elementToPdf';

type FakeElement = {
  name: string;
  children: FakeElement[];
  querySelector: (selector: string) => FakeElement | null;
  contains: (child: FakeElement) => boolean;
};

function fakeElement(name: string, children: FakeElement[] = []): FakeElement {
  const element: FakeElement = {
    name,
    children,
    querySelector(selector: string): FakeElement | null {
      if (selector !== '[data-print-scroll-container]') return null;
      if (element.name === 'scroll') return element;
      for (const child of element.children) {
        const match = child.querySelector(selector);
        if (match) return match;
      }
      return null;
    },
    contains(child: FakeElement): boolean {
      return element === child || element.children.some((descendant) => descendant.contains(child));
    },
  };
  return element;
}

test('PDF capture includes root-level print header outside the scroll container', () => {
  const header = fakeElement('print-header');
  const scroll = fakeElement('scroll');
  const root = fakeElement('root', [header, scroll]);

  const targets = resolvePdfCaptureTargets(root as unknown as HTMLElement);

  assert.strictEqual(targets.captureEl, root);
  assert.strictEqual(targets.scrollEl, scroll);
});

test('PDF capture keeps scroll container target when it is the only printable content', () => {
  const scroll = fakeElement('scroll');
  const root = fakeElement('root', [scroll]);

  const targets = resolvePdfCaptureTargets(root as unknown as HTMLElement);

  assert.strictEqual(targets.captureEl, scroll);
  assert.strictEqual(targets.scrollEl, scroll);
});

test('PDF canvas sizing uses full scroll height for expanded long reports', () => {
  const captureEl = {
    scrollHeight: 2400,
    offsetHeight: 600,
    getBoundingClientRect: () => ({ height: 600 }),
  };

  const size = resolvePdfCanvasSize(captureEl as unknown as HTMLElement, 1062);

  assert.deepStrictEqual(size, {
    width: 1062,
    height: 2400,
    windowWidth: 1062,
    windowHeight: 2400,
  });
});
