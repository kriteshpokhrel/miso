import * as THREE from 'three';
import { createCompanionKit } from './companion-kit.js';
import { SoftLimb } from './soft-limb.js';
import type { CharacterPose, PetModel } from './pet-model.js';

export function createOctopusModel(): PetModel {
  const kit = createCompanionKit();
  const body = kit.oval(kit.character, kit.fur, [0, 0.53, 0], [0.65, 0.36, 0.57]);
  body.name = 'body';
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.4, 0);
  kit.character.add(head);
  const mantle = kit.oval(head, kit.fur, [0, 0, 0], [0.74, 0.87, 0.6]);
  kit.oval(head, kit.accent, [0, -0.46, 0.31], [0.44, 0.28, 0.27]);
  const face = kit.face(head, 0.31, 0.51, 1.03);
  for (const side of [-1, 1]) kit.oval(head, kit.pink, [side * 0.52, -0.21, 0.43], [0.1, 0.055, 0.03]);
  const cupGeometry = new THREE.TorusGeometry(0.047, 0.014, 6, 12);
  const arms = Array.from({ length: 8 }, (_, index) => {
    const angle = index / 8 * Math.PI * 2 + Math.PI / 8;
    const points = Array.from({ length: 6 }, (_, point) =>
      new THREE.Vector3(Math.sin(angle) * (0.25 + point * 0.18), 0.5 - point * 0.07, Math.cos(angle) * (0.25 + point * 0.18)));
    const skin = new SoftLimb(points, [0.13, 0.16, 0.13, 0.09, 0.045, 0.007], 32, 14);
    const mesh = kit.mesh(skin.geometry, kit.fur, kit.character);
    mesh.name = `octopus-arm-${index}`;
    const cups = Array.from({ length: 4 }, () => {
      const cup = kit.mesh(cupGeometry, kit.accent, kit.character);
      cup.rotation.x = Math.PI / 2;
      return cup;
    });
    return { angle, points, skin, cups, index };
  });
  let cycle = 0;
  function pose(state: CharacterPose, elapsed: number, delta = 1 / 30): void {
    const frame = kit.update(state, elapsed, delta);
    const { time, sleep, eat, walk, rest, compression } = frame;
    if (frame.walking) cycle += frame.dt * (frame.home ? 120 : frame.movement.speed) / 55;
    const breath = Math.sin(time * 1.8) * 0.009;
    body.position.y = 0.53 - sleep * 0.22 - rest * 0.03 - compression * 0.04;
    body.scale.set(0.65 + sleep * 0.1, 0.36 - sleep * 0.13, 0.57 + sleep * 0.07);
    head.position.set(0, 1.4 - sleep * 0.62 - rest * 0.08 - eat * 0.3 + breath - compression * 0.1,
      eat * 0.13 + walk * 0.03);
    head.rotation.set(frame.lookY * 0.22 + eat * 0.32, frame.lookX * 0.48,
      state.mood === 'irritated' ? Math.sin(time * 5) * 0.035 : 0);
    mantle.scale.set(0.74 + sleep * 0.09 + compression * 0.04, 0.87 - sleep * 0.23 + breath - compression * 0.1, 0.6 + sleep * 0.06);
    face.pose(state, time, frame.lookX, frame.lookY);
    for (const arm of arms) {
      const phase = cycle * Math.PI * 2 + arm.index * Math.PI * 0.75;
      const wave = Math.sin(phase);
      const front = arm.index === 0 || arm.index === 7;
      for (let index = 0; index < arm.points.length; index++) {
        const t = index / (arm.points.length - 1);
        const outer = t * t;
        const curl = Math.sin(time * 1.4 + arm.index * 0.8) * 0.025;
        let radius = 0.24 + t * (0.95 - sleep * 0.18) - outer * (sleep * 0.25 + 0.04);
        let y = 0.48 - Math.sin(t * Math.PI / 2) * 0.38 + outer * (0.08 + curl)
          - (1 - t) * sleep * 0.18 + Math.max(0, wave) * walk * Math.sin(t * Math.PI) * 0.13;
        let x = Math.sin(arm.angle) * radius;
        let z = Math.cos(arm.angle) * radius + wave * walk * outer * 0.17;
        if (state.mood === 'purring') y += outer * 0.22;
        if (state.mood === 'irritated') { radius += outer * 0.1; x = Math.sin(arm.angle) * radius; y += outer * 0.48; }
        if (frame.airborne) {
          x += Math.sin(arm.angle) * outer * 0.12;
          y += outer * (frame.falling ? 0.5 : 0.22);
        } else if (front && (frame.typing || frame.eating || state.mood === 'playing')) {
          const reach = outer * (frame.typing || frame.eating ? 1 : 0.7);
          const targetX = (arm.index === 0 ? 1 : -1) * (frame.typing ? 0.24 : 0.17);
          x += (targetX - x) * reach;
          z += (1.04 - z) * reach;
          y += ((frame.typing ? 0.2 + Math.sin(time * 13 + arm.index) * 0.035
            : frame.eating ? 0.23 + Math.sin(time * 5) * 0.025 : 0.35 + Math.sin(time * 3 + arm.index) * 0.12) - y) * reach;
        }
        arm.points[index]!.set(x, y, z);
      }
      arm.skin.update();
      for (let index = 0; index < arm.cups.length; index++) {
        const cup = arm.cups[index]!;
        cup.position.copy(arm.points[index + 2]!);
        cup.position.y -= 0.045;
        cup.rotation.z = Math.cos(arm.angle) * 0.25;
      }
    }
  }
  return { root: kit.root, pose, setAppearance: kit.setAppearance, diagnostics: kit.diagnostics, dispose: kit.dispose };
}
