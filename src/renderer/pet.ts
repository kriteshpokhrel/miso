import { createPetScene } from './pet-scene.js';

if (new URLSearchParams(location.search).get('view') === 'settings') {
  const canvas = document.getElementById('coat-preview');
  const error = document.getElementById('coat-preview-error');
  if (!(canvas instanceof HTMLCanvasElement) || !error) throw new Error('The coat preview canvas is missing.');
  let scene: ReturnType<typeof createPetScene> | undefined;
  const report = (message: string | null): void => {
    error.textContent = message;
    error.hidden = !message;
  };
  const update = (event: WindowEventMap['nooki:coat-preview']): void => {
    if (!event.detail.active && !scene) return;
    try {
      if (!scene) scene = createPetScene(canvas, report, { preview: true });
      scene.setActive(event.detail.active);
      scene.update(event.detail.snapshot);
    } catch (reason) {
      console.error('Nooki coat preview failed:', reason);
      report('The 3D preview needs WebGL 2 graphics. Check your graphics driver and reopen Settings. Your color choices can still be saved.');
    }
  };
  window.addEventListener('nooki:coat-preview', update);
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('nooki:coat-preview', update);
    scene?.dispose();
  }, { once: true });
} else {
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
    let updates = 0;
    const unsubscribe = window.nooki.onSnapshot(snapshot => { updates++; scene.update(snapshot); });
    const stopLooking = window.nooki.onAttention(value => scene.look(value));
    void window.nooki.getSnapshot().then(snapshot => { if (!updates) scene.update(snapshot); }).catch(reason => {
      report(`Nooki could not load its 3D state: ${reason instanceof Error ? reason.message : String(reason)}`);
    });
    window.addEventListener('beforeunload', () => { unsubscribe(); stopLooking(); scene.dispose(); }, { once: true });
  } catch (reason) {
    console.error('Nooki 3D renderer failed:', reason);
    report(`Nooki needs WebGL 2 graphics to appear. Check your graphics driver or hardware acceleration, then restart. ${reason instanceof Error ? reason.message : ''}`);
  }
}
