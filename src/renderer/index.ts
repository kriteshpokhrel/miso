import type { CareAction, CoatColors, CoatPattern, CommentFrequency, MotionLevel, MisoApi, Settings, Snapshot } from '../shared/contracts.js';
import { IDLE_MOTION } from '../shared/contracts.js';
import { getSpecies, PET_SPECIES, type SpeciesId } from '../shared/species.js';
import { careOrbit } from '../shared/pet-ui.js';
import { COAT_PALETTES } from './coats.js';
import { COMMON_APPS } from '../shared/apps.js';

declare global {
  interface Window { miso: MisoApi; }
  interface WindowEventMap {
    'miso:coat-preview': CustomEvent<{ snapshot: Snapshot; active: boolean }>;
  }
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as T;
}

const requestedView = new URLSearchParams(location.search).get('view');
const view = requestedView === 'settings' || requestedView === 'care' || requestedView === 'speech' ? requestedView : 'pet';
const isSettings = view === 'settings';
const isCare = view === 'care';
document.body.dataset.view = view;
element(`${view}-view`).hidden = false;
document.title = isSettings ? 'Miso — Preferences' : 'Miso';

const api = window.miso;
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
  motionLevel: element<HTMLSelectElement>('motion-level'),
  followWindow: element<HTMLInputElement>('follow-window'),
  stayPut: element<HTMLInputElement>('stay-put'),
  aiEnabled: element<HTMLInputElement>('ai-enabled'),
  allowedApps: appsInput,
  petSize: element<HTMLSelectElement>('pet-size'),
  breakReminders: element<HTMLInputElement>('break-reminders'),
  coatPattern: element<HTMLSelectElement>('coat-pattern'),
  coatColor: element<HTMLInputElement>('coat-color'),
  accentColor: element<HTMLInputElement>('accent-color'),
};
type SettingKey = keyof Settings;
let snapshot: Snapshot | undefined;
let draft: Settings | undefined;
let selectedAppNames: string[] = [];
let revision = 0;
const dirty = new Map<SettingKey, number>();
let saving = false;
let modelBusy: 'download' | 'cancel' | 'remove' | null = null;
let modelOperationVersion = 0;
let careBusy = false;
let snapshotEvents = 0;
let localError = '';
let coatPage = true;
let careWasOpen = false;
const coatKeys: Array<keyof CoatColors> = ['coatPattern', 'coatColor', 'accentColor'];
const speciesChoices = Object.entries(PET_SPECIES).map(([id, definition]) => {
  const button = document.createElement('button');
  button.id = `choose-${id}`;
  button.type = 'button';
  button.className = 'species-choice secondary';
  button.dataset.species = id;
  button.textContent = definition.label;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', 'false');
  button.tabIndex = -1;
  button.disabled = true;
  button.addEventListener('click', () => chooseSpecies(id as SpeciesId));
  return button;
});
element('pet-species').replaceChildren(...speciesChoices);

function renderSpecies(): void {
  for (const choice of speciesChoices) {
    const selected = choice.dataset.species === draft?.petSpecies;
    choice.setAttribute('aria-checked', String(selected));
    choice.tabIndex = selected ? 0 : -1;
    choice.disabled = !draft;
  }
}

function chooseSpecies(id: SpeciesId): void {
  if (!draft) return;
  if (draft.petSpecies !== id) {
    draft.petSpecies = id;
    dirty.set('petSpecies', ++revision);
    saveStatus.textContent = 'Unsaved changes';
    updateSaveState();
    renderCoat();
  }
  renderSpecies();
}

element('pet-species').addEventListener('keydown', event => {
  if (!draft || !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = speciesChoices.findIndex(choice => choice.dataset.species === draft!.petSpecies);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? speciesChoices.length - 1
    : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + speciesChoices.length) % speciesChoices.length;
  const choice = speciesChoices[index]!;
  chooseSpecies(choice.dataset.species as SpeciesId);
  choice.focus();
});

