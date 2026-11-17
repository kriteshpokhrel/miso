import type { CommentFrequency, NookiApi, Settings, Snapshot } from '../shared/contracts.js';

declare global {
  interface Window { nooki: NookiApi; }
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as T;
}

const isSettings = new URLSearchParams(location.search).get('view') === 'settings';
document.body.dataset.view = isSettings ? 'settings' : 'pet';
element(isSettings ? 'settings-view' : 'pet-view').hidden = false;
document.title = isSettings ? 'Nooki — Preferences' : 'Nooki';

const api = window.nooki;
const form = element<HTMLFormElement>('settings-form');
const saveButton = element<HTMLButtonElement>('save-button');
const saveStatus = element('save-status');
const appsInput = element<HTMLTextAreaElement>('allowed-apps');
const consent = element<HTMLInputElement>('download-consent');
const downloadButton = element<HTMLButtonElement>('download-button');
const cancelButton = element<HTMLButtonElement>('cancel-download-button');
const removeButton = element<HTMLButtonElement>('remove-model-button');
const cat = element('cat');
const inputs = {
  launchAtLogin: element<HTMLInputElement>('launch-at-login'),
  commentFrequency: element<HTMLSelectElement>('comment-frequency'),
  reducedMotion: element<HTMLInputElement>('reduced-motion'),
  aiEnabled: element<HTMLInputElement>('ai-enabled'),
  allowedApps: appsInput,
  petSize: element<HTMLSelectElement>('pet-size'),
  breakReminders: element<HTMLInputElement>('break-reminders'),
};
type SettingKey = keyof Settings;
let snapshot: Snapshot | undefined;
let draft: Settings | undefined;
let revision = 0;
const dirty = new Map<SettingKey, number>();
let saving = false;
let modelBusy: 'download' | 'cancel' | 'remove' | null = null;
let modelOperationVersion = 0;
let careBusy = false;
let snapshotEvents = 0;
let localError = '';

function showText(id: string, value: string): void {
  const target = element(id);
  if (target.textContent !== value) target.textContent = value;
}

function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

function renderError(): void {
  const message = localError || snapshot?.error || '';
  const target = element(isSettings ? 'settings-error' : 'pet-error');
  target.textContent = message;
  target.hidden = !message;
}

function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  return value >= 1_000_000_000 ? `${(value / 1_000_000_000).toFixed(2)} GB` : `${Math.ceil(value / 1_000_000)} MB`;
}

function validateApps(): string[] | null {
  const names = appsInput.value.split(/[\n,]/).map(name => name.trim()).filter(Boolean);
  const invalid = names.find(name => !/^[a-zA-Z0-9][a-zA-Z0-9 ._()+-]{0,79}$/.test(name));
  const error = names.length > 30
    ? 'Use 30 process names or fewer.'
    : invalid ? `“${invalid}” is not a process name. Use names such as Code.exe or Safari, not paths.` : '';
  showText('apps-error', error);
  element('apps-error').hidden = !error;
  appsInput.setAttribute('aria-invalid', String(Boolean(error)));
  return error ? null : [...new Set(names)];
}

function updateSaveState(): void {
  saveButton.disabled = saving || dirty.size === 0;
  saveButton.textContent = saving ? 'Saving…' : 'Save preferences';
}

function writeInput(key: SettingKey, settings: Settings): void {
  if (key === 'allowedApps') {
    appsInput.value = settings.allowedApps.join('\n');
  } else if (key === 'commentFrequency') {
    inputs.commentFrequency.value = settings.commentFrequency;
  } else if (key === 'petSize') {
    inputs.petSize.value = String(settings.petSize);
  } else {
    inputs[key].checked = settings[key];
  }
}

