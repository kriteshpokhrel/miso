import assert from 'node:assert/strict';
import test from 'node:test';
import { cursorAttention, NEUTRAL_ATTENTION } from './attention.js';

const bounds = { x: 100, y: 200, width: 300, height: 300 };
test('nearby cursor outside the overlay produces bounded head/eye direction', () => {
  const right = cursorAttention({ x: 550, y: 300 }, bounds);
  assert.equal(right.nearby, true);
  assert.equal(right.x, 1);
  assert.ok(right.y < 0);
  const left = cursorAttention({ x: 0, y: 400 }, bounds);
  assert.equal(left.nearby, true);
  assert.equal(left.x, -1);
  assert.ok(left.y > 0);
});

test('attention returns to neutral past the proximity boundary', () => {
  assert.deepEqual(cursorAttention({ x: 701, y: 356 }, bounds), NEUTRAL_ATTENTION);
  assert.equal(cursorAttention({ x: 700, y: 356 }, bounds).nearby, true);
  assert.deepEqual(cursorAttention({ x: 250, y: 356 }, bounds), { x: 0, y: 0, nearby: true });
});

test('gaze is scale independent and handles negative display coordinates', () => {
  const original = cursorAttention({ x: 400, y: 400 }, bounds);
  const scaled = cursorAttention({ x: -1400, y: 800 }, { x: -2000, y: 400, width: 600, height: 600 });
  assert.deepEqual(scaled, original);
  assert.deepEqual(cursorAttention({ x: NaN, y: 0 }, bounds), NEUTRAL_ATTENTION);
  assert.deepEqual(cursorAttention({ x: 0, y: 0 }, { ...bounds, width: 0 }), NEUTRAL_ATTENTION);
});