function renderCoat(): void {
  if (!draft || !snapshot || !isSettings) return;
  showText('species-personality', getSpecies(draft.petSpecies).personality);
  element('coat-preview').setAttribute('aria-label', `Live 3D preview of Miso the ${getSpecies(draft.petSpecies).label.toLowerCase()}`);
  inputs.accentColor.disabled = draft.coatPattern === 'single';
  showText('coat-color-value', draft.coatColor.toUpperCase());
  showText('accent-color-value', draft.accentColor.toUpperCase());
  element<HTMLButtonElement>('revert-coat').disabled = !coatKeys.some(key => dirty.has(key));
  for (const palette of COAT_PALETTES) {
    const button = element<HTMLButtonElement>(`palette-${palette.id}`);
    button.disabled = false;
    button.setAttribute('aria-pressed', String(draft.coatColor === palette.coatColor && draft.accentColor === palette.accentColor));
  }
  window.dispatchEvent(new CustomEvent('miso:coat-preview', {
    detail: {
      active: coatPage,
      snapshot: {
        ...snapshot, settings: { ...draft }, pet: { ...snapshot.pet, species: draft.petSpecies, mood: 'idle', atHome: false },
        comment: null, moving: false, motion: { ...IDLE_MOTION }, attention: { x: 0, y: 0, nearby: false },
      },
    },
  }));
}

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
  const target = element(`${view}-error`);
  target.textContent = message;
  target.hidden = !message;
}

function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  return value >= 1_000_000_000 ? `${(value / 1_000_000_000).toFixed(2)} GB` : `${Math.ceil(value / 1_000_000)} MB`;
}

function validateApps(): string[] | null {
  const names = [...selectedAppNames, ...appsInput.value.split(/[\n,]/).map(name => name.trim()).filter(Boolean)];
  const invalid = names.find(name => !/^[a-zA-Z0-9][a-zA-Z0-9 ._()+-]{0,79}$/.test(name));
  const error = names.length > 30
    ? 'Use 30 process names or fewer.'
    : invalid ? `“${invalid}” is not a process name. Use names such as Code.exe or Safari, not paths.` : '';
  showText('apps-error', error);
  element('apps-error').hidden = !error;
  appsInput.setAttribute('aria-invalid', String(Boolean(error)));
  if (error) element<HTMLDetailsElement>('custom-apps').open = true;
  return error ? null : names.filter((name, index) => names.findIndex(other => other.toLowerCase() === name.toLowerCase()) === index);
}

function presetNames(app: typeof COMMON_APPS[number]): string[] {
  return snapshot?.platform === 'darwin' ? app.darwin : app.win32;
}
function isPresetName(name: string): boolean {
  return COMMON_APPS.some(app => presetNames(app).some(known => known.toLowerCase() === name.toLowerCase()));
}
for (const app of COMMON_APPS) {
  const checkbox = element<HTMLInputElement>(`app-${app.id}`);
  checkbox.addEventListener('change', () => {
    if (!draft) return;
    const names = presetNames(app);
    selectedAppNames = selectedAppNames.filter(name => !names.some(known => known.toLowerCase() === name.toLowerCase()));
    if (checkbox.checked) selectedAppNames.push(...names);
    const allowed = validateApps();
    if (allowed) draft.allowedApps = allowed;
    dirty.set('allowedApps', ++revision);
    saveStatus.textContent = 'Unsaved preferences.';
    updateSaveState();
  });
}

function updateSaveState(): void {
  saveButton.disabled = saving || dirty.size === 0;
  saveButton.textContent = saving ? 'Saving…' : 'Save preferences';
}

function writeInput(key: SettingKey, settings: Settings): void {
  if (key === 'allowedApps') {
    selectedAppNames = settings.allowedApps.filter(isPresetName);
    const custom = settings.allowedApps.filter(name => !isPresetName(name));
    appsInput.value = custom.join('\n');
    if (custom.length) element<HTMLDetailsElement>('custom-apps').open = true;
    for (const app of COMMON_APPS) {
      element<HTMLInputElement>(`app-${app.id}`).checked = settings.allowedApps.some(name => presetNames(app).some(known => known.toLowerCase() === name.toLowerCase()));
    }
  } else if (key === 'commentFrequency') {
    inputs.commentFrequency.value = settings.commentFrequency;
  } else if (key === 'motionLevel') {
    inputs.motionLevel.value = settings.motionLevel;
  } else if (key === 'petSpecies') {
    renderSpecies();
  } else if (key === 'petSize') {
    inputs.petSize.value = String(settings.petSize);
  } else if (key === 'coatColor' || key === 'accentColor' || key === 'coatPattern') {
    inputs[key].value = settings[key];
  } else {
    inputs[key].checked = settings[key];
  }
}