function syncSettings(next: Settings): void {
  if (!draft) draft = { ...next, allowedApps: [...next.allowedApps] };
  for (const key of Object.keys(inputs) as SettingKey[]) {
    // Background snapshots must never replace a field the user is editing.
    if (dirty.has(key)) continue;
    if (key === 'allowedApps') draft.allowedApps = [...next.allowedApps];
    else if (key === 'commentFrequency') draft.commentFrequency = next.commentFrequency;
    else if (key === 'petSize') draft.petSize = next.petSize;
    else draft[key] = next[key];
    writeInput(key, next);
  }
  updateSaveState();
}

function renderPet(next: Snapshot): void {
  const mood = next.pet.mood;
  cat.dataset.mood = mood;
  cat.dataset.moving = String(next.moving);
  const activity = mood === 'home' ? 'going home' : mood === 'mimicking' ? 'pretending to work on a tiny laptop' : mood === 'irritated' ? 'theatrically grumpy' : mood;
  cat.setAttribute('aria-label', `Nooki, a lilac cat, is ${activity}. Open care menu.`);
  const speech = mood === 'home' ? 'Heading home. See you soon!' : next.comment || '';
  showText('speech', speech);
  element('speech').hidden = !speech;
  cat.dataset.speaking = String(Boolean(next.comment));
  const atHome = next.pet.atHome || mood === 'home';
  cat.setAttribute('aria-busy', String(careBusy));
  cat.setAttribute('aria-disabled', String(atHome));
}

function renderModel(next: Snapshot): void {
  const { model, modelInfo } = next;
  const phases = { 'not-installed': 'Not downloaded', downloading: 'Downloading', ready: 'Ready on this device', loading: 'Loading', error: 'Needs attention' };
  showText('model-phase', phases[model.phase]);
  showText('model-name', modelInfo.name);
  showText('model-size', `${bytes(modelInfo.sizeBytes)} (${modelInfo.sizeBytes.toLocaleString('en-US')} bytes) · stored on this device`);
  showText('model-license', modelInfo.license);
  showText('model-license-url', modelInfo.licenseUrl);
  showText('model-source', modelInfo.sourceUrl);
  showText('model-resources', modelInfo.resourceNote);
  const downloading = model.phase === 'downloading';
  const installed = model.phase === 'ready' || model.phase === 'loading';
  element('model-progress-area').hidden = !downloading;
  const progress = element<HTMLProgressElement>('model-progress');
  if (model.totalBytes > 0) progress.value = Math.min(100, model.downloadedBytes / model.totalBytes * 100);
  else progress.removeAttribute('value');
  showText('progress-text', `${bytes(model.downloadedBytes)} of ${model.totalBytes > 0 ? bytes(model.totalBytes) : 'unknown size'} downloaded`);
  const modelError = model.error || '';
  showText('model-error', modelError);
  element('model-error').hidden = !modelError;
  element('consent-label').hidden = downloading || installed;
  downloadButton.hidden = downloading || installed;
  downloadButton.disabled = !consent.checked || modelBusy !== null;
  downloadButton.textContent = model.phase === 'error' ? 'Retry download' : 'Download model';
  cancelButton.hidden = !downloading;
  cancelButton.disabled = modelBusy === 'cancel' || modelBusy === 'remove';
  removeButton.hidden = !(installed || model.phase === 'error');
  removeButton.disabled = modelBusy !== null;
  consent.disabled = modelBusy !== null;
  if (downloading && modelBusy === 'download') showText('model-action-status', '');
  showText('mode-label', next.settings.aiEnabled && model.phase === 'ready' ? 'Local AI enabled' : 'Scripted companion');
  showText('ai-note', next.settings.aiEnabled && model.phase !== 'ready'
    ? 'Enabled in preferences. Scripted comments continue until the model is ready.'
    : 'Off by default. Requires the optional model below.');
}

