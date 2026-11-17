import * as THREE from 'three';
import { createPetModel } from './pet-models.js';
import type { Attention, PetMotion, Snapshot } from '../shared/contracts.js';
import { IDLE_MOTION } from '../shared/contracts.js';
import { DEFAULT_SPECIES, type SpeciesId } from '../shared/species.js';

export function createPetScene(canvas: HTMLCanvasElement, onError: (message: string | null) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.67, 1.67, 1.41, -1.41, 0.1, 30);
  camera.position.set(0, 2.65, 8);
  camera.lookAt(0, 1.38, 0);
  scene.add(new THREE.HemisphereLight('#fff4e8', '#8e79b1', 2.4));
  const key = new THREE.DirectionalLight('#fff0df', 3.3);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#c8c0ff', 1.8);
  fill.position.set(4, 3, -1);
  scene.add(fill);
  let species: SpeciesId = DEFAULT_SPECIES;
  let model = createPetModel(species);
  scene.add(model.root);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state: Snapshot | undefined;
  let attention: Attention = { x: 0, y: 0, nearby: false };
  let frame = 0;
  let previousTime = 0;
  let lost = false;
  let disposed = false;
  let active = true;
  let movement: PetMotion = { ...IDLE_MOTION };
  const reduced = (): boolean => Boolean(state && (state.settings.motionLevel === 'still' || state.systemReducedMotion || preference.matches));

  function render(time: number): void {
    if (!state || lost || disposed || !active) return;
    const delta = Math.min(0.1, previousTime ? (time - previousTime) / 1000 : 1 / 30);
    previousTime = time;
    try {
      model.pose({
        mood: state.pet.mood, moving: movement.state === 'walking', speaking: Boolean(state.comment),
        reducedMotion: reduced(), attention, motion: movement,
      }, time / 1000, delta);
      renderer.render(scene, camera);
    } catch (reason) {
      lost = true;
      canvas.dataset.ready = 'false';
      console.error('Nooki 3D frame failed:', reason);
      onError('Nooki could not draw its 3D scene. Restart Nooki and check your graphics driver.');
      return;
    }
    canvas.dataset.ready = 'true';
    const diagnostics = model.diagnostics();
    canvas.dataset.lookX = diagnostics.lookX.toFixed(3);
    canvas.dataset.lookY = diagnostics.lookY.toFixed(3);
    canvas.dataset.expression = state.pet.mood;
    canvas.dataset.coatColor = diagnostics.color;
    canvas.dataset.accentColor = diagnostics.accent;
    canvas.dataset.motion = movement.state;
    canvas.dataset.house = String(diagnostics.homeVisible);
    canvas.dataset.eating = String(diagnostics.foodVisible);
    canvas.dataset.facing = diagnostics.facing.toFixed(3);
  }
  function animate(time: number): void {
    frame = 0;
    if (disposed || lost || document.hidden || !state || !active) return;
    if (time - previousTime >= 1000 / 30) render(time);
    if (!reduced()) frame = requestAnimationFrame(animate);
  }
  function refresh(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (!document.hidden && !lost && !disposed && active) {
      render(performance.now());
      if (state && !reduced()) frame = requestAnimationFrame(animate);
    }
  }
  function resize(): void {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    camera.left = -1.41 * canvas.clientWidth / canvas.clientHeight;
    camera.right = -camera.left;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    refresh();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  document.addEventListener('visibilitychange', refresh);
  preference.addEventListener('change', refresh);
  const contextLost = (event: Event): void => {
    event.preventDefault();
    lost = true;
    if (frame) cancelAnimationFrame(frame);
    canvas.dataset.ready = 'false';
    onError('Nooki lost its 3D graphics context. Waiting for the graphics driver to restore it.');
  };
  const contextRestored = (): void => {
    lost = false;
    onError(null);
    resize();
  };
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  resize();
  return {
    update(next: Snapshot): void {
      const wasReduced = reduced();
      const wasHome = state?.pet.atHome;
      state = next;
      if (species !== next.pet.species) {
        const replacement = createPetModel(next.pet.species);
        scene.remove(model.root);
        model.dispose();
        model = replacement;
        species = next.pet.species;
        scene.add(model.root);
      }
      movement = next.motion;
      model.setAppearance(next.settings);
      attention = next.attention;
      if (!frame || wasReduced !== reduced() || wasHome !== next.pet.atHome) refresh();
    },
    look(next: Attention): void { attention = next; },
    move(next: PetMotion): void { movement = next; },
    setActive(next: boolean): void {
      if (active === next) return;
      active = next;
      refresh();
    },
    dispose(): void {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      preference.removeEventListener('change', refresh);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      model.dispose();
      renderer.dispose();
    },
  };
}
