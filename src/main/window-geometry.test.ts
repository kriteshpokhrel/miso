import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWindowGeometry } from './window-geometry.js';

test('window metadata accepts finite geometry only and rejects malformed native responses', () => {
  const value = { bounds: { x: -1800, y: 400, width: 900, height: 600 }, maximized: false };
  assert.deepEqual(parseWindowGeometry(value), value);
  assert.equal(parseWindowGeometry(null), null);
  for (const invalid of [{}, { ...value, maximized: 'false' }, { ...value, bounds: { ...value.bounds, width: -1 } },
    { ...value, bounds: { ...value.bounds, x: Infinity } }]) assert.throws(() => parseWindowGeometry(invalid));
});