function syncSettings(next: Settings): void {
  if (!draft) draft = { ...next, allowedApps: [...next.allowedApps] };
  for (const key of [...Object.keys(inputs), 'petSpecies'] as SettingKey[]) {
    // Background snapshots must never replace a field the user is editing.
    if (dirty.has(key)) continue;
    if (key === 'allowedApps') draft.allowedApps = [...next.allowedApps];
    else if (key === 'commentFrequency') draft.commentFrequency = next.commentFrequency;
    else if (key === 'motionLevel') draft.motionLevel = next.motionLevel;
    else if (key === 'petSpecies') draft.petSpecies = next.petSpecies;
    else if (key === 'petSize') draft.petSize = next.petSize;
    else if (key === 'coatPattern') draft.coatPattern = next.coatPattern;
    else if (key === 'coatColor' || key === 'accentColor') draft[key] = next[key];
    else draft[key] = next[key];
    writeInput(key, next);
  }
  updateSaveState();
  renderCoat();
}

function renderPet(next: Snapshot): void {
  const mood = next.pet.mood;
  cat.dataset.mood = mood;
  cat.dataset.moving = String(next.moving);
  const definition = getSpecies(next.pet.species);
  const speciesLabel = definition.label.toLowerCase();
  const article = /^[aeiou]/i.test(speciesLabel) ? 'an' : 'a';
  const activity = mood === 'home' ? 'going home' : mood === 'mimicking' ? 'pretending to work on a tiny laptop'
    : mood === 'irritated' ? 'theatrically grumpy' : mood === 'purring' ? definition.affectionLabel : mood;
  cat.setAttribute('aria-label', `Miso, ${article} ${speciesLabel}, is ${activity}. Open care menu.`);
  cat.dataset.speaking = String(Boolean(next.comment));
  const atHome = next.pet.atHome || mood === 'home';
  showText('sleep-action-label', mood === 'sleeping' ? 'Wake' : 'Sleep');
  element('care-sleep').setAttribute('aria-label', mood === 'sleeping' ? 'Wake Miso' : 'Let Miso sleep');
  cat.setAttribute('aria-busy', String(careBusy));
  cat.setAttribute('aria-disabled', String(atHome));
  cat.setAttribute('aria-expanded', String(next.careMenuOpen));
  if (atHome && (menuRequested || next.careMenuOpen)) closePetMenu();
}

