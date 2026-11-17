import * as THREE from 'three';
import { createCatModel } from './cat-model.js';
import type { Attention, Snapshot } from '../shared/contracts.js';

export function createPetScene(canvas: HTMLCanvasElement, onError: (message: string | null) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.67, 1.67, 1.41, -1.41, 0.1, 30);
  camera.position.set(0, 2.65, 8);
  camera.lookAt(0, 1.38, 0);
  scene.add(new THREE.HemisphereLight('#fff4e8', '#8e79b1', 2.4));
  const key = new THREE.DirectionalLight('#fff0df', 3.3);
  key.position.set(-3, 5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -1;
  key.shadow.normalBias = 0.04;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#c8c0ff', 1.8);
  fill.position.set(4, 3, -1);
  scene.add(fill);
  const shadowGeometry = new THREE.PlaneGeometry(5, 4);
  const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.16, depthWrite: false });
  const floor = new THREE.Mesh(shadowGeometry, shadowMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  floor.receiveShadow = true;
  scene.add(floor);
  const cat = createCatModel();
  scene.add(cat.root);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state: Snapshot | undefined;
  let attention: Attention = { x: 0, y: 0, nearby: false };
  let frame = 0;
  let previousTime = 0;
  let lost = false;
  let disposed = false;

  function render(time: number): void {
    if (!state || lost || disposed) return;
    const delta = Math.min(0.1, previousTime ? (time - previousTime) / 1000 : 1 / 30);
    previousTime = time;
    try {
      cat.pose({
        mood: state.pet.mood, moving: state.moving, speaking: Boolean(state.comment),
        reducedMotion: state.settings.reducedMotion || preference.matches, attention,
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
    canvas.dataset.lookX = cat.head.rotation.y.toFixed(3);
    canvas.dataset.lookY = cat.head.rotation.x.toFixed(3);
    canvas.dataset.expression = state.pet.mood;
  }
  function animate(time: number): void {
    frame = 0;
    if (disposed || lost || document.hidden || !state) return;
    if (time - previousTime >= 1000 / 30) render(time);
    if (!state.settings.reducedMotion && !preference.matches) frame = requestAnimationFrame(animate);
  }
  function refresh(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (!document.hidden && !lost && !disposed) {
      render(performance.now());
      if (state && !state.settings.reducedMotion && !preference.matches) frame = requestAnimationFrame(animate);
    }
  }
  function resize(): void {
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
      const wasReduced = state?.settings.reducedMotion;
      const wasHome = state?.pet.atHome;
      state = next;
      attention = next.attention;
      if (!frame || wasReduced !== next.settings.reducedMotion || wasHome !== next.pet.atHome) refresh();
    },
    look(next: Attention): void { attention = next; },
    dispose(): void {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      preference.removeEventListener('change', refresh);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      cat.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      renderer.dispose();
    },
  };
}