function receive(next: Snapshot): void {
  const firstSnapshot = !snapshot;
  snapshot = next;
  document.body.classList.toggle('reduce-motion', next.settings.reducedMotion);
  if (isSettings) {
    if (firstSnapshot) form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(control => { control.disabled = false; });
    syncSettings(next.settings);
    showText('presence-text', next.pet.atHome ? 'Nooki is resting at home. Needs and comments are paused.' : `Nooki is ${next.pet.mood === 'idle' ? 'keeping you company' : next.pet.mood}.`);
    showText('login-note', next.packaged ? 'Launch at sign-in, ready to keep you company.' : 'Launch at sign-in is packaged-app only. This preference is saved, but unavailable in development.');
    renderModel(next);
  } else renderPet(next);
  renderError();
}

async function operation(task: () => Promise<unknown>, failure: string): Promise<void> {
  localError = '';
  renderError();
  try { await task(); }
  catch (error) {
    localError = `${failure} ${describeError(error)}`;
    renderError();
  }
}

for (const key of Object.keys(inputs) as SettingKey[]) {
  inputs[key].addEventListener(key === 'allowedApps' ? 'input' : 'change', () => {
    if (!draft) return;
    dirty.set(key, ++revision);
    if (key === 'allowedApps') {
      const names = validateApps();
      if (names) draft.allowedApps = names;
    } else if (key === 'commentFrequency') {
      draft.commentFrequency = inputs.commentFrequency.value as CommentFrequency;
    } else if (key === 'petSize') {
      draft.petSize = Number(inputs.petSize.value);
    } else draft[key] = inputs[key].checked;
    saveStatus.textContent = 'Unsaved changes';
    updateSaveState();
  });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!draft || saving || !snapshot) return;
  const names = validateApps();
  if (!names) { appsInput.focus(); return; }
  draft.allowedApps = names;
  const sent = { ...draft, allowedApps: [...names] };
  const sentRevisions = new Map(dirty);
  saving = true;
  updateSaveState();
  void operation(async () => {
    const updated = await api.updateSettings(sent);
    for (const [key, version] of sentRevisions) {
      if (dirty.get(key) === version) dirty.delete(key);
    }
    receive(updated);
    saveStatus.textContent = dirty.size ? 'Saved. You have newer unsaved changes.' : 'Preferences saved.';
  }, 'Could not save preferences. Your edits are still here.').finally(() => {
    saving = false;
    updateSaveState();
  });
});

function petCat(): void {
  if (!api || careBusy || !snapshot || snapshot.pet.atHome || snapshot.pet.mood === 'home') return;
  careBusy = true;
  renderPet(snapshot);
  void operation(async () => receive(await api.care('pet')), 'Nooki could not react. Try again.').finally(() => {
    careBusy = false;
    if (snapshot) renderPet(snapshot);
  });
}

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  ended: boolean;
  lastMoveAt: number;
  movePending: boolean;
  ready: Promise<boolean>;
  movement: Promise<void>;
}
let drag: DragSession | undefined;
let finishingDrag = false;

function dragError(error: unknown): void {
  localError = `Could not move Nooki. Try dragging again. ${describeError(error)}`;
  renderError();
}

async function finishDrag(cancelled: boolean): Promise<void> {
  const current = drag;
  if (!current) return;
  drag = undefined;
  current.ended = true;
  cat.dataset.dragging = 'false';
  if (cat.hasPointerCapture(current.pointerId)) cat.releasePointerCapture(current.pointerId);
  if (!current.moved) {
    if (!cancelled) petCat();
    return;
  }
  finishingDrag = true;
  try {
    await current.ready;
    await current.movement;
    await api.endDrag();
  } catch (error) { dragError(error); }
  finally { finishingDrag = false; }
}

cat.addEventListener('pointerdown', event => {
  if (!api || !snapshot || isSettings || event.button !== 0 || !event.isPrimary || drag || finishingDrag || snapshot.pet.atHome || snapshot.pet.mood === 'home') return;
  event.preventDefault();
  cat.focus({ preventScroll: true });
  cat.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId, startX: event.screenX, startY: event.screenY,
    moved: false, ended: false, lastMoveAt: -Infinity, movePending: false,
    ready: Promise.resolve(true), movement: Promise.resolve(),
  };
});

