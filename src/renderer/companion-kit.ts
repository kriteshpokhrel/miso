import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFAULT_SETTINGS, IDLE_MOTION, type CoatColors } from '../shared/contracts.js';
import type { CharacterPose } from './pet-model.js';

type Triple = [number, number, number];

export function createCompanionKit() {
  const root = new THREE.Group();
  const character = new THREE.Group();
  character.name = 'character';
  root.add(character);
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const material = (color: string, roughness = 0.54): THREE.MeshPhysicalMaterial => {
    const result = new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 0.2 });
    materials.add(result);
    return result;
  };
  const fur = material(DEFAULT_SETTINGS.coatColor);
  const accent = material(DEFAULT_SETTINGS.accentColor);
  const ink = material('#302d3b', 0.35);
  const white = material('#fff8ef');
  const pink = material('#e99b9c');
  const mint = material('#80b5a2');
  function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, surface);
    parent.add(result);
    return result;
  }
  function oval(parent: THREE.Object3D, surface: THREE.Material, position: Triple, scale: Triple): THREE.Mesh {
    const result = mesh(new THREE.SphereGeometry(1, 24, 18), surface, parent);
    result.position.set(...position);
    result.scale.set(...scale);
    return result;
  }
  function line(parent: THREE.Object3D, surface: THREE.Material, points: Triple[], radius = 0.018): THREE.Mesh {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), 24, radius, 8), surface, parent);
  }
  function face(parent: THREE.Object3D, spacing = 0.31, z = 0.52, size = 1) {
    const iris = material('#54428b', 0.2);
    const pupils = material('#171629', 0.12);
    const eyes = [-1, 1].map(side => {
      const socket = new THREE.Group();
      socket.position.set(side * spacing, 0.015, z);
      socket.name = side < 0 ? 'eye-left' : 'eye-right';
      parent.add(socket);
      oval(socket, white, [0, 0, 0], [0.225 * size, 0.26 * size, 0.125]);
      const gaze = new THREE.Group();
      socket.add(gaze);
      oval(gaze, iris, [0, 0, 0.1], [0.161 * size, 0.205 * size, 0.068]);
      oval(gaze, pupils, [0, 0, 0.155], [0.097 * size, 0.145 * size, 0.025]);
      oval(gaze, white, [-0.047 * size, 0.08 * size, 0.182], [0.045, 0.052, 0.015]);
      oval(gaze, white, [0.04 * size, -0.06 * size, 0.181], [0.019, 0.022, 0.012]);
      const closed = line(parent, ink, [[side * spacing - 0.15 * size, 0.015, z + 0.13],
        [side * spacing, 0.06, z + 0.15], [side * spacing + 0.15 * size, 0.015, z + 0.13]], 0.023);
      closed.name = side < 0 ? 'closed-eye-left' : 'closed-eye-right';
      const brow = line(parent, ink, [[-0.13, 0, 0], [0, 0.035, 0.01], [0.13, 0, 0]], 0.023);
      brow.position.set(side * spacing, 0.31 * size, z - 0.03);
      return { socket, gaze, closed, brow, side };
    });
    const smile = line(parent, ink, [[-0.13, -0.32, z + 0.08], [0, -0.38, z + 0.12], [0.13, -0.32, z + 0.08]], 0.018);
    const frown = line(parent, ink, [[-0.12, -0.37, z + 0.08], [0, -0.32, z + 0.12], [0.12, -0.37, z + 0.08]], 0.019);
    smile.name = 'smile';
    frown.name = 'frown';
    const mouth = oval(parent, ink, [0, -0.35, z + 0.12], [0.075, 0.09, 0.025]);
    mouth.name = 'mouth';
    const tongue = oval(mouth, pink, [0, -0.35, 0.45], [0.65, 0.4, 0.6]);
    let previousMood = '';
    let moodStarted = 0;
    return { eyes, mouth, smile, frown, tongue, pose(state: CharacterPose, time: number, lookX: number, lookY: number): void {
      const scared = state.motion?.state === 'falling';
      const asleep = state.mood === 'sleeping' && !scared;
      const happy = state.mood === 'purring' && !scared;
      const angry = state.mood === 'irritated' && !scared;
      if (previousMood !== state.mood) { previousMood = state.mood; moodStarted = time; }
      const blink = Math.min(1, Math.abs(time % 5.2 - 5.05) / 0.085);
      const yawning = state.mood === 'yawning';
      for (const eye of eyes) {
        eye.socket.visible = !(asleep || happy || yawning);
        eye.closed.visible = asleep || happy || yawning;
        eye.socket.scale.y = Math.max(0.045, blink * (angry ? 0.6 : scared ? 1.08 : 1));
        eye.gaze.position.set(lookX * 0.045, -lookY * 0.045, 0);
        eye.brow.rotation.z = angry ? eye.side * 0.38 : scared ? -eye.side * 0.32 : -eye.side * 0.06;
      }
      mouth.visible = !asleep && (Boolean(scared) || state.speaking || state.mood === 'eating' || yawning || state.mood === 'hungry');
      smile.visible = !mouth.visible && !angry && !asleep;
      frown.visible = angry && !mouth.visible;
      const yawn = state.reducedMotion ? 0.8 : Math.sin(Math.min(1, Math.max(0, (time - moodStarted) / 4.5)) * Math.PI);
      mouth.scale.y = yawning ? 0.015 + yawn * 0.18 : scared ? 0.14 : 0.04 + Math.abs(Math.sin(time * 10)) * 0.05;
      tongue.visible = !scared && !yawning;
    } };
  }

  const laptop = new THREE.Group();
  laptop.name = 'laptop';
  laptop.position.set(0, 0.14, 0.95);
  laptop.scale.setScalar(0.82);
  character.add(laptop);
  mesh(new RoundedBoxGeometry(1.05, 0.06, 0.55, 2, 0.025), mint, laptop);
  const lid = mesh(new RoundedBoxGeometry(1.02, 0.63, 0.06, 2, 0.035), mint, laptop);
  lid.position.set(0, 0.3, -0.18);
  lid.rotation.x = -0.16;
  oval(laptop, white, [0, 0.33, -0.12], [0.075, 0.08, 0.02]);
  const keyboard = mesh(new RoundedBoxGeometry(0.78, 0.012, 0.24, 2, 0.01), ink, laptop);
  keyboard.position.set(0, 0.038, 0.08);

  const bowl = new THREE.Group();
  bowl.name = 'food';
  bowl.position.set(0, 0.12, 0.97);
  character.add(bowl);
  mesh(new THREE.CylinderGeometry(0.33, 0.25, 0.16, 28), mint, bowl);
  oval(bowl, material('#ba8654'), [0, 0.085, 0], [0.29, 0.025, 0.29]);
  const rim = mesh(new THREE.TorusGeometry(0.33, 0.035, 8, 28), mint, bowl);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.08;
  const ball = oval(character, pink, [0.8, 0.16, 0.7], [0.16, 0.16, 0.16]);
  ball.name = 'ball';
  const hearts = new THREE.Group();
  hearts.name = 'hearts';
  character.add(hearts);
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-0.2, 0.15, -0.08, 0.32, 0, 0.2);
    shape.bezierCurveTo(0.08, 0.32, 0.2, 0.15, 0, 0);
    const heart = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false }), pink, hearts);
    heart.position.set(side * 0.96, side < 0 ? 1.9 : 2.15, 0.1);
    heart.rotation.z = -side * 0.2;
  }
  const sleep = new THREE.Group();
  sleep.name = 'sleep';
  character.add(sleep);
  line(sleep, white, [[0.8, 1.4, 0.2], [1, 1.4, 0.2], [0.8, 1.2, 0.2], [1, 1.2, 0.2]], 0.025);
  line(sleep, white, [[1.02, 1.65, 0.1], [1.18, 1.65, 0.1], [1.02, 1.49, 0.1], [1.18, 1.49, 0.1]], 0.021);
  const house = new THREE.Group();
  house.name = 'home';
  root.add(house);
  const wall = new THREE.Shape();
  wall.moveTo(-0.75, 0); wall.lineTo(-0.75, 1.65); wall.lineTo(0.75, 1.65); wall.lineTo(0.75, 0);
  wall.lineTo(0.52, 0); wall.lineTo(0.52, 1.03);
  wall.bezierCurveTo(0.52, 1.8, -0.52, 1.8, -0.52, 1.03); wall.lineTo(-0.52, 0); wall.closePath();
  const walls = mesh(new THREE.ExtrudeGeometry(wall, { depth: 0.48, bevelEnabled: false }), white, house);
  walls.position.z = -0.3;
  const roof = new THREE.Shape();
  roof.moveTo(-0.88, 1.62); roof.lineTo(0, 2.3); roof.lineTo(0.88, 1.62); roof.closePath();
  const rooftop = mesh(new THREE.ExtrudeGeometry(roof, { depth: 0.65, bevelEnabled: false }), mint, house);
  rooftop.position.z = -0.39;
  const back = mesh(new RoundedBoxGeometry(1.4, 1.6, 0.08, 2, 0.025), ink, house);
  back.position.set(0, 0.8, -0.45);
  house.scale.setScalar(1.15);

  let lookX = 0;
  let lookY = 0;
  let sleepBlend = 0;
  let eatBlend = 0;
  let walkBlend = 0;
  let restBlend = 0;
  function update(state: CharacterPose, elapsed: number, delta = 1 / 30) {
    const dt = Math.max(0, Math.min(0.1, delta));
    const time = state.reducedMotion ? 0 : elapsed;
    const ease = state.reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
    const movement = state.motion ?? IDLE_MOTION;
    const home = movement.state.startsWith('home-');
    const entering = movement.state === 'home-entering';
    const leaving = movement.state === 'home-leaving';
    const progress = Math.max(0, Math.min(1, movement.progress));
    const falling = movement.state === 'falling';
    const jumping = movement.state === 'hopping';
    const flight = jumping && progress > 0.16 && progress < 0.84;
    const compression = jumping ? progress <= 0.16 ? Math.sin(progress / 0.16 * Math.PI / 2)
      : progress >= 0.84 ? Math.sin((progress - 0.84) / 0.16 * Math.PI) : 0 : 0;
    const airborne = falling || movement.state === 'hopping' || movement.state === 'dragging';
    const sleeping = state.mood === 'sleeping' && !airborne;
    const typing = state.mood === 'mimicking' && !airborne;
    const eating = state.mood === 'eating' && !airborne;
    const walking = !state.reducedMotion && !sleeping && !typing && !airborne
      && (movement.state === 'walking' || state.moving || entering);
    const engaged = !state.reducedMotion && !sleeping && !home && !airborne && state.attention.nearby;
    lookX += ((engaged ? THREE.MathUtils.clamp(state.attention.x, -1, 1) : 0) - lookX) * ease;
    lookY += ((engaged ? THREE.MathUtils.clamp(state.attention.y, -1, 1) : 0) - lookY) * ease;
    sleepBlend += ((sleeping ? 1 : 0) - sleepBlend) * (state.reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
    eatBlend += ((eating ? 1 : 0) - eatBlend) * ease;
    walkBlend += ((walking ? 1 : 0) - walkBlend) * ease;
    restBlend += ((sleeping || state.mood === 'relaxing' ? 1 : 0) - restBlend) * ease;
    const turn = entering ? THREE.MathUtils.clamp((progress - 0.55) / 0.15, 0, 1) : 0;
    const facing = entering ? 1.22 + turn * (Math.PI - 1.22) : walking || home || movement.state === 'hopping' ? movement.direction * 1.22 : 0;
    character.rotation.y += (facing - character.rotation.y) * ease;
    character.position.set(home ? entering ? -1.2 + Math.min(1, progress / 0.55) * 2.85 : leaving ? 1.65 : -1.2 : 0,
      home ? 0.12 : 0, home ? 0.8 - (entering ? Math.max(0, (progress - 0.7) / 0.3) * 1.5 : 0) : 0);
    character.scale.setScalar(entering ? 1 - turn * 0.2 : 1);
    character.visible = !leaving && !(entering && progress > 0.97);
    house.visible = home;
    house.position.set(1.65 + (leaving ? progress ** 2 * 3 : movement.state === 'home-arriving' ? (1 - progress) ** 2 * 2.7 : 0), 0, 0);
    laptop.visible = typing;
    bowl.visible = eating;
    ball.visible = state.mood === 'playing' && !airborne;
    ball.position.set(Math.sin(time * 3) * 0.75, 0.16 + Math.abs(Math.sin(time * 4)) * 0.15, 0.8);
    hearts.visible = state.mood === 'purring' && !airborne;
    hearts.position.y = Math.sin(time * 2) * 0.04;
    sleep.visible = sleeping;
    sleep.position.y = Math.sin(time * 1.7) * 0.035;
    return { time, dt, ease, movement, home, walking, falling, airborne, sleeping, typing, eating, flight, compression,
      sleep: sleepBlend, eat: eatBlend, walk: walkBlend, rest: restBlend, lookX, lookY };
  }
  function setAppearance(colors: CoatColors): void {
    fur.color.set(colors.coatColor);
    accent.color.set(colors.coatPattern === 'single' ? colors.coatColor : colors.accentColor);
  }
  function diagnostics() {
    return { lookX: lookX * 0.48, lookY: lookY * 0.22, facing: character.rotation.y,
      color: fur.color.getHexString(), accent: accent.color.getHexString(), foodVisible: bowl.visible, homeVisible: house.visible };
  }
  function dispose(): void {
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
  }
  return { root, character, material, mesh, oval, line, face, fur, accent, ink, white, pink, mint,
    laptop, bowl, ball, hearts, sleep, house, update, setAppearance, diagnostics, dispose };
}
