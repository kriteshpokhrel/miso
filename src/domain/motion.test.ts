import assert from 'node:assert/strict';
import test from 'node:test';
import { fallPosition, hopPosition, MOTION_PROFILES, nextWalkingDisplay, walkToward, walkingSurface } from './motion.js';

test('screen transfers walk through connected floor edges, not diagonally across gaps', () => {
  const display = (id: number, x: number, y = 0) => ({ id, bounds: { x, y, width: 1000, height: 800 }, workArea: { x, y, width: 1000, height: 760 } });
  const left = display(1, -1000);
  const middle = display(2, 0);
  const right = display(3, 1000);
  assert.equal(nextWalkingDisplay(left, right, [left, middle, right])?.id, middle.id);
  assert.equal(nextWalkingDisplay(right, left, [left, middle, right])?.id, middle.id);
  assert.equal(nextWalkingDisplay(left, right, [left, right]), null);
  assert.equal(nextWalkingDisplay(middle, display(4, 0, -800), [middle, display(4, 0, -800)]), null);
  assert.equal(fallPosition({ x: -800, y: 20 }, { x: -800, y: 460 }, 0.6).x, -800);
});

test('a normal window offers a bounded top-edge perch; maximized or cramped windows use desktop', () => {
  const area = { x: -1600, y: 0, width: 1600, height: 1000 };
  const active = { bounds: { x: -1400, y: 400, width: 800, height: 400 }, maximized: false };
  const ledge = walkingSurface(area, 300, active, true);
  assert.equal(ledge.y, 100);
  assert.equal(ledge.perched, true);
  assert.ok(ledge.min >= area.x && ledge.max <= -300);
  for (const window of [null, { ...active, maximized: true }, { ...active, bounds: { ...active.bounds, y: 100 } }]) {
    assert.equal(walkingSurface(area, 300, window, true).perched, false);
  }
  assert.equal(walkingSurface(area, 300, active, false).y, 700);
  const tight = walkingSurface(area, 300, { ...active, bounds: { ...active.bounds, y: 250 } }, true);
  assert.equal(tight.perched, true);
  assert.equal(tight.compact, true);
  assert.equal(tight.y, 14);
});

test('a substantial drop accelerates downwards, does not hop upwards and lands exactly', () => {
  const from = { x: 100, y: 0 };
  const to = { x: 200, y: 500 };
  assert.equal(fallPosition(from, to, 0).y, 0);
  assert.equal(fallPosition(from, to, 0.5).y, 125);
  assert.deepEqual(fallPosition(from, to, 1), to);
});

test('travel accelerates, brakes without overshooting and preserves fractional progress', () => {
  let position = { x: 0, y: 0, vx: 0 };
  const first = walkToward(position, 100, 1 / 60, 42, 140);
  assert.ok(first.x > 0 && first.x < 1);
  for (let frame = 0; frame < 600; frame++) {
    position = walkToward(position, 100, 1 / 60, 42, 140);
    assert.ok(position.x <= 100 && position.vx <= 42);
  }
  assert.ok(Math.abs(position.x - 100) < 0.05);
  assert.equal(position.vx, 0);
  assert.equal(walkToward(position, 500, 1, 0, 0).x, position.x);
});

test('30Hz and 60Hz travel cover approximately the same distance and levels differ measurably', () => {
  const distance = (fps: number, level: 'gentle' | 'lively'): number => {
    let position = { x: 0, y: 0, vx: 0 };
    const profile = MOTION_PROFILES[level];
    for (let frame = 0; frame < fps * 2; frame++) position = walkToward(position, 1000, 1 / fps, profile.speed, profile.acceleration);
    return position.x;
  };
  assert.ok(Math.abs(distance(30, 'gentle') - distance(60, 'gentle')) < 2);
  assert.ok(distance(60, 'lively') > distance(60, 'gentle') * 1.8);
  assert.deepEqual(hopPosition({ x: 0, y: 500 }, { x: 300, y: 100 }, 0), { x: 0, y: 500 });
  assert.deepEqual(hopPosition({ x: 0, y: 500 }, { x: 300, y: 100 }, 0.1), { x: 0, y: 500 });
  assert.ok(Math.abs(hopPosition({ x: 0, y: 500 }, { x: 300, y: 100 }, 1).y - 100) < 0.001);
});
