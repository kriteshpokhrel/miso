import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, Vector3 } from 'three';
import { createCatModel } from './cat-model.js';
import type { CharacterPose } from './cat-model.js';
import { WALK_CYCLE_PIXELS } from './cat-gait.js';

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

test('sleep transitions into a grounded lying pose without holding a prop', () => {
  const cat = createCatModel();
  try {
    cat.pose(idle, 0);
    const upright = cat.head.position.y;
    cat.pose({ ...idle, mood: 'sleeping' }, 1 / 30);
    assert.ok(cat.head.position.y < upright && cat.head.position.y > 1);
    for (let frame = 2; frame <= 45; frame++) cat.pose({ ...idle, mood: 'sleeping' }, frame / 30);
    assert.ok(cat.head.position.y < 0.9);
    assert.ok(cat.arms.every(arm => arm.position.y < 0.3));
    assert.equal(cat.laptop.visible || cat.bowl.visible || cat.ball.visible, false);
    assert.equal(cat.sleep.visible, true);
    for (let frame = 46; frame <= 90; frame++) cat.pose(idle, frame / 30);
    assert.ok(cat.head.position.y > 1.6);
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

test('single and dual coats recolor existing fur materials without rebuilding the rig or coloring the eye whites', () => {
  const cat = createCatModel();
  try {
    const originalHead = cat.head.children[0];
    const eyeWhite = cat.eyes[0]!.socket.children[0];
    assert.ok(eyeWhite instanceof Mesh);
    const eyeMaterial = eyeWhite.material;
    cat.setCoat({ coatPattern: 'dual', coatColor: '#79584f', accentColor: '#f4dfc3' });
    assert.equal(cat.coatMaterials.fur.color.getHexString(), '79584f');
    assert.equal(cat.coatMaterials.markings.color.getHexString(), 'f4dfc3');
    cat.setCoat({ coatPattern: 'single', coatColor: '#79584f', accentColor: '#f4dfc3' });
    assert.equal(cat.coatMaterials.markings.color.getHexString(), '79584f');
    cat.setCoat({ coatPattern: 'dual', coatColor: '#79584f', accentColor: '#f4dfc3' });
    assert.equal(cat.coatMaterials.markings.color.getHexString(), 'f4dfc3');
    assert.equal(cat.head.children[0], originalHead);
    assert.equal(eyeWhite.material, eyeMaterial);
    assert.notEqual(eyeMaterial, cat.coatMaterials.fur);
    assert.notEqual(eyeMaterial, cat.coatMaterials.markings);
  } finally { cat.dispose(); }
});

test('feeding produces a bowl, a lowered head and chewing instead of a generic happy pose', () => {
  const cat = createCatModel();
  try {
    for (let frame = 0; frame < 60; frame++) cat.pose({ ...idle, mood: 'eating' }, 1);
    const first = cat.mouth.scale.y;
    assert.equal(cat.bowl.visible, true);
    assert.equal(cat.hearts.visible, false);
    assert.ok(cat.head.position.y < 1.2 && cat.head.rotation.x > 0.6);
    cat.pose({ ...idle, mood: 'eating' }, 1.1);
    assert.notEqual(cat.mouth.scale.y, first);
    cat.pose(idle, 2);
    assert.equal(cat.bowl.visible, false);
  } finally { cat.dispose(); }
});

test('walking turns sideways, lifts diagonal paws, and stops advancing the gait when still', () => {
  const cat = createCatModel();
  try {
    const walking = { ...idle, motion: { state: 'walking' as const, direction: -1 as const, speed: 60, progress: 0 } };
    for (let frame = 0; frame < 60; frame++) cat.pose(walking, frame / 30);
    assert.ok(cat.character.rotation.y < -1.1);
    assert.ok(cat.legs.some(leg => leg.foot.position.y > 0.12));
    assert.equal(cat.legs[0]!.group.visible, true);
    assert.equal(cat.feet[0]!.visible, false);
    assert.deepEqual(cat.torso.scale.toArray(), [1, 1, 1]);
    assert.deepEqual(cat.arms[0]!.scale.toArray(), [1, 1, 1]);
    for (let frame = 0; frame < 60; frame++) cat.pose(idle, frame / 30 + 2);
    assert.ok(Math.abs(cat.character.rotation.y) < 0.001);
    assert.ok(Math.abs(cat.arms[0]!.rotation.x) === 0);
    assert.equal(cat.feet[0]!.position.y, cat.feet[1]!.position.y);
  } finally { cat.dispose(); }
});

test('walking skin stays attached inside the torso and paws throughout a full gait', () => {
  const cat = createCatModel();
  try {
    const body = cat.torso.children[0];
    assert.ok(body instanceof Mesh);
    for (let frame = 0; frame < 90; frame++) {
      cat.pose({ ...idle, moving: true, motion: { state: 'walking', direction: 1, speed: 60, progress: 0 } }, frame / 30);
      for (const leg of cat.legs.filter(candidate => candidate.group.visible)) {
        const root = leg.surface.attachment;
        const inside = ((root.x - body.position.x) / body.scale.x) ** 2
          + ((root.y - body.position.y) / body.scale.y) ** 2
          + ((root.z - body.position.z) / body.scale.z) ** 2;
        assert.ok(inside < 1, 'a thigh root emerged outside the original torso');
        const position = leg.surface.geometry.getAttribute('position');
        assert.ok(Array.from(position.array).every(Number.isFinite));
        assert.ok(Array.from(leg.surface.geometry.getAttribute('normal').array).every(Number.isFinite));
        const ankle = position.count - 1;
        assert.ok(Math.hypot(position.getX(ankle) - leg.foot.position.x,
          position.getY(ankle) - leg.foot.position.y, position.getZ(ankle) - leg.foot.position.z) < 0.06);
        assert.equal(leg.surface.mesh.material, cat.coatMaterials.fur);
      }
    }
  } finally { cat.dispose(); }
});

test('walking has two subtle weight shifts per stride instead of rapid body and head shaking', () => {
  const cat = createCatModel();
  try {
    const walking = { ...idle, moving: true,
      motion: { state: 'walking' as const, direction: 1 as const, speed: WALK_CYCLE_PIXELS, progress: 0 } };
    const body = cat.torso.children[0]!;
    const bodyHeights: number[] = [];
    const headHeights: number[] = [];
    for (let frame = 0; frame < 240; frame++) {
      cat.pose(walking, frame / 60, 1 / 60);
      if (frame >= 120) { bodyHeights.push(body.position.y); headHeights.push(cat.head.position.y); }
    }
    assert.ok(Math.max(...bodyHeights) - Math.min(...bodyHeights) < 0.02);
    assert.ok(Math.max(...headHeights) - Math.min(...headHeights) < 0.015);
    const peaks = bodyHeights.filter((height, index) => index > 0 && index < bodyHeights.length - 1
      && height > bodyHeights[index - 1]! && height >= bodyHeights[index + 1]!);
    assert.equal(peaks.length, 4, 'two full strides should produce four gentle weight shifts');
  } finally { cat.dispose(); }
});

test('a planted paw compensates native screen travel after the walking yaw projection', () => {
  const cat = createCatModel();
  try {
    const walking = { ...idle, moving: true,
      motion: { state: 'walking' as const, direction: 1 as const, speed: WALK_CYCLE_PIXELS, progress: 0 } };
    for (let frame = 0; frame < 120; frame++) cat.pose(walking, frame / 60, 1 / 60);
    const planted: number[] = [];
    for (let frame = 0; frame < 18; frame++) {
      cat.pose(walking, (120 + frame) / 60, 1 / 60);
      cat.root.position.x = (frame + 1) / 60 * WALK_CYCLE_PIXELS * 2.82 / 236;
      cat.root.updateMatrixWorld(true);
      if (frame === 5 || frame === 17) planted.push(cat.legs[0]!.foot.getWorldPosition(new Vector3()).x);
    }
    assert.ok(Math.abs(planted[1]! - planted[0]!) < 0.00001, 'a planted paw slid relative to the desktop');
  } finally { cat.dispose(); }
});

test('the house admits the cat before sliding off to the right, and restore clears it', () => {
  const cat = createCatModel();
  try {
    cat.pose({ ...idle, mood: 'home', motion: { state: 'home-arriving', direction: 1, speed: 0, progress: 1 } }, 1);
    assert.equal(cat.house.visible, true);
    assert.equal(cat.character.visible, true);
    cat.pose({ ...idle, mood: 'home', motion: { state: 'home-entering', direction: 1, speed: 0, progress: 0.99 } }, 2);
    assert.equal(cat.character.visible, false);
    cat.pose({ ...idle, mood: 'home', motion: { state: 'home-leaving', direction: 1, speed: 0, progress: 0 } }, 3);
    const initial = cat.house.position.x;
    cat.pose({ ...idle, mood: 'home', motion: { state: 'home-leaving', direction: 1, speed: 0, progress: 1 } }, 4);
    assert.ok(cat.house.position.x > initial + 2);
    cat.pose(idle, 5);
    assert.equal(cat.house.visible, false);
    assert.equal(cat.character.visible, true);
  } finally { cat.dispose(); }
});

test('falling spreads the paws and opens a frightened face, then resets on landing', () => {
  const cat = createCatModel();
  try {
    cat.pose({ ...idle, motion: { state: 'falling', direction: 1, speed: 0, progress: 0.5 } }, 1);
    assert.equal(cat.mouth.visible, true);
    assert.ok(cat.mouth.scale.y > 0.1);
    assert.ok(Math.abs(cat.arms[0]!.rotation.z) > 1);
    assert.ok(cat.eyes[0]!.socket.scale.y > 1);
    cat.pose(idle, 2);
    assert.equal(cat.mouth.visible, false);
    assert.equal(cat.arms[0]!.rotation.z, 0);
  } finally { cat.dispose(); }
});