function renderCare(next: Snapshot): void {
  const affection = next.pet.species === 'cat' || next.pet.species === 'dog' ? 'Scritches' : 'Pats';
  showText('pet-action-label', affection);
  element('care-pet').setAttribute('aria-label', `Give Miso ${affection.toLowerCase()}`);
  const roam = next.settings.stayPut || next.settings.motionLevel === 'still';
  showText('stay-action-label', roam ? 'Roam' : 'Stay');
  element('care-stay').setAttribute('aria-label', roam ? 'Let Miso roam' : 'Keep Miso here');
  element('care-follow').setAttribute('aria-checked', String(next.settings.followWindow));
  showText('sleep-action-label', next.pet.mood === 'sleeping' ? 'Wake' : 'Sleep');
  element('care-sleep').setAttribute('aria-label', next.pet.mood === 'sleeping' ? 'Wake Miso' : 'Let Miso sleep');
  const wasOpen = !petMenu.hidden;
  petMenu.hidden = !isCare || !next.careMenuOpen;
  if (next.careMenuOpen) menuRequested = true;
  else if (careWasOpen) menuRequested = false;
  careWasOpen = next.careMenuOpen;
  if (isCare && next.careMenuOpen && !wasOpen) menuButtons[0]!.focus();
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
  document.body.classList.toggle('reduce-motion', next.settings.motionLevel === 'still' || next.systemReducedMotion);
  if (isSettings) {
    if (firstSnapshot) form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(control => { control.disabled = false; });
    syncSettings(next.settings);
    const activity = next.pet.mood === 'idle' ? 'keeping you company'
      : next.pet.mood === 'purring' ? getSpecies(next.pet.species).affectionLabel : next.pet.mood;
    showText('presence-text', next.pet.atHome ? 'Miso is resting at home. Needs and comments are paused.' : `Miso is ${activity}.`);
    showText('login-note', next.packaged ? 'Launch at sign-in, ready to keep you company.' : 'Launch at sign-in is packaged-app only. This preference is saved, but unavailable in development.');
    renderModel(next);
    element('system-motion-note').hidden = !next.systemReducedMotion;
    showText('window-follow-status', next.windowFollowing);
  } else {
    if (view === 'pet') renderPet(next);
    renderCare(next);
    const speech = view === 'speech' && !next.careMenuOpen ? next.comment || '' : '';
    showText('speech', speech);
    element('speech').hidden = !speech;
    document.body.dataset.speechBelow = String(next.speechBelow);
    element('speech').style.setProperty('--speech-anchor', `${next.speechAnchor}px`);
  }
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

for (const key of Object.keys(inputs) as Array<keyof typeof inputs>) {
  inputs[key].addEventListener(key === 'allowedApps' || key === 'coatColor' || key === 'accentColor' ? 'input' : 'change', () => {
    if (!draft) return;
    dirty.set(key, ++revision);
    if (key === 'allowedApps') {
      const names = validateApps();
      if (names) draft.allowedApps = names;
    } else if (key === 'commentFrequency') {
      draft.commentFrequency = inputs.commentFrequency.value as CommentFrequency;
    } else if (key === 'petSize') {
      draft.petSize = Number(inputs.petSize.value);
    } else if (key === 'motionLevel') {
      draft.motionLevel = inputs.motionLevel.value as MotionLevel;
    } else if (key === 'coatPattern') {
      draft.coatPattern = inputs.coatPattern.value as CoatPattern;
    } else if (key === 'coatColor' || key === 'accentColor') {
      draft[key] = inputs[key].value;
    } else draft[key] = inputs[key].checked;
    saveStatus.textContent = 'Unsaved changes';
    updateSaveState();
    renderCoat();
  });
}

for (const palette of COAT_PALETTES) {
  const button = element<HTMLButtonElement>(`palette-${palette.id}`);
  button.style.setProperty('--coat-base', palette.coatColor);
  button.style.setProperty('--coat-accent', palette.accentColor);
  button.addEventListener('click', () => {
    if (!draft) return;
    for (const key of ['coatColor', 'accentColor'] as const) {
      draft[key] = palette[key];
      dirty.set(key, ++revision);
      writeInput(key, draft);
    }
    saveStatus.textContent = 'Unsaved changes';
    updateSaveState();
    renderCoat();
  });
}
element('revert-coat').addEventListener('click', () => {
  if (!draft || !snapshot) return;
  draft.coatPattern = snapshot.settings.coatPattern;
  draft.coatColor = snapshot.settings.coatColor;
  draft.accentColor = snapshot.settings.accentColor;
  for (const key of coatKeys) {
    if (saving) dirty.set(key, ++revision);
    else dirty.delete(key);
    writeInput(key, draft);
  }
  saveStatus.textContent = dirty.size ? 'Unsaved changes' : 'Coat edits reverted.';
  updateSaveState();
  renderCoat();
});
function selectSettingsPage(coat: boolean): void {
  coatPage = coat;
  element('company-panel').hidden = coat;
  element('coat-panel').hidden = !coat;
  element('model-section').hidden = coat;
  element('gesture-hint').hidden = !coat;
  element('company-page').setAttribute('aria-pressed', String(!coat));
  element('coat-page').setAttribute('aria-pressed', String(coat));
  renderCoat();
}
element('company-page').addEventListener('click', () => selectSettingsPage(false));
element('coat-page').addEventListener('click', () => selectSettingsPage(true));

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

function petCat(action: CareAction = 'pet'): void {
  if (!api || careBusy || !snapshot || snapshot.pet.atHome || snapshot.pet.mood === 'home') return;
  careBusy = true;
  renderPet(snapshot);
  void operation(async () => receive(await (action === 'pet' && snapshot?.pet.mood === 'sleeping' ? api.setSleeping(false) : api.care(action))), 'Miso could not react. Try again.').finally(() => {
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
  localError = `Could not move Miso. Try dragging again. ${describeError(error)}`;
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
  if (!api || !snapshot || view !== 'pet' || snapshot.careMenuOpen || event.button !== 0 || !event.isPrimary || drag || finishingDrag || snapshot.pet.atHome || snapshot.pet.mood === 'home') return;
  event.preventDefault();
  if (document.activeElement === cat) cat.blur();
  closePetMenu();
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
window.addEventListener('blur', () => { if (isCare) closePetMenu(); void finishDrag(true); });

const petMenu = element('pet-menu');
const menuButtons = ['care-feed', 'care-pet', 'care-play', 'care-sleep', 'care-stay', 'care-follow', 'care-home', 'care-settings'].map(id => element<HTMLButtonElement>(id));
function positionCare(): void {
  menuButtons.forEach((button, index) => {
    const point = careOrbit(index, menuButtons.length, window.innerWidth);
    button.style.setProperty('--orbit-x', `${point.x}px`);
    button.style.setProperty('--orbit-y', `${point.y}px`);
  });
}
positionCare();
window.addEventListener('resize', positionCare);
let menuRequested = false;
let menuVersion = 0;
petMenu.hidden = true;
function closePetMenu(restoreFocus = false): void {
  const wasOpen = menuRequested || Boolean(snapshot?.careMenuOpen);
  menuRequested = false;
  menuVersion++;
  petMenu.hidden = true;
  if (wasOpen) void operation(() => api.setCareMenuOpen(false, restoreFocus), 'Could not resume Miso. Reopen and close care to retry.');
}
function openPetMenu(keyboard = false): void {
  if (!api || view !== 'pet' || !snapshot || snapshot.pet.atHome || snapshot.pet.mood === 'home') return;
  if (menuRequested) { closePetMenu(keyboard); return; }
  menuRequested = true;
  const version = ++menuVersion;
  void operation(async () => {
    await finishDrag(true);
    if (version !== menuVersion) return;
    await api.setCareMenuOpen(true);
    if (version !== menuVersion) return;
  }, 'Could not open Miso’s care menu. Try again.');
}
for (const action of ['feed', 'pet', 'play'] as const) {
  element(`care-${action}`).addEventListener('click', () => { closePetMenu(); petCat(action); });
}
element('care-home').addEventListener('click', () => { closePetMenu(); void operation(() => api.goHome(), 'Could not send Miso home.'); });
element('care-sleep').addEventListener('click', () => {
  if (!snapshot || careBusy) return;
  closePetMenu();
  careBusy = true;
  void operation(async () => receive(await api.setSleeping(snapshot!.pet.mood !== 'sleeping')), 'Could not change Miso’s sleep. Try again.')
    .finally(() => { careBusy = false; if (snapshot) renderPet(snapshot); });
});
element('care-settings').addEventListener('click', () => { closePetMenu(); void operation(() => api.openSettings(), 'Could not open settings.'); });
element('care-stay').addEventListener('click', () => {
  if (!snapshot) return;
  const stay = !(snapshot.settings.stayPut || snapshot.settings.motionLevel === 'still');
  closePetMenu();
  void operation(async () => receive(await api.setStayPut(stay)), 'Could not change Miso’s roaming. Try again.');
});
element('care-follow').addEventListener('click', () => {
  if (!snapshot) return;
  const follow = !snapshot.settings.followWindow;
  closePetMenu();
  void operation(async () => receive(await api.setFollowing(follow)), 'Could not change window following. Try again.');
});
petMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault();
    closePetMenu(event.key === 'Escape');
  } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const index = menuButtons.findIndex(button => button === document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? menuButtons.length - 1
      : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + menuButtons.length) % menuButtons.length;
    menuButtons[next]!.focus();
  }
});
window.addEventListener('pointerdown', event => {
  const path = event.composedPath();
  if ((isCare || view === 'pet') && !path.includes(petMenu) && !path.includes(cat)) closePetMenu();
});
cat.addEventListener('contextmenu', event => {
  event.preventDefault();
  openPetMenu();
});
cat.addEventListener('click', event => {
  if (event.detail === 0) openPetMenu(true);
});
cat.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    openPetMenu(true);
  }
});
element('restore-button').addEventListener('click', () => {
  void operation(() => api.restore(), 'Could not bring Miso back. Try again.');
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
  localError = 'Miso’s desktop connection is unavailable. Reopen this window from the app.';
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
  }, 'Could not load Miso. Reopen this window to try again.');
}
