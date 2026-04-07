/**
 * Optional offline auto-correct for common typos (renderer layer).
 * Runs on Space and on blur; uses a small static map (no network).
 */

export const COMMON_TYPOS: Record<string, string> = {
  teh: 'the',
  recieve: 'receive',
  accomodate: 'accommodate',
  occured: 'occurred',
  seperate: 'separate',
  definately: 'definitely',
  wierd: 'weird',
  acheive: 'achieve',
  adress: 'address',
  begining: 'beginning',
  enviroment: 'environment',
  publically: 'publicly',
  untill: 'until',
};

function applyCase(original: string, corrected: string): string {
  if (original.length === 0) return corrected;
  if (original === original.toUpperCase()) return corrected.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return corrected[0].toUpperCase() + corrected.slice(1).toLowerCase();
  }
  return corrected;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
}

function isSpellcheckEligibleInput(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  const t = el.type || 'text';
  return !['number', 'email', 'password', 'tel', 'url'].includes(t);
}

/**
 * Replace trailing word before caret if it matches COMMON_TYPOS.
 * @param appendSpace when true (Space key), append a space after the corrected word.
 */
function tryCorrectTrailingWord(
  el: HTMLInputElement | HTMLTextAreaElement,
  word: string,
  appendSpace: boolean
): boolean {
  const lower = word.toLowerCase();
  const correction = COMMON_TYPOS[lower];
  if (!correction) return false;

  const before = el.value.slice(0, el.selectionStart ?? 0);
  const after = el.value.slice(el.selectionEnd ?? 0);
  const lastWordMatch = before.match(/(\S+)$/);
  if (!lastWordMatch || lastWordMatch[1] !== word) return false;

  const newWord = applyCase(word, correction);
  const newBefore = before.slice(0, -word.length) + newWord + (appendSpace ? ' ' : '');
  const newValue = newBefore + after;
  const newPos = newBefore.length;
  setNativeValue(el, newValue);
  el.setSelectionRange(newPos, newPos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== ' ') return;
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) return;
  if (!isSpellcheckEligibleInput(t)) return;

  const before = t.value.slice(0, t.selectionStart ?? 0);
  const m = before.match(/(\S+)$/);
  if (!m) return;
  if (tryCorrectTrailingWord(t, m[1], true)) {
    e.preventDefault();
  }
}

function onFocusOut(e: FocusEvent) {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) return;
  if (!isSpellcheckEligibleInput(t)) return;

  const val = t.value;
  const m = val.match(/(\S+)$/);
  if (!m) return;
  tryCorrectTrailingWord(t, m[1], false);
}

/** Attach capture-phase listeners; returns cleanup. */
export function installAutocorrect(): () => void {
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusout', onFocusOut, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('focusout', onFocusOut, true);
  };
}
