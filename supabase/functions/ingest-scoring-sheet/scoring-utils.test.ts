import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScoringDate } from './scoring-utils.ts';

test('parseScoringDate accepts Argentine DD/MM/YYYY and DD-MM-YYYY', () => {
  assert.equal(parseScoringDate('31/01/2026'), '2026-01-31');
  assert.equal(parseScoringDate('01-02-2026'), '2026-02-01');
});

test('parseScoringDate accepts strict ISO dates', () => {
  assert.equal(parseScoringDate('2026-10-24'), '2026-10-24');
  assert.equal(parseScoringDate('2024-02-29'), '2024-02-29');
});

test('parseScoringDate rejects impossible and ambiguous formats', () => {
  for (const value of ['31/02/2026', '29/02/2025', '2026-13-01', '2026/01/31', '01/02/26', 'texto']) {
    assert.equal(parseScoringDate(value), null, value);
  }
});
