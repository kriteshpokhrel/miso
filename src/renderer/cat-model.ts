import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CoatColors } from '../shared/contracts.js';
import { DEFAULT_SETTINGS, IDLE_MOTION } from '../shared/contracts.js';
import { legJoint, pawStep, walkBob, WALK_CYCLE_PIXELS, WALK_YAW } from './cat-gait.js';
import { ContinuousLeg } from './cat-leg.js';
import type { CharacterPose } from './pet-model.js';
export type { CharacterPose } from './pet-model.js';

export function createCatModel() {
  const root = new THREE.Group();
  const character = new THREE.Group();
  root.add(character);
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
  character.add(torso);
  const body = oval(torso, fur, [0, 0.67, 0], [0.61, 0.67, 0.46]);
  const chest = oval(torso, markings, [0, 0.66, 0.353], [0.37, 0.48, 0.15]);
  const feet = [-1, 1].map(side => oval(torso, fur, [side * 0.34, 0.15, 0.24], [0.28, 0.17, 0.34]));
  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.48, 0.89, 0.23);
    torso.add(pivot);
    oval(pivot, fur, [0, -0.26, 0.08], [0.18, 0.37, 0.2]);
    oval(pivot, markings, [0, -0.49, 0.13], [0.18, 0.13, 0.19]);
    return pivot;
  });
  const legs = [0, 0.5, 0.75, 0.25].map((offset, index) => {
    const group = new THREE.Group();
    torso.add(group);
    const hip = new THREE.Vector3(index % 2 ? 0.33 : -0.33, 0.74, index < 2 ? 0.46 : -0.62);
    const surface = new ContinuousLeg(fur);
    group.add(surface.mesh);
    geometries.push(surface.geometry);
    const foot = oval(group, markings, [hip.x, 0.12, hip.z], [0.17, 0.12, 0.23]);
    return { group, hip, surface, foot, offset, bend: index < 2 ? 1 as const : -1 as const };
  });
  const knee = new THREE.Vector3();
  const tail = new THREE.Group();
  tail.position.set(0.39, 0.37, -0.18);
  torso.add(tail);
  line(tail, [[0, 0, 0], [0.43, -0.02, -0.05], [0.79, 0.17, 0], [0.86, 0.54, 0], [0.65, 0.66, 0.02]], fur, 0.115);
  oval(tail, markings, [0.65, 0.66, 0.02], [0.12, 0.12, 0.12]);

  const head = new THREE.Group();
  head.position.set(0, 1.63, 0.035);
  character.add(head);
  oval(head, fur, [0, 0, 0], [0.92, 0.79, 0.64]);
  const ears = [-1, 1].map(side => {
    const ear = new THREE.Group();
    ear.position.set(side * 0.62, 0.58, -0.01);
    ear.rotation.z = side * -0.24;
    head.add(ear);
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, -0.22);
    shape.quadraticCurveTo(-0.15, 0.36, 0, 0.43);
    shape.quadraticCurveTo(0.12, 0.4, 0.3, -0.22);
    shape.quadraticCurveTo(0, -0.3, -0.3, -0.22);
    const outer = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.19, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.045, bevelSegments: 3, steps: 1 }), side === 1 ? markings : fur, ear);
    outer.position.z = -0.12;
    const inner = mesh(new THREE.ShapeGeometry(shape, 16), peach, ear);
    inner.scale.set(0.63, 0.64, 1);
    inner.position.set(0, -0.015, 0.12);
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
  character.add(laptop);
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

  const ball = oval(character, peach, [0.94, 0.16, 0.75], [0.17, 0.17, 0.17]);
  const bowl = new THREE.Group();
  bowl.position.set(0, 0.13, 1.05);
  character.add(bowl);
  const dish = mesh(new THREE.CylinderGeometry(0.36, 0.27, 0.16, 32, 1, true), mint, bowl);
  dish.position.y = -0.015;
  const rim = mesh(new THREE.TorusGeometry(0.36, 0.038, 8, 32), mint, bowl);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.065;
  oval(bowl, material('#9c694a'), [0, 0.01, 0], [0.31, 0.04, 0.31]);
  for (const [x, z] of [[-0.13, 0], [0.1, 0.11], [0.08, -0.14]]) oval(bowl, material('#c18b57'), [x!, 0.055, z!], [0.07, 0.045, 0.06]);
  const hearts = new THREE.Group();
  character.add(hearts);
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
  character.add(sleep);
  line(sleep, [[0.93, 2.2, 0.2], [1.14, 2.2, 0.2], [0.93, 2.0, 0.2], [1.14, 2.0, 0.2]], cream, 0.026);
  line(sleep, [[1.14, 2.53, 0], [1.3, 2.53, 0], [1.14, 2.38, 0], [1.3, 2.38, 0]], cream, 0.02);

  const house = new THREE.Group();
  root.add(house);
  const wall = new THREE.Shape();
  wall.moveTo(-0.75, 0); wall.lineTo(-0.75, 1.65); wall.lineTo(0.75, 1.65); wall.lineTo(0.75, 0);
  wall.lineTo(0.55, 0); wall.lineTo(0.55, 1.05);
  wall.bezierCurveTo(0.55, 1.85, -0.55, 1.85, -0.55, 1.05);
  wall.lineTo(-0.55, 0); wall.closePath();
  const walls = mesh(new THREE.ExtrudeGeometry(wall, { depth: 0.48, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, steps: 1 }), cream, house);
  walls.position.z = -0.3;
  const roof = new THREE.Shape();
  roof.moveTo(-0.88, 1.62); roof.lineTo(0, 2.3); roof.lineTo(0.88, 1.62); roof.closePath();
  const rooftop = mesh(new THREE.ExtrudeGeometry(roof, { depth: 0.65, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.025, bevelSegments: 2, steps: 1 }), mint, house);
  rooftop.position.z = -0.39;
  const back = mesh(new RoundedBoxGeometry(1.4, 1.6, 0.08, 2, 0.025), screen, house);
  back.position.set(0, 0.8, -0.45);
  oval(house, peach, [0, 1.85, 0.31], [0.1, 0.08, 0.025]);
  for (const x of [-0.1, 0, 0.1]) oval(house, peach, [x, 1.99, 0.31], [0.035, 0.045, 0.025]);
  house.scale.setScalar(1.15);

  let lookX = 0;
  let lookY = 0;
  let stridePhase = 0;
  let walkBlend = 0;
  let eatingBlend = 0;
  let restBlend = 0;
  let sleepBlend = 0;
  let lastMood = '';
  let moodStarted = 0;
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
    const movement = state.motion ?? IDLE_MOTION;
    if (lastMood !== state.mood) { lastMood = state.mood; moodStarted = elapsed; }
    const home = movement.state.startsWith('home-');
    const entering = movement.state === 'home-entering';
    const leaving = movement.state === 'home-leaving';
    const progress = movement.progress;
    const scared = movement.state === 'falling';
    const happy = !scared && state.mood === 'purring';
    const sleeping = !scared && state.mood === 'sleeping';
    sleepBlend += ((sleeping ? 1 : 0) - sleepBlend) * (motion ? 1 - Math.exp(-delta * 5) : 1);
    const grumpy = state.mood === 'irritated';
    const typing = !scared && state.mood === 'mimicking';
    const eating = !scared && state.mood === 'eating';
    eatingBlend += ((eating ? 1 : 0) - eatingBlend) * ease;
    const playing = state.mood === 'playing';
    const airborne = movement.state === 'hopping' || movement.state === 'dragging' || scared;
    const jumping = movement.state === 'hopping';
    const inFlight = jumping && progress > 0.16 && progress < 0.84;
    const crouch = jumping && progress <= 0.16 ? Math.sin(progress / 0.16 * Math.PI / 2) : 0;
    const landing = jumping && progress >= 0.84 ? Math.sin((progress - 0.84) / 0.16 * Math.PI) : 0;
    const compression = Math.max(crouch, landing) * 0.13;
    const resting = !airborne && !state.moving && (sleeping || state.mood === 'relaxing');
    restBlend += ((resting ? 1 : 0) - restBlend) * ease;
    const yawning = !airborne && state.mood === 'yawning';
    const yawn = yawning ? motion ? Math.sin(Math.min(1, (elapsed - moodStarted) / 4.5) * Math.PI) : 0.8 : 0;
    const approachingDoor = entering && progress < 0.55;
    const crossingDoor = entering && progress > 0.7;
    const walking = motion && (movement.state === 'walking' || approachingDoor || crossingDoor || state.moving) && !sleeping && !typing && !airborne;
    walkBlend += ((walking || home ? 1 : 0) - walkBlend) * (1 - Math.exp(-delta * 9));
    if (!motion || airborne) walkBlend = 0;
    if (walking) stridePhase += delta * (entering ? approachingDoor ? 2.85 / 1.65 / 0.6 : 1.5 / 0.9 / 0.6 : movement.speed / WALK_CYCLE_PIXELS);
    const stride = walking ? Math.sin(stridePhase * Math.PI * 4) : 0;
    const walkLift = walkBob(stridePhase) * walkBlend;
    const doorwayTurn = entering ? Math.min(1, Math.max(0, (progress - 0.55) / 0.15)) : 0;
    const targetFacing = entering ? WALK_YAW + doorwayTurn * (Math.PI - WALK_YAW) : walking || home || jumping ? movement.direction * WALK_YAW : 0;
    character.rotation.y += (targetFacing - character.rotation.y) * ease;
    character.position.set(home ? entering ? -1.2 + Math.min(1, progress / 0.55) * 2.85 : leaving ? 1.65 : -1.2 : 0,
      home ? 0.12 : 0, home ? 0.8 - (entering ? Math.max(0, (progress - 0.7) / 0.3) * 1.5 : 0) : 0);
    character.scale.setScalar(entering ? 1 - doorwayTurn * 0.2 : 1);
    character.visible = !leaving && !(entering && progress > 0.97);
    house.visible = home;
    house.position.set(1.65 + (leaving ? progress * progress * 3 : movement.state === 'home-arriving' ? (1 - progress) ** 2 * 2.7 : 0), 0, 0);
    const breath = motion ? Math.sin(time * 2) * (0.012 - walkBlend * 0.008) : 0;
    body.position.set(-sleepBlend * 0.35, 0.67 + walkBlend * 0.25 + breath + walkLift * 0.008 - restBlend * 0.13 - sleepBlend * 0.13 - compression * 0.4, -walkBlend * 0.12);
    body.scale.set(0.61 - walkBlend * 0.15 + restBlend * 0.035 + sleepBlend * 0.1, 0.67 - walkBlend * 0.17 - restBlend * 0.15 - sleepBlend * 0.12 - compression, 0.46 + walkBlend * 0.29 + restBlend * 0.07 + sleepBlend * 0.1);
    chest.position.set(-sleepBlend * 0.35, 0.66 + walkBlend * 0.17 + breath + walkLift * 0.008 - restBlend * 0.11 - sleepBlend * 0.13 - compression * 0.35, 0.353 + walkBlend * 0.17);
    chest.scale.set(0.37 - walkBlend * 0.06, 0.48 - walkBlend * 0.1 - restBlend * 0.1 - compression * 0.6, 0.15);
    torso.rotation.y = lookX * 0.09;
    head.position.x = sleepBlend * 0.52;
    head.position.y = 1.63 + eatingBlend * (-0.58 + Math.sin(time * 5) * 0.035) + breath - walkBlend * 0.1
      + walkLift * 0.004 - restBlend * 0.23 - sleepBlend * 0.63 - compression * 0.9 + yawn * 0.07 - (entering ? doorwayTurn * 0.18 : 0);
    head.position.z = 0.035 + walkBlend * 0.4 + eatingBlend * 0.25;
    head.scale.setScalar(1 - walkBlend * 0.13 - sleepBlend * 0.18);
    head.rotation.set(lookY * 0.22 + eatingBlend * (0.65 + Math.sin(time * 5) * 0.035) + restBlend * 0.17 - yawn * 0.22 + (typing ? 0.09 + Math.sin(time * 4) * 0.025 : 0),
      lookX * 0.48 + (playing ? Math.sin(time * 3) * 0.18 : 0), grumpy ? -0.095 : happy ? Math.sin(time * 2.4) * 0.1 : -lookX * 0.035 - sleepBlend * 0.28);
    tail.position.set(0.39 - walkBlend * 0.31 - sleepBlend * 1.11, 0.37 + walkBlend * 0.35 - sleepBlend * 0.1, -0.18 - walkBlend * 0.6 + sleepBlend * 0.48);
    tail.rotation.z = sleepBlend + (motion ? Math.sin(time * (grumpy ? 11 : 2)) * (grumpy ? 0.35 : 0.06) : 0);
    tail.rotation.y = restBlend * 0.75;
    const blink = Math.min(1, Math.abs((time % 5.2) - 5.05) / 0.09);
    eyes.forEach((eye, index) => {
      const side = index === 0 ? -1 : 1;
      eye.socket.visible = !happy && !sleeping && yawn < 0.3;
      eye.closed.visible = happy || sleeping || yawn >= 0.3;
      eye.socket.scale.y = Math.max(0.045, (scared ? 1.08 : blink) * (grumpy ? 0.68 : 1 - restBlend * 0.3));
      eye.gaze.position.set(lookX * 0.055, -lookY * 0.06, 0);
      eye.brow.rotation.z = scared ? -side * 0.3 : grumpy ? side * 0.4 : typing ? -side * 0.08 : side * -0.06;
      eye.brow.position.y = scared ? 0.48 : grumpy ? 0.315 : 0.405;
    });
    ears.forEach((ear, index) => {
      const side = index === 0 ? -1 : 1;
      ear.rotation.z = side * (grumpy ? -0.56 : sleeping ? -0.38 : -0.24);
    });
    const snoring = sleeping && motion && Math.sin(time * 1.7) > 0.6;
    smile.visible = !scared && !grumpy && !state.speaking && !eating && !snoring && !yawning && state.mood !== 'hungry';
    frown.visible = grumpy && !state.speaking;
    mouth.visible = scared || state.speaking || eating || snoring || yawning || state.mood === 'hungry';
    mouth.scale.y = scared ? 0.12 : yawning ? 0.015 + yawn * 0.18 : snoring ? 0.04 : state.speaking || eating ? 0.075 * (motion ? 0.3 + Math.abs(Math.sin(time * (eating ? 8 : 12))) * 0.8 : 0.5) : 0.075;
    arms.forEach((arm, index) => {
      const side = index === 0 ? -1 : 1;
      arm.visible = walkBlend < 0.4;
      arm.rotation.x = jumping ? inFlight ? -1.05 : -Math.max(crouch, landing) * 0.35
        : airborne ? -0.45 : resting ? -0.55 + (sleeping || !motion ? 0 : Math.sin(time * 2 + index * Math.PI) * 0.12)
        : typing ? -0.8 + (motion ? Math.sin(time * 15 + index * Math.PI) * 0.16 : 0)
        : playing && motion ? -0.55 + Math.sin(time * 3 + index * Math.PI) * 0.5 : stride * side * 0.42;
      arm.rotation.z = scared ? side * (1.35 + Math.sin(time * 17 + index) * 0.18) : typing ? side * 0.12 : airborne ? side * 0.18 : playing ? side * -0.3 : 0;
      arm.rotation.x += sleepBlend * (-1.3 - arm.rotation.x);
      const armX = side * (0.48 - walkBlend * 0.15 - restBlend * 0.13);
      const armY = 0.89 - walkBlend * 0.27 - restBlend * 0.43 + Math.max(0, stride * side) * 0.08;
      arm.position.set(armX + sleepBlend * ((index === 0 ? 0.2 : 0.65) - armX), armY + sleepBlend * (0.22 - armY), 0.23 + walkBlend * 0.25 + sleepBlend * 0.17);
      if (grumpy && index === 1 && motion) arm.position.y += Math.max(0, Math.sin(time * 8)) * 0.13;
    });
    feet.forEach((foot, index) => {
      const step = stride * (index === 0 ? 1 : -1);
      foot.visible = walkBlend < 0.4;
      foot.position.z = 0.24 - walkBlend * 0.83;
      foot.position.x = (index === 0 ? -0.43 : 0.43) * (1 - sleepBlend) + (-0.58 + index * 0.3) * sleepBlend;
      foot.position.y = 0.15 + (jumping ? inFlight ? 0.16 : 0 : airborne ? 0.12 : 0);
      foot.rotation.x = airborne ? 0.35 : step * 0.15;
    });
    legs.forEach(leg => {
      const step = pawStep(walking ? stridePhase + leg.offset : 0.35);
      leg.group.visible = walkBlend >= 0.4;
      leg.foot.position.set(leg.hip.x, 0.12 + step.lift, leg.hip.z + step.forward);
      const joint = legJoint(leg.hip.y, leg.hip.z, leg.foot.position.y, leg.foot.position.z, leg.bend);
      knee.set(leg.hip.x, joint.y, joint.z);
      if (leg.group.visible) leg.surface.update(leg.hip, knee, leg.foot.position, leg.bend === 1);
    });
    laptop.visible = typing;
    bowl.visible = eating;
    ball.visible = playing;
    ball.position.x = motion ? Math.sin(time * 3) * 0.8 : 0.8;
    ball.position.y = 0.17 + (motion ? Math.abs(Math.sin(time * 5)) * 0.22 : 0);
    hearts.visible = happy && !sleeping;
    hearts.position.y = motion ? Math.sin(time * 2.5) * 0.045 : 0;
    sleep.visible = sleeping;
    sleep.position.y = -sleepBlend * 0.7 + (motion ? Math.sin(time * 1.7) * 0.06 : 0);
    sleep.scale.setScalar(motion ? 0.96 + Math.sin(time * 1.7) * 0.04 : 1);
    character.rotation.z = playing && motion ? Math.sin(time * 3) * 0.035 : airborne && grumpy && motion ? Math.sin(time * 12) * 0.07 : 0;
  }

  function dispose(): void {
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
  }
  function diagnostics() {
    return { lookX: head.rotation.y, lookY: head.rotation.x, facing: character.rotation.y, color: fur.color.getHexString(),
      accent: markings.color.getHexString(), foodVisible: bowl.visible, homeVisible: house.visible };
  }
  return { root, character, house, torso, head, eyes, arms, feet, legs, ears, mouth, smile, frown, laptop, ball, bowl, hearts, sleep, pose,
    setCoat, setAppearance: setCoat, diagnostics, coatMaterials: { fur, markings }, dispose };
}
