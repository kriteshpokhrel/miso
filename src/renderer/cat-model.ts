import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Attention, CoatColors, Mood } from '../shared/contracts.js';
import { DEFAULT_SETTINGS } from '../shared/contracts.js';

export interface CharacterPose {
  mood: Mood;
  moving: boolean;
  speaking: boolean;
  reducedMotion: boolean;
  attention: Attention;
}

export function createCatModel() {
  const root = new THREE.Group();
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const material = (color: string, roughness = 0.54, clearcoat = 0.18): THREE.MeshPhysicalMaterial => {
    const result = new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat, metalness: 0 });
    materials.push(result);
    return result;
  };
  const fur = material('#bda6df');
  const browFur = material('#9b80c3');
  const cream = material('#fff0d9');
  const peach = material('#efae99');
  const markings = material(DEFAULT_SETTINGS.accentColor);
  const ink = material('#433047', 0.36);
  const iris = material('#5244a1', 0.18, 0.8);
  const pupil = material('#16162d', 0.12, 1);
  const sparkle = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  materials.push(sparkle);
  const mint = material('#80b5a2', 0.4);
  const screen = material('#334b50', 0.35);

  function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
    geometries.push(geometry);
    const result = new THREE.Mesh(geometry, surface);
    result.castShadow = true;
    result.receiveShadow = false;
    parent.add(result);
    return result;
  }
  function oval(parent: THREE.Object3D, surface: THREE.Material,
    position: [number, number, number], scale: [number, number, number]): THREE.Mesh {
    const result = mesh(new THREE.SphereGeometry(1, 28, 20), surface, parent);
    result.position.set(...position);
    result.scale.set(...scale);
    return result;
  }
  function line(parent: THREE.Object3D, points: number[][], surface: THREE.Material, radius = 0.016): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points.map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z)));
    return mesh(new THREE.TubeGeometry(curve, 32, radius, 8, false), surface, parent);
  }
  const torso = new THREE.Group();
  root.add(torso);
  oval(torso, fur, [0, 0.67, 0], [0.61, 0.67, 0.46]);
  oval(torso, markings, [0, 0.66, 0.353], [0.37, 0.48, 0.15]);
  const feet = [-1, 1].map(side => oval(torso, fur, [side * 0.34, 0.15, 0.24], [0.28, 0.17, 0.34]));
  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.48, 0.89, 0.23);
    torso.add(pivot);
    oval(pivot, fur, [0, -0.26, 0.08], [0.18, 0.37, 0.2]);
    oval(pivot, markings, [0, -0.49, 0.13], [0.18, 0.13, 0.19]);
    return pivot;
  });
  const tail = new THREE.Group();
  tail.position.set(0.39, 0.37, -0.18);
  torso.add(tail);
  line(tail, [[0, 0, 0], [0.43, -0.02, -0.05], [0.79, 0.17, 0], [0.86, 0.54, 0], [0.65, 0.66, 0.02]], fur, 0.115);
  oval(tail, markings, [0.65, 0.66, 0.02], [0.12, 0.12, 0.12]);

  const head = new THREE.Group();
  head.position.set(0, 1.63, 0.035);
  root.add(head);
  oval(head, fur, [0, 0, 0], [0.92, 0.79, 0.64]);
  oval(head, markings, [0.64, 0.37, -0.015], [0.29, 0.38, 0.51]);
  const ears = [-1, 1].map(side => {
    const ear = new THREE.Group();
    ear.position.set(side * 0.62, 0.58, -0.01);
    ear.rotation.z = side * -0.24;
    head.add(ear);
    const outer = mesh(new THREE.ConeGeometry(0.34, 0.69, 32, 1), side === 1 ? markings : fur, ear);
    outer.scale.z = 0.62;
    oval(ear, side === 1 ? markings : fur, [0, -0.17, 0], [0.33, 0.2, 0.21]);
    const inner = mesh(new THREE.ConeGeometry(0.22, 0.43, 24), peach, ear);
    inner.position.set(0, -0.025, 0.125);
    inner.scale.z = 0.23;
    oval(ear, side === 1 ? markings : fur, [0, 0.33, 0], [0.025, 0.035, 0.025]);
    return ear;
  });
  const eyes = [-1, 1].map(side => {
    const socket = new THREE.Group();
    socket.position.set(side * 0.395, 0.035, 0.54);
    socket.rotation.y = side * 0.12;
    head.add(socket);
    oval(socket, cream, [0, 0, 0], [0.294, 0.337, 0.17]);
    const gaze = new THREE.Group();
    socket.add(gaze);
    oval(gaze, iris, [0, 0, 0.13], [0.215, 0.267, 0.1]);
    oval(gaze, pupil, [0, 0, 0.207], [0.127, 0.195, 0.04]);
    oval(gaze, sparkle, [-0.066, 0.112, 0.24], [0.066, 0.074, 0.022]);
    oval(gaze, sparkle, [0.058, -0.08, 0.241], [0.025, 0.028, 0.012]);
    const closed = line(head, [[side * 0.395 - 0.18, 0.04, 0.699], [side * 0.395, 0.095, 0.73], [side * 0.395 + 0.18, 0.04, 0.699]], ink, 0.025);
    closed.visible = false;
    const brow = line(head, [[-0.17, 0, 0], [0, 0.04, 0.015], [0.17, 0, 0]], browFur, 0.027);
    brow.position.set(side * 0.4, 0.405, 0.56);
    return { socket, gaze, closed, brow };
  });
  oval(head, markings, [-0.135, -0.285, 0.584], [0.21, 0.16, 0.14]);
  oval(head, markings, [0.135, -0.285, 0.584], [0.21, 0.16, 0.14]);
  oval(head, ink, [0, -0.214, 0.729], [0.071, 0.047, 0.041]);
  const smile = line(head, [[-0.17, -0.32, 0.725], [-0.085, -0.365, 0.754], [0, -0.31, 0.755], [0.085, -0.365, 0.754], [0.17, -0.32, 0.725]], ink, 0.015);
  const frown = line(head, [[-0.12, -0.36, 0.733], [0, -0.31, 0.76], [0.12, -0.36, 0.733]], ink, 0.018);
  const mouth = oval(head, ink, [0, -0.36, 0.759], [0.09, 0.075, 0.022]);
  const tongue = oval(mouth, peach, [0, -0.27, 0.2], [0.65, 0.38, 0.9]);
  tongue.castShadow = false;
  for (const side of [-1, 1]) {
    oval(head, peach, [side * 0.59, -0.235, 0.515], [0.12, 0.065, 0.035]);
    for (const lift of [-0.045, 0.04]) {
      line(head, [[side * 0.57, -0.26 + lift, 0.5], [side * 0.78, -0.27 + lift * 1.8, 0.5], [side * 0.95, -0.25 + lift * 2.5, 0.43]], cream, 0.009);
    }
  }

  const laptop = new THREE.Group();
  laptop.position.set(0, 0.17, 0.68);
  root.add(laptop);
  const base = mesh(new RoundedBoxGeometry(1.17, 0.07, 0.61, 3, 0.035), mint, laptop);
  base.position.set(0, 0, 0.13);
  const lid = mesh(new RoundedBoxGeometry(1.06, 0.64, 0.065, 3, 0.04), mint, laptop);
  lid.position.set(0, 0.32, 0.04);
  lid.rotation.x = -0.15;
  const logo = oval(laptop, cream, [0, 0.34, 0.085], [0.075, 0.082, 0.018]);
  logo.castShadow = false;
  for (const x of [-0.085, 0, 0.085]) oval(laptop, cream, [x, 0.45, 0.071], [0.026, 0.028, 0.012]);
  const keyboard = mesh(new RoundedBoxGeometry(0.82, 0.012, 0.25, 2, 0.01), screen, laptop);
  keyboard.position.set(0, 0.043, 0.23);

  const ball = oval(root, peach, [0.94, 0.16, 0.34], [0.17, 0.17, 0.17]);
  const hearts = new THREE.Group();
  root.add(hearts);
  for (const [x, y, size] of [[-1.06, 1.95, 0.15], [1.01, 2.27, 0.12]]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-1.5, 1, -0.7, 2.2, 0, 1.3);
    shape.bezierCurveTo(0.7, 2.2, 1.5, 1, 0, 0);
    const heart = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.06, bevelSegments: 2, steps: 1 }), peach, hearts);
    heart.position.set(x!, y!, 0.15);
    heart.scale.setScalar(size!);
  }
  const sleep = new THREE.Group();
  root.add(sleep);
  line(sleep, [[0.93, 2.2, 0.2], [1.14, 2.2, 0.2], [0.93, 2.0, 0.2], [1.14, 2.0, 0.2]], cream, 0.026);
  line(sleep, [[1.14, 2.53, 0], [1.3, 2.53, 0], [1.14, 2.38, 0], [1.3, 2.38, 0]], cream, 0.02);

  let lookX = 0;
  let lookY = 0;
  function setCoat(colors: CoatColors): void {
    fur.color.set(colors.coatColor);
    markings.color.set(colors.coatPattern === 'single' ? colors.coatColor : colors.accentColor);
    browFur.color.copy(fur.color).multiplyScalar(0.5);
  }
  setCoat(DEFAULT_SETTINGS);
  function pose(state: CharacterPose, elapsed: number, delta = 1 / 30): void {
    const motion = !state.reducedMotion;
    const time = motion ? elapsed : 0;
    const engaged = motion && state.attention.nearby && state.mood !== 'sleeping' && state.mood !== 'home';
    const ease = motion ? 1 - Math.exp(-Math.max(0, delta) * 10) : 1;
    lookX += ((engaged ? Math.max(-1, Math.min(1, state.attention.x)) : 0) - lookX) * ease;
    lookY += ((engaged ? Math.max(-1, Math.min(1, state.attention.y)) : 0) - lookY) * ease;
    const happy = state.mood === 'purring' || state.mood === 'home';
    const sleeping = state.mood === 'sleeping';
    const grumpy = state.mood === 'irritated';
    const typing = state.mood === 'mimicking';
    const walking = motion && (state.moving || state.mood === 'walking') && !sleeping && !typing && !grumpy;
    const stride = walking ? Math.sin(time * 10) : 0;
    const breath = motion ? Math.sin(time * 2) * 0.012 : 0;
    torso.position.y = breath + Math.abs(stride) * 0.025;
    torso.rotation.y = lookX * 0.09;
    head.position.y = 1.63 + breath + Math.abs(stride) * 0.025 - (sleeping ? 0.13 : 0);
    head.rotation.set(lookY * 0.22 + (sleeping ? 0.17 : typing ? 0.09 + Math.sin(time * 4) * 0.025 : 0),
      lookX * 0.48, grumpy ? -0.095 : happy ? Math.sin(time * 1.6) * 0.035 : -lookX * 0.035);
    tail.rotation.z = motion ? Math.sin(time * (grumpy ? 11 : 2)) * (grumpy ? 0.35 : 0.06) : 0;
    const blink = Math.min(1, Math.abs((time % 5.2) - 5.05) / 0.09);
    eyes.forEach((eye, index) => {
      const side = index === 0 ? -1 : 1;
      eye.socket.visible = !happy && !sleeping;
      eye.closed.visible = happy || sleeping;
      eye.socket.scale.y = Math.max(0.045, blink * (grumpy ? 0.68 : 1));
      eye.gaze.position.set(lookX * 0.055, -lookY * 0.06, 0);
      eye.brow.rotation.z = grumpy ? side * 0.4 : typing ? -side * 0.08 : side * -0.06;
      eye.brow.position.y = grumpy ? 0.315 : 0.405;
    });
    ears.forEach((ear, index) => {
      const side = index === 0 ? -1 : 1;
      ear.rotation.z = side * (grumpy ? -0.56 : sleeping ? -0.38 : -0.24);
    });
    smile.visible = !grumpy && !state.speaking && state.mood !== 'hungry';
    frown.visible = grumpy && !state.speaking;
    mouth.visible = state.speaking || state.mood === 'hungry';
    mouth.scale.y = state.speaking ? 0.075 * (motion ? 0.3 + Math.abs(Math.sin(time * 12)) * 0.8 : 0.5) : 0.075;
    arms.forEach((arm, index) => {
      const side = index === 0 ? -1 : 1;
      arm.rotation.x = typing ? -0.8 + (motion ? Math.sin(time * 15 + index * Math.PI) * 0.16 : 0) : stride * side * 0.32;
      arm.rotation.z = typing ? side * 0.12 : 0;
      arm.position.y = grumpy && index === 1 && motion ? 0.89 + Math.max(0, Math.sin(time * 8)) * 0.13 : 0.89;
    });
    feet.forEach((foot, index) => { foot.position.z = 0.24 + stride * (index === 0 ? -1 : 1) * 0.1; });
    laptop.visible = typing;
    ball.visible = state.mood === 'playing';
    ball.position.y = 0.17 + (motion ? Math.abs(Math.sin(time * 5)) * 0.22 : 0);
    hearts.visible = happy && !sleeping;
    hearts.position.y = motion ? Math.sin(time * 2.5) * 0.045 : 0;
    sleep.visible = sleeping;
    root.rotation.z = state.mood === 'playing' && motion ? Math.sin(time * 4) * 0.045 : 0;
  }

  function dispose(): void {
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
  }
  return { root, head, eyes, arms, ears, mouth, smile, frown, laptop, ball, hearts, sleep, pose, setCoat, coatMaterials: { fur, markings }, dispose };
}
