import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh } from 'three';
import { createCatModel } from './cat-model.js';
import type { CharacterPose } from './cat-model.js';

const idle: CharacterPose = {
  mood: 'idle', moving: false, speaking: false, reducedMotion: false,
  attention: { x: 0, y: 0, nearby: false },
};

test('real 3D head and pupils turn toward nearby cursor and settle when it leaves', () => {
  const cat = createCatModel();
  try {
    for (let frame = 0; frame < 60; frame++) cat.pose({ ...idle, attention: { x: 1, y: -1, nearby: true } }, 1, 1 / 30);
    assert.ok(cat.head.rotation.y > 0.47 && cat.head.rotation.y <= 0.48);
    assert.ok(cat.head.rotation.x < -0.21);
    assert.ok(cat.eyes[0]!.gaze.position.x > 0);
    for (let frame = 0; frame < 60; frame++) cat.pose(idle, 1, 1 / 30);
    assert.ok(Math.abs(cat.head.rotation.y) < 0.001);
    assert.ok(Math.abs(cat.eyes[0]!.gaze.position.x) < 0.001);
  } finally { cat.dispose(); }
});

test('moods visibly change 3D facial geometry, props and talking mouth', () => {
  const cat = createCatModel();
  try {
    cat.pose({ ...idle, mood: 'irritated' }, 1);
    assert.equal(cat.frown.visible, true);
    assert.equal(cat.smile.visible, false);
    assert.ok(cat.eyes[0]!.socket.scale.y < 0.7);
    cat.pose({ ...idle, mood: 'purring' }, 1);
    assert.equal(cat.eyes[0]!.closed.visible, true);
    assert.equal(cat.hearts.visible, true);
    cat.pose({ ...idle, mood: 'mimicking' }, 1);
    assert.equal(cat.laptop.visible, true);
    assert.ok(cat.arms[0]!.rotation.x < -0.5);
    cat.pose({ ...idle, speaking: true }, 1);
    assert.equal(cat.mouth.visible, true);
    assert.equal(cat.smile.visible, false);
    cat.pose({ ...idle, mood: 'sleeping' }, 1);
    assert.equal(cat.sleep.visible, true);
    assert.equal(cat.eyes[0]!.socket.visible, false);
  } finally { cat.dispose(); }
});

test('reduced motion and sleeping neutralize gaze; motion-free poses do not change with time', () => {
  const cat = createCatModel();
  try {
    const reduced = { ...idle, moving: true, reducedMotion: true, attention: { x: 1, y: 1, nearby: true } };
    cat.pose(reduced, 1);
    assert.equal(cat.head.rotation.y, 0);
    const initial = cat.arms[0]!.rotation.x;
    cat.pose(reduced, 10);
    assert.equal(cat.arms[0]!.rotation.x, initial);
    cat.pose({ ...idle, mood: 'sleeping', attention: reduced.attention }, 1, 1);
    assert.equal(cat.head.rotation.y, 0);
  } finally { cat.dispose(); }
});

test('character teardown releases every attached geometry and material', () => {
  const cat = createCatModel();
  const resources = new Set<{ addEventListener(type: 'dispose', listener: () => void): void }>();
  cat.root.traverse(object => {
    if (object instanceof Mesh) {
      resources.add(object.geometry);
      for (const surface of Array.isArray(object.material) ? object.material : [object.material]) resources.add(surface);
    }
  });
  let released = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { released++; });
  cat.dispose();
  assert.equal(released, resources.size);
});