cat.addEventListener('pointermove', event => {
  const current = drag;
  if (!current || event.pointerId !== current.pointerId) return;
  if (!current.moved) {
    if (Math.hypot(event.screenX - current.startX, event.screenY - current.startY) < 4) return;
    current.moved = true;
    cat.dataset.dragging = 'true';
    localError = '';
    renderError();
    current.ready = api.startDrag().then(() => true, error => { dragError(error); return false; });
  }
  if (current.movePending || performance.now() - current.lastMoveAt < 1000 / 30) return;
  current.movePending = true;
  current.movement = current.ready.then(async started => {
    if (!started || current.ended || performance.now() - current.lastMoveAt < 1000 / 30) return;
    current.lastMoveAt = performance.now();
    await api.dragPet();
  }).catch(dragError).finally(() => { current.movePending = false; });
});

cat.addEventListener('pointerup', event => {
  if (event.pointerId === drag?.pointerId) void finishDrag(false);
});
cat.addEventListener('pointercancel', event => {
  if (event.pointerId === drag?.pointerId) void finishDrag(true);
});
cat.addEventListener('lostpointercapture', event => {
  if (event.pointerId === drag?.pointerId) void finishDrag(true);
});
window.addEventListener('blur', () => { void finishDrag(true); });

function openPetMenu(): void {
  if (!api || isSettings) return;
  void operation(async () => {
    await finishDrag(true);
    await api.openPetMenu();
  }, 'Could not open Nooki’s care menu. Try again.');
}
cat.addEventListener('contextmenu', event => {
  event.preventDefault();
  openPetMenu();
});
cat.addEventListener('click', event => {
  if (event.detail === 0) openPetMenu();
});
cat.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    openPetMenu();
  }
});
element('restore-button').addEventListener('click', () => {
  void operation(() => api.restore(), 'Could not bring Nooki back. Try again.');
});
consent.addEventListener('change', () => { if (snapshot) renderModel(snapshot); });

async function modelOperation(kind: 'download' | 'cancel' | 'remove', action: () => Promise<void>, label: string): Promise<void> {
  if (modelBusy && !(kind === 'cancel' && modelBusy === 'download')) return;
  const version = ++modelOperationVersion;
  modelBusy = kind;
  showText('model-action-status', label);
  if (snapshot) renderModel(snapshot);
  await operation(action, 'Model action failed. You can try again.');
  if (version === modelOperationVersion) {
    modelBusy = null;
    showText('model-action-status', '');
    if (snapshot) renderModel(snapshot);
  }
}

downloadButton.addEventListener('click', () => {
  if (!consent.checked) return;
  void modelOperation('download', () => api.downloadModel(true), 'Starting download…');
});
cancelButton.addEventListener('click', () => {
  void modelOperation('cancel', () => api.cancelModelDownload(), 'Cancelling download…');
});
removeButton.addEventListener('click', () => {
  void modelOperation('remove', async () => {
    await api.removeModel();
    consent.checked = false;
  }, 'Removing model…');
});

if (!api) {
  localError = 'Nooki’s desktop connection is unavailable. Reopen this window from the app.';
  renderError();
  cat.setAttribute('aria-disabled', 'true');
  cat.tabIndex = -1;
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button, input, select, textarea').forEach(control => { control.disabled = true; });
} else {
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(control => { control.disabled = true; });
  const unsubscribe = api.onSnapshot(next => { snapshotEvents++; receive(next); });
  window.addEventListener('beforeunload', unsubscribe, { once: true });
  const initialEventCount = snapshotEvents;
  void operation(async () => {
    const initial = await api.getSnapshot();
    if (snapshotEvents === initialEventCount) receive(initial);
  }, 'Could not load Nooki. Reopen this window to try again.');
}
