import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, Mesh, type Object3D } from 'three';
import { createPetModel } from './pet-models.js';
import type { CharacterPose } from './pet-model.js';

const idle: CharacterPose = { mood: 'idle', moving: false, speaking: false, reducedMotion: false,
  attention: { x: 0, y: 0, nearby: false } };
const companions = ['dog', 'panda', 'octopus'] as const;
function find(root: Object3D, name: string): Object3D {
  const found = root.getObjectByName(name);
  assert.ok(found, `Missing ${name}`);
  return found;
}
function positions(root: Object3D): number[] {
  const result: number[] = [];
  root.traverse(object => {
    result.push(...object.position.toArray(), ...object.rotation.toArray().slice(0, 3).map(Number), ...object.scale.toArray());
    if (object instanceof Mesh) result.push(...object.geometry.attributes.position!.array);
  });
  return result;
}

for (const species of companions) {
  test(`${species} has its own complete care, gaze, sleep and Home poses`, () => {
    const model = createPetModel(species);
    try {
      for (let frame = 0; frame < 60; frame++) model.pose({ ...idle, attention: { x: 1, y: -1, nearby: true } }, frame / 30);
      assert.ok(model.diagnostics().lookX > 0.47);
      const head = find(model.root, 'head');
      const upright = head.position.y;
      model.pose({ ...idle, mood: 'eating' }, 2);
      assert.equal(model.diagnostics().foodVisible, true);
      for (let frame = 0; frame < 45; frame++) model.pose({ ...idle, mood: 'eating' }, 2 + frame / 30);
      assert.ok(head.position.y < upright - 0.2);
      model.pose({ ...idle, mood: 'mimicking' }, 4);
      assert.equal(find(model.root, 'laptop').visible, true);
      assert.equal(model.diagnostics().foodVisible, false);
      model.pose({ ...idle, mood: 'purring' }, 4);
      assert.equal(find(model.root, 'hearts').visible, true);
      assert.equal(find(model.root, 'eye-left').visible, false);
      model.pose({ ...idle, mood: 'playing' }, 4);
      assert.equal(find(model.root, 'ball').visible, true);
      model.pose({ ...idle, mood: 'irritated' }, 4);
      assert.equal(find(model.root, 'frown').visible, true);
      assert.ok(find(model.root, 'eye-left').scale.y < 0.7);
      model.pose({ ...idle, mood: 'purring', motion: { state: 'falling', speed: 0, direction: 1, progress: 0.5 } }, 4);
      assert.equal(find(model.root, 'eye-left').visible, true);
      assert.equal(find(model.root, 'mouth').visible, true);
      assert.equal(find(model.root, 'hearts').visible, false);
      model.pose({ ...idle, speaking: true }, 4.1);
      assert.equal(find(model.root, 'mouth').visible, true);
      for (let frame = 0; frame < 90; frame++) model.pose({ ...idle, mood: 'sleeping' }, 5 + frame / 30);
      assert.ok(head.position.y < upright - 0.5);
      assert.equal(find(model.root, 'sleep').visible, true);
      assert.equal(find(model.root, 'laptop').visible || find(model.root, 'ball').visible || model.diagnostics().foodVisible, false);
      for (let frame = 0; frame < 60; frame++) model.pose({ ...idle, motion: { state: 'home-entering', speed: 80, direction: 1, progress: 0.98 } }, 8 + frame / 30);
      assert.equal(model.diagnostics().homeVisible, true);
      assert.equal(find(model.root, 'character').visible, false);
      model.pose(idle, 11);
      assert.equal(model.diagnostics().homeVisible, false);
      assert.equal(find(model.root, 'character').visible, true);
    } finally { model.dispose(); }
  });

  test(`${species} deforms finite limbs without rebuilding meshes and honors reduced motion`, () => {
    const model = createPetModel(species);
    try {
      const meshes: Mesh[] = [];
      model.root.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
      const geometries = meshes.map(mesh => mesh.geometry);
      const limbs = meshes.filter(mesh => /^(leg-|octopus-arm-)/.test(mesh.name));
      assert.equal(limbs.length, species === 'octopus' ? 8 : 4);
      model.pose(idle, 0);
      const before = Array.from(limbs[0]!.geometry.attributes.position!.array);
      for (let frame = 0; frame < 60; frame++) {
        model.pose({ ...idle, moving: true, motion: { state: 'walking', speed: 65, direction: -1, progress: 0 } }, frame / 30);
        assert.ok(positions(model.root).every(Number.isFinite));
        for (const limb of limbs) assert.ok(Array.from(limb.geometry.attributes.normal!.array).every(Number.isFinite));
      }
      assert.notDeepEqual(Array.from(limbs[0]!.geometry.attributes.position!.array), before);
      assert.ok(model.diagnostics().facing < -1.2);
      assert.deepEqual(meshes.map(mesh => mesh.geometry), geometries);
      const currentMeshes: Mesh[] = [];
      model.root.traverse(object => { if (object instanceof Mesh) currentMeshes.push(object); });
      assert.deepEqual(currentMeshes, meshes);
      const reduced = { ...idle, reducedMotion: true, attention: { x: 1, y: 1, nearby: true } };
      model.pose(reduced, 3);
      const fixed = positions(model.root);
      model.pose(reduced, 300);
      assert.deepEqual(positions(model.root), fixed);
      assert.equal(model.diagnostics().lookX, 0);
      model.pose(idle, 301);
      const bounds = new Box3().setFromObject(find(model.root, 'character'));
      assert.ok(bounds.min.y > -0.15 && bounds.max.y < 2.85, `Vertical bounds ${bounds.min.y}..${bounds.max.y}`);
    } finally { model.dispose(); }
  });

  test(`${species} recolors skin without rebuilding and releases all owned resources exactly once`, () => {
    const model = createPetModel(species);
    const resources = new Set<{ addEventListener(type: 'dispose', listener: () => void): void }>();
    model.root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    });
    const counts = new Map<object, number>();
    for (const resource of resources) resource.addEventListener('dispose', () => { counts.set(resource, (counts.get(resource) ?? 0) + 1); });
    model.setAppearance({ coatPattern: 'dual', coatColor: '#112233', accentColor: '#f0e0d0' });
    assert.equal(model.diagnostics().color, '112233');
    assert.equal(model.diagnostics().accent, 'f0e0d0');
    model.setAppearance({ coatPattern: 'single', coatColor: '#112233', accentColor: '#f0e0d0' });
    assert.equal(model.diagnostics().accent, '112233');
    model.dispose();
    assert.equal(counts.size, resources.size);
    assert.ok([...counts.values()].every(count => count === 1));
  });
}
