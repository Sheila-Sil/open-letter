// Tests for the private-number finder. Run with:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPrivateNumbers } from '../frontend/js/redact.js';
import { quoteFound } from '../frontend/js/verify.js';

// Fake OCR output: one line of words, each 100px wide.
function line(text) {
  const shared = {};
  return text.split(' ').map((word, i) => ({ text: word, line: shared, bbox: { x0: i * 100, x1: i * 100 + 90, y0: 0, y1: 20 } }));
}
const hiddenCount = (text) => findPrivateNumbers(line(text)).length;

test('hides Social Security numbers, full or masked', () => {
  assert.equal(hiddenCount('SSN: 123-45-6789'), 1);
  assert.equal(hiddenCount('SSN: XXX-XX-4821'), 1);
});

test('hides account and case numbers, even when split by spaces', () => {
  assert.equal(hiddenCount('Member ID: 9081 4472 1150'), 1);
  assert.equal(hiddenCount('Case number: 4417-2209-35'), 1);
  assert.equal(hiddenCount('Account 55012'), 1);
});

test('keeps phone numbers, dates, ZIP codes, and money readable', () => {
  assert.equal(hiddenCount('Call us at 1-800-555-0142 (TTY 711).'), 0);
  assert.equal(hiddenCount('Call (800) 555-0142 today'), 0);
  assert.equal(hiddenCount('Due 11/15/2026 at our office'), 0);
  assert.equal(hiddenCount('Lakeview, ST 00000-1234'), 0);
  assert.equal(hiddenCount('Your account balance is $1,250.00'), 0);
  assert.equal(hiddenCount('received by November 15, 2026.'), 0);
});

test('one box covers a whole split number', () => {
  const [box] = findPrivateNumbers(line('Member ID: 9081 4472 1150'));
  assert.ok(box.x <= 200 && box.x + box.w >= 490, 'box should span all three groups');
});

test('quote checking tolerates small OCR mistakes but catches made-up quotes', () => {
  const letter = 'Every year we must check if you still qualify for Medicaid. Your renewal must be received by November 15, 2026. '.repeat(2);
  assert.equal(quoteFound('Your renewal must be received by November 15, 2026.', letter), true);
  assert.equal(quoteFound('Your renewa1 must be received by Novembr 15, 2026', letter), true);
  assert.equal(quoteFound('You owe a penalty of $500 unless you pay by gift card', letter), false);
  assert.equal(quoteFound('anything', 'too short'), null);
});
