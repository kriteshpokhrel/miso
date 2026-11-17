import assert from 'node:assert/strict';
import test from 'node:test';
import { CARE_CENTER_Y, CARE_HEIGHT, careOrbit, petUiBounds } from '../shared/pet-ui.js';

test('eight full-size care targets fit an upper arc, including a narrow work area', () => {
  for (const width of [430, 300]) {
    const points = Array.from({ length: 8 }, (_, index) => careOrbit(index, 8, width));
    for (const point of points) {
      assert.ok(point.y <= CARE_CENTER_Y + 1e-8);
      assert.ok(point.x - 34 >= 0 && point.x + 34 <= width);
      assert.ok(point.y - 22 >= 0 && point.y + 52 <= CARE_HEIGHT);
    }
    for (let index = 1; index < points.length; index++) {
      assert.ok(Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y) >= 44);
    }
  }
});

test('Tiny scales only the creature, not care or speech UI or its stored position', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  const tiny = { x: 700, y: 930, width: 150, height: 150 };
  const original = { ...tiny };
  const small = petUiBounds(tiny, area, 0.5, 64);
  const regular = petUiBounds({ x: 700, y: 780, width: 300, height: 300 }, area, 1, 64);
  assert.deepEqual(tiny, original);
  assert.equal(small.care.width, regular.care.width);
  assert.equal(small.care.height, regular.care.height);
  assert.equal(small.speech.width, regular.speech.width);
  assert.equal(small.speech.height, regular.speech.height);
  assert.equal(small.speechBelow, false);
});

test('popups clamp at every screen edge, negative displays and compact perches', () => {
  for (const area of [{ x: -1920, y: -300, width: 1920, height: 1080 }, { x: 100, y: 200, width: 300, height: 500 }]) {
    for (const x of [area.x, area.x + area.width - 150]) {
      for (const y of [area.y, area.y + area.height - 150]) {
        for (const top of [0, 64]) {
          const layout = petUiBounds({ x, y, width: 150, height: 150 }, area, 0.5, top);
          for (const popup of [layout.care, layout.speech]) {
            assert.ok(popup.x >= area.x && popup.y >= area.y);
            assert.ok(popup.x + popup.width <= area.x + area.width);
            assert.ok(popup.y + popup.height <= area.y + area.height);
          }
          assert.ok(layout.speechAnchor >= 18 && layout.speechAnchor <= layout.speech.width - 18);
          if (y === area.y) assert.equal(layout.speechBelow, true);
          if (top === 0 && y > area.y) assert.equal(layout.speechBelow, false);
        }
      }
    }
  }
});
