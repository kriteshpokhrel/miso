import { createPetScene } from './pet-scene.js';
import type { PetMotion } from '../shared/contracts.js';

const view = new URLSearchParams(location.search).get('view');
if (view === 'settings') {
  const canvas = document.getElementById('coat-preview');
  const error = document.getElementById('coat-preview-error');
  if (!(canvas instanceof HTMLCanvasElement) || !error) throw new Error('The coat preview canvas is missing.');
  let scene: ReturnType<typeof createPetScene> | undefined;
  const report = (message: string | null): void => {
    error.textContent = message;
    error.hidden = !message;
  };
  const update = (event: WindowEventMap['miso:coat-preview']): void => {
    if (!event.detail.active && !scene) return;
    try {
      if (!scene) scene = createPetScene(canvas, report);
      scene.setActive(event.detail.active);
      scene.update(event.detail.snapshot);
    } catch (reason) {
      console.error('Miso coat preview failed:', reason);
      report('The 3D preview needs WebGL 2 graphics. Check your graphics driver and reopen Settings. Your color choices can still be saved.');
    }
  };
  window.addEventListener('miso:coat-preview', update);
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('miso:coat-preview', update);
    scene?.dispose();
  }, { once: true });
} else if (view !== 'care' && view !== 'speech') {
  const canvas = document.getElementById('pet-canvas');
  const error = document.getElementById('pet-render-error');
  if (!(canvas instanceof HTMLCanvasElement) || !error) throw new Error('The 3D pet canvas is missing.');
  const report = (message: string | null): void => {
    canvas.dataset.renderError = message ?? '';
    error.textContent = message;
    error.hidden = !message;
  };
  try {
    const scene = createPetScene(canvas, report);
    const move = (value: PetMotion): void => {
      document.body.dataset.homeStage = String(value.state.startsWith('home-'));
      document.body.dataset.compactPerch = String((value.topInset ?? 64) < 63.99);
      document.body.style.setProperty('--pet-top', `${value.topInset ?? 64}px`);
      scene.move(value);
    };
    let updates = 0;
    const update = (snapshot: Awaited<ReturnType<typeof window.miso.getSnapshot>>): void => {
      scene.setActive(!snapshot.careMenuOpen);
      move(snapshot.motion);
      scene.update(snapshot);
    };
    const unsubscribe = window.miso.onSnapshot(snapshot => { updates++; update(snapshot); });
    const stopLooking = window.miso.onAttention(value => scene.look(value));
    const stopMoving = window.miso.onMotion(move);
    void window.miso.getSnapshot().then(snapshot => { if (!updates) update(snapshot); }).catch(reason => {
      report(`Miso could not load its 3D state: ${reason instanceof Error ? reason.message : String(reason)}`);
    });
    window.addEventListener('beforeunload', () => { unsubscribe(); stopLooking(); stopMoving(); scene.dispose(); }, { once: true });
  } catch (reason) {
    console.error('Miso 3D renderer failed:', reason);
    report(`Miso needs WebGL 2 graphics to appear. Check your graphics driver or hardware acceleration, then restart. ${reason instanceof Error ? reason.message : ''}`);
  }
}
