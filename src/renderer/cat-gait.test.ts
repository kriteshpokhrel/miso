import assert from 'node:assert/strict';
import test from 'node:test';
import { legJoint, pawStep } from './cat-gait.js';

test('stance paws stay on the ground and compensate body travel instead of skating or cycling in circles', () => {
  const a = pawStep(0.1);
  const b = pawStep(0.3);
  assert.equal(a.lift, 0);
  assert.equal(b.lift, 0);
  assert.ok(Math.abs((b.forward - a.forward) + 0.6 * (0.3 - 0.1)) < 1e-10);
  assert.ok(pawStep(0.85).lift > 0.13);
  assert.ok(Math.abs(pawStep(0.99999).forward - pawStep(0).forward) < 0.001);
});

test('articulated legs keep both bone lengths constant throughout the stride', () => {
  for (let frame = 0; frame < 100; frame++) {
    const step = pawStep(frame / 100);
    for (const bend of [-1, 1] as const) {
      const joint = legJoint(0.74, 0, 0.12 + step.lift, step.forward, bend);
      assert.ok(Math.abs(Math.hypot(joint.y - 0.74, joint.z) - 0.36) < 1e-10);
      assert.ok(Math.abs(Math.hypot(joint.y - 0.12 - step.lift, joint.z - step.forward) - 0.36) < 1e-10);
    }
  }
});
