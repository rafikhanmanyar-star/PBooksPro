/**
 * Amount input formatting tests.
 * Run: npm run test:amount-input
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  cursorFromSignificantCount,
  formatAmount,
  formatAmountForInput,
  getCursorPositionAfterFormat,
  parseAmount,
  processAmountInputChange,
  sanitizeAmountInput,
} from '../utils/numberFormatting';

describe('formatAmount', () => {
  test('adds thousand separators', () => {
    assert.equal(formatAmount(1000), '1,000');
    assert.equal(formatAmount(10000), '10,000');
    assert.equal(formatAmount(100000), '100,000');
    assert.equal(formatAmount(1000000), '1,000,000');
    assert.equal(formatAmount(4500000), '4,500,000');
  });

  test('formats decimal values', () => {
    assert.equal(formatAmount(1000.5), '1,000.5');
    assert.equal(formatAmount(1000.5, { decimalPlaces: 2 }), '1,000.5');
    assert.equal(formatAmount(1000.75, { decimalPlaces: 2 }), '1,000.75');
  });

  test('formats negative values', () => {
    assert.equal(formatAmount(-500000), '-500,000');
    assert.equal(formatAmount(-100000), '-100,000');
  });
});

describe('formatAmountForInput (while typing)', () => {
  test('groups integers while typing', () => {
    assert.equal(formatAmountForInput('1000'), '1,000');
    assert.equal(formatAmountForInput('10000'), '10,000');
    assert.equal(formatAmountForInput('1000000'), '1,000,000');
  });

  test('preserves trailing decimal point', () => {
    assert.equal(formatAmountForInput('1000.'), '1,000.');
    assert.equal(formatAmountForInput('1000.50'), '1,000.50');
  });

  test('preserves negative sign', () => {
    assert.equal(formatAmountForInput('-500000'), '-500,000');
  });
});

describe('parseAmount', () => {
  test('parses formatted strings', () => {
    assert.equal(parseAmount('1,250,000'), 1250000);
    assert.equal(parseAmount('4,500,000'), 4500000);
    assert.equal(parseAmount('1,000.50'), 1000.5);
  });

  test('returns null for empty or incomplete input', () => {
    assert.equal(parseAmount(''), null);
    assert.equal(parseAmount('-'), null);
    assert.equal(parseAmount('.'), null);
  });
});

describe('sanitizeAmountInput', () => {
  test('rejects letters and special symbols', () => {
    assert.equal(sanitizeAmountInput('abc123'), '123');
    assert.equal(sanitizeAmountInput('1,000$'), '1000');
    assert.equal(sanitizeAmountInput('12@34'), '1234');
  });

  test('allows only one decimal', () => {
    assert.equal(sanitizeAmountInput('12.34.56'), '12.34');
  });

  test('respects decimalPlaces limit', () => {
    assert.equal(sanitizeAmountInput('100.999', { decimalPlaces: 2 }), '100.99');
  });

  test('allows negative when configured', () => {
    assert.equal(sanitizeAmountInput('-1000', { allowNegative: true }), '-1000');
    assert.equal(sanitizeAmountInput('-1000', { allowNegative: false }), '1000');
  });
});

describe('processAmountInputChange', () => {
  test('formats typed sequence 1000000', () => {
    let display = '';
    let cursor = 0;
    for (const ch of '1000000') {
      const next = display.slice(0, cursor) + ch + display.slice(cursor);
      const result = processAmountInputChange(next, cursor + 1, { decimalPlaces: 2 });
      display = result.displayValue;
      cursor = result.cursorPosition;
    }
    assert.equal(display, '1,000,000');
    assert.equal(parseAmount(display), 1000000);
  });

  test('returns raw value without commas', () => {
    const result = processAmountInputChange('1,500,000', 9, { decimalPlaces: 2 });
    assert.equal(result.rawValue, '1500000');
    assert.equal(result.numericValue, 1500000);
  });
});

describe('cursor position', () => {
  test('does not jump to end when inserting in middle', () => {
    const display = '1,000';
    const cursorBefore = 2; // after "1,"
    const result = processAmountInputChange('1,5000', 3, { decimalPlaces: 2 });
    assert.equal(result.displayValue, '15,000');
    const restored = getCursorPositionAfterFormat(display, cursorBefore, result.displayValue);
    assert.ok(restored < result.displayValue.length, 'cursor should not jump to end');
  });

  test('cursorFromSignificantCount maps correctly', () => {
    assert.equal(cursorFromSignificantCount('1,000', 4), 5);
    assert.equal(cursorFromSignificantCount('-500,000', 7), 8);
  });
});

console.log('AmountInput tests passed');
