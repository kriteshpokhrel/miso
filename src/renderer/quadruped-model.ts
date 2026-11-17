import * as THREE from 'three';
import { createCompanionKit } from './companion-kit.js';
import { SoftLimb } from './soft-limb.js';
import { legJoint, pawStep, walkBob, WALK_CYCLE_PIXELS } from './cat-gait.js';
import type { CharacterPose, PetModel } from './pet-model.js';

export function createQuadrupedModel(species: 'dog' | 'panda'): PetModel {
  const kit = createCompanionKit();
  const panda = species === 'panda';
  const body = kit.oval(kit.character, kit.fur, [0, 0.77, 0], panda ? [0.65, 0.7, 0.5] : [0.54, 0.68, 0.45]);
  body.name = 'body';
  const belly = kit.oval(kit.character, kit.accent, [0, 0.7, 0.39], [0.38, 0.46, 0.13]);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.65, 0.06);
  kit.character.add(head);
  kit.oval(head, kit.fur, [0, 0, 0], panda ? [0.84, 0.73, 0.59] : [0.75, 0.67, 0.55]);
  if (panda) for (const side of [-1, 1]) {
    const patch = kit.oval(head, kit.ink, [side * 0.32, 0.02, 0.46], [0.285, 0.33, 0.17]);
    patch.rotation.z = side * -0.27;
  }
  const face = kit.face(head, 0.31, panda ? 0.59 : 0.49, panda ? 0.87 : 1);
  const muzzle = kit.oval(head, kit.accent, [0, -0.255, 0.5], panda ? [0.23, 0.17, 0.16] : [0.33, 0.2, 0.29]);
  const nose = kit.oval(head, kit.ink, [0, -0.2, panda ? 0.67 : 0.79], [0.1, 0.066, 0.061]);
  muzzle.renderOrder = 0;
  nose.renderOrder = 1;
  if (!panda) {
    face.mouth.position.z = 0.8;
    face.smile.position.z = 0.22;
    face.frown.position.z = 0.22;
  }
  const ears = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (panda ? 0.6 : 0.64), panda ? 0.55 : 0.35, -0.04);
    head.add(pivot);
    if (panda) {
      kit.oval(pivot, kit.ink, [0, 0, 0], [0.24, 0.25, 0.16]);
      kit.oval(pivot, kit.accent, [0, 0, 0.15], [0.125, 0.14, 0.035]);
    } else {
      kit.oval(pivot, kit.accent, [side * 0.055, -0.33, 0], [0.22, 0.47, 0.17]);
      kit.oval(pivot, kit.pink, [side * 0.055, -0.35, 0.15], [0.115, 0.3, 0.028]);
    }
    return pivot;
  });
  const tail = new THREE.Group();
  tail.position.set(0, 0.5, -0.39);
  kit.character.add(tail);
  if (panda) kit.oval(tail, kit.accent, [0, 0, 0], [0.18, 0.18, 0.18]);
  else kit.line(tail, kit.fur, [[0, 0, 0], [0, 0.25, -0.28], [0, 0.55, -0.35], [0, 0.69, -0.16]], 0.095);

  const legs = Array.from({ length: 4 }, (_, index) => {
    const side = index % 2 ? 1 : -1;
    const front = index < 2;
    const points = Array.from({ length: 5 }, (_, point) => new THREE.Vector3(side * 0.25, 0.95 - point * 0.2, front ? 0.32 : -0.35));
    const skin = new SoftLimb(points, front ? [0.025, 0.145, 0.12, 0.09, 0.06] : [0.025, 0.2, 0.16, 0.11, 0.07]);
    const surface = panda ? kit.ink : kit.fur;
    const leg = kit.mesh(skin.geometry, surface, kit.character);
    leg.name = `leg-${index}`;
    const paw = kit.oval(kit.character, panda ? kit.ink : kit.accent, [side * 0.34, 0.13, front ? 0.45 : -0.35],
      [panda ? 0.2 : 0.17, 0.13, 0.22]);
    paw.name = `paw-${index}`;
    return { points, skin, paw, side, front, offset: [0, 0.5, 0.75, 0.25][index]! };
  });
  let cycle = 0;
  function pose(state: CharacterPose, elapsed: number, delta = 1 / 30): void {
    const frame = kit.update(state, elapsed, delta);
    const { time, walk, sleep, eat, rest, compression } = frame;
    if (frame.walking) cycle += frame.dt * (frame.home ? 120 : frame.movement.speed) / WALK_CYCLE_PIXELS;
    const bob = frame.walking ? walkBob(cycle) * 0.009 : 0;
    const breath = Math.sin(time * (panda ? 1.7 : 2.2)) * (0.008 - walk * 0.005);
    const leap = frame.movement.state === 'hopping' ? Math.sin(frame.movement.progress * Math.PI) : 0;
    body.position.set(-sleep * 0.22, 0.77 + walk * 0.12 - sleep * 0.37 - rest * 0.055 + breath + bob - compression * 0.05, -walk * 0.12);
    body.scale.set((panda ? 0.65 : 0.54) - walk * 0.09 + sleep * 0.14,
      (panda ? 0.7 : 0.68) - walk * 0.22 - sleep * 0.33 - compression * 0.08, 0.5 + walk * 0.27 + sleep * 0.1);
    belly.position.set(body.position.x, body.position.y - 0.06, body.position.z + 0.4 + walk * 0.14);
    belly.scale.set(0.38, 0.46 - walk * 0.14 - sleep * 0.21, 0.13);
    head.position.set(sleep * 0.51, 1.65 - walk * 0.14 - sleep * 0.93 - rest * 0.08 - eat * 0.55 + breath + bob * 0.5 - compression * 0.12,
      0.06 + walk * 0.43 + eat * 0.24 + sleep * 0.18);
    head.scale.setScalar(1 - walk * 0.12 - sleep * 0.15);
    head.rotation.set(frame.lookY * 0.22 + eat * (0.58 + Math.sin(time * 6) * 0.025),
      frame.lookX * 0.48, -sleep * 0.25 + (state.mood === 'irritated' ? -0.07 : 0));
    face.pose(state, time, frame.lookX, frame.lookY);
    for (let index = 0; index < ears.length; index++) {
      const side = index === 0 ? -1 : 1;
      ears[index]!.rotation.z = side * (panda ? 0.1 : 0.15 + Math.sin(time * 4) * walk * 0.035)
        + (frame.falling ? side * 0.3 : 0);
      ears[index]!.rotation.x = panda ? 0 : Math.sin(time * 5) * walk * 0.08 - leap * 0.22;
    }
    tail.position.set(0, 0.5 + walk * 0.2 - sleep * 0.25, -0.39 - walk * 0.4);
    tail.rotation.y = Math.sin(time * (state.mood === 'purring' ? 10 : 4)) * (panda ? 0.1 : state.mood === 'irritated' ? 0.1 : 0.5);
    tail.rotation.x = sleep * 0.7;
    for (const leg of legs) {
      const step = pawStep(cycle + leg.offset);
      const forward = frame.walking ? step.forward : 0;
      const lift = frame.walking ? step.lift : 0;
      const reach = leg.front && (frame.typing || state.mood === 'playing' || frame.falling || frame.flight);
      const tapping = frame.typing ? Math.sin(time * 13 + leg.side * Math.PI / 2) * 0.035 : 0;
      const x = leg.side * (0.34 - sleep * 0.14 + (frame.falling ? 0.36 : 0));
      const y = 0.13 + lift + (reach ? frame.falling ? 0.85 : frame.flight ? 0.28 : frame.typing ? 0.18 + tapping : Math.max(0, Math.sin(time * 3 + leg.offset)) * 0.25 : 0)
        + (frame.airborne && !leg.front ? 0.15 : 0);
      const z = (leg.front ? 0.45 : -0.35) + forward + (frame.typing && leg.front ? 0.45 : 0)
        + (frame.flight && leg.front ? 0.24 : 0) + sleep * (leg.front ? 0.01 : 0.18);
      leg.paw.position.set(x, y, z);
      const hipY = 0.75 - sleep * 0.35 + bob - compression * 0.08;
      const hipZ = leg.front ? 0.32 : -0.35;
      const joint = legJoint(hipY, hipZ, y, z, leg.front ? 1 : -1);
      leg.points[0]!.set(leg.side * 0.22 - sleep * 0.16, 0.98 - sleep * 0.52, leg.front ? 0.22 : -0.3);
      leg.points[1]!.set(leg.side * 0.3, hipY + 0.08, hipZ);
      leg.points[2]!.set(leg.side * 0.34, hipY, hipZ);
      leg.points[3]!.set((x + leg.side * 0.34) / 2, joint.y, joint.z);
      leg.points[4]!.copy(leg.paw.position).y += 0.035;
      leg.skin.update();
    }
    kit.character.rotation.z = state.mood === 'playing' ? Math.sin(time * 3) * 0.025 : 0;
  }
  return { root: kit.root, pose, setAppearance: kit.setAppearance, diagnostics: kit.diagnostics, dispose: kit.dispose };
}
