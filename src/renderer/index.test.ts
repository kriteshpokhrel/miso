import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import type { NookiApi, Settings, Snapshot } from '../shared/contracts.js';

interface ControlEvent {
  preventDefault(): void;
  pointerId: number;
  button: number;
  isPrimary: boolean;
  screenX: number;
  screenY: number;
  key: string;
  shiftKey: boolean;
  repeat: boolean;
  detail: number;
}

class Control {
  value = '';
  textContent = '';
  checked = false;
  disabled = false;
  hidden = false;
  focused = false;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: Control[] = [];
  classList = { toggle: () => {} };
  captured = new Set<number>();
  listeners = new Map<string, Array<(event: ControlEvent) => void>>();
  addEventListener(name: string, handler: (event: ControlEvent) => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) || []), handler]);
  }
  dispatch(name: string, values: Partial<ControlEvent> = {}): void {
    const event: ControlEvent = { preventDefault() {}, pointerId: 1, button: 0, isPrimary: true, screenX: 100, screenY: 100, key: '', shiftKey: false, repeat: false, detail: 1, ...values };
    for (const listener of this.listeners.get(name) || []) listener(event);
  }
  querySelectorAll(): Control[] { return this.children; }
  setAttribute(name: string, value: string): void { this.attributes[name] = value; }
  removeAttribute(name: string): void { delete this.attributes[name]; }
  focus(): void { this.focused = true; }
  setPointerCapture(id: number): void { this.captured.add(id); }
  hasPointerCapture(id: number): boolean { return this.captured.has(id); }
  releasePointerCapture(id: number): void { this.captured.delete(id); }
}

const source = buildSync({
  entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))],
  bundle: true, format: 'iife', platform: 'browser', write: false,
}).outputFiles[0]!.text;
const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function state(): Snapshot {
  return {
    pet: { species: 'cat', hunger: 20, energy: 80, mood: 'idle', atHome: false, lastTickAt: 0, lastInteractionAt: 0, lastCommentAt: 0, reactionUntil: 0, disturbance: 0, lastDisturbedAt: 0, activeTimeMs: 0, lastBreakReminderAt: 0 },
    settings: { launchAtLogin: true, commentFrequency: 'quiet', allowedApps: [], aiEnabled: false, reducedMotion: false, petSize: 1, breakReminders: true },
    model: { phase: 'not-installed', downloadedBytes: 0, totalBytes: 100 },
    modelInfo: { id: 'test', name: 'Test local model', sizeBytes: 100, license: 'Test license', licenseUrl: 'https://example.invalid/license', sourceUrl: 'https://example.invalid/model', resourceNote: 'Test resource disclosure' },
    comment: null, error: null, platform: 'win32', packaged: false, moving: false,
    attention: { x: 0, y: 0, nearby: false },
  };
}

const settle = async (): Promise<void> => { await new Promise(resolve => setImmediate(resolve)); };

function mount(overrides: Partial<NookiApi> = {}, settingsView = true) {
  const controls = new Map<string, Control>();
  for (const match of markup.matchAll(/\bid="([^"]+)"/g)) controls.set(match[1]!, new Control());
  const get = (id: string): Control => {
    const control = controls.get(id);
    assert.ok(control, id);
    return control;
  };
  get('settings-form').children = ['launch-at-login', 'comment-frequency', 'reduced-motion', 'ai-enabled', 'allowed-apps', 'pet-size', 'break-reminders'].map(get);
  let nextSnapshot = state();
  let now = 0;
  let listener: (snapshot: Snapshot) => void = () => {};
  const calls: Settings[] = [];
  const api: NookiApi = {
    getSnapshot: async () => nextSnapshot,
    care: async () => nextSnapshot,
    goHome: async () => {},
    restore: async () => {},
    openSettings: async () => {},
    updateSettings: async settings => { calls.push(settings); return { ...nextSnapshot, settings }; },
    downloadModel: async () => {},
    cancelModelDownload: async () => {},
    removeModel: async () => {},
    startDrag: async () => {},
    dragPet: async () => {},
    endDrag: async () => {},
    openPetMenu: async () => {},
    onSnapshot: handler => { listener = handler; return () => {}; },
    onAttention: () => () => {},
    ...overrides,
  };
  runInNewContext(source, {
    URLSearchParams, location: { search: settingsView ? '?view=settings' : '' }, performance: { now: () => now },
    window: { nooki: api, addEventListener() {} },
    document: {
      body: new Control(), getElementById: (id: string) => controls.get(id),
      querySelectorAll: () => [...controls.values()],
    },
  });
  return { get, calls, advance(ms: number) { now += ms; }, emit(snapshot: Snapshot) { nextSnapshot = snapshot; listener(snapshot); } };
}

test('snapshot updates preserve preference drafts and edits made during save', async () => {
  let resolveSave!: (value: Snapshot) => void;
  let sent!: Settings;
  const ui = mount({ updateSettings: settings => {
    sent = settings;
    return new Promise(resolve => { resolveSave = resolve; });
  } });
  await settle();
  ui.get('allowed-apps').value = 'Code.exe';
  ui.get('allowed-apps').dispatch('input');
  const incoming = state();
  incoming.settings.commentFrequency = 'chatty';
  ui.emit(incoming);
  assert.equal(ui.get('allowed-apps').value, 'Code.exe');
  assert.equal(ui.get('comment-frequency').value, 'chatty');
  ui.get('settings-form').dispatch('submit');
  assert.equal(sent.commentFrequency, 'chatty');
  assert.deepEqual(Array.from(sent.allowedApps), ['Code.exe']);
  ui.get('allowed-apps').value = 'Safari';
  ui.get('allowed-apps').dispatch('input');
  resolveSave({ ...incoming, settings: sent });
  await settle();
  assert.equal(ui.get('allowed-apps').value, 'Safari');
  assert.equal(ui.get('save-button').disabled, false);
  assert.match(ui.get('save-status').textContent, /newer unsaved/);
});

test('process paths are rejected before invoking the bridge', async () => {
  const ui = mount();
  await settle();
  ui.get('allowed-apps').value = 'C:\\Apps\\Code.exe';
  ui.get('allowed-apps').dispatch('input');
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.get('apps-error').hidden, false);
  assert.equal(ui.get('allowed-apps').focused, true);
});

test('cancellation remains usable while the download promise is pending', async () => {
  let endDownload!: () => void;
  let cancelled = false;
  let consentGiven = false;
  const ui = mount({
    downloadModel: consent => {
      consentGiven = consent;
      return new Promise(resolve => { endDownload = resolve; });
    },
    cancelModelDownload: async () => { cancelled = true; endDownload(); },
  });
  await settle();
  ui.get('download-consent').checked = true;
  ui.get('download-consent').dispatch('change');
  ui.get('download-button').dispatch('click');
  const downloading = state();
  downloading.model.phase = 'downloading';
  downloading.model.downloadedBytes = 25;
  ui.emit(downloading);
  assert.equal(consentGiven, true);
  assert.equal(ui.get('cancel-download-button').disabled, false);
  ui.get('cancel-download-button').dispatch('click');
  await settle();
  assert.equal(cancelled, true);
});

test('a stationary tap pets and failed care calls report errors without locking the cat', async () => {
  const ui = mount({ care: async () => { throw new Error('Desktop connection lost.'); } }, false);
  await settle();
  ui.get('cat').dispatch('pointerdown');
  ui.get('cat').dispatch('pointerup');
  await settle();
  assert.equal(ui.get('pet-error').hidden, false);
  assert.match(ui.get('pet-error').textContent, /Desktop connection lost/);
  assert.equal(ui.get('cat').attributes['aria-busy'], 'false');
  assert.equal(ui.get('cat').hasPointerCapture(1), false);
});

test('speech only displays supplied comments, with a going-home exception', async () => {
  const ui = mount({}, false);
  await settle();
  assert.equal(ui.get('speech').hidden, true);
  assert.equal(ui.get('cat').dataset.speaking, 'false');
  const quiet = state();
  quiet.settings.commentFrequency = 'off';
  quiet.pet.mood = 'hungry';
  ui.emit(quiet);
  assert.equal(ui.get('speech').hidden, true);
  assert.match(ui.get('cat').attributes['aria-label']!, /hungry/);
  ui.emit({ ...quiet, comment: 'A supplied care reaction.' });
  assert.equal(ui.get('speech').hidden, false);
  assert.equal(ui.get('speech').textContent, 'A supplied care reaction.');
  assert.equal(ui.get('cat').dataset.speaking, 'true');
  ui.emit(quiet);
  assert.equal(ui.get('speech').hidden, true);
  assert.equal(ui.get('speech').textContent, '');
  assert.equal(ui.get('cat').dataset.speaking, 'false');
  ui.emit({ ...quiet, pet: { ...quiet.pet, mood: 'home', atHome: true } });
  assert.equal(ui.get('speech').hidden, false);
  assert.match(ui.get('speech').textContent, /Heading home/);
});

test('model disclosure includes approximate size and exact bytes', async () => {
  const ui = mount();
  await settle();
  const next = state();
  next.modelInfo.sizeBytes = 123_456_789;
  ui.emit(next);
  assert.match(ui.get('model-size').textContent, /124 MB \(123,456,789 bytes\)/);
});

test('native movement coexists with the hungry mood and clears when movement stops', async () => {
  const ui = mount({}, false);
  await settle();
  const hungry = state();
  hungry.pet.mood = 'hungry';
  hungry.moving = true;
  ui.emit(hungry);
  assert.equal(ui.get('cat').dataset.mood, 'hungry');
  assert.equal(ui.get('cat').dataset.moving, 'true');
  assert.equal(ui.get('speech').hidden, true);
  ui.emit({ ...hungry, moving: false });
  assert.equal(ui.get('cat').dataset.moving, 'false');
  assert.equal(ui.get('cat').dataset.mood, 'hungry');
});

test('pet size and break reminder drafts survive snapshots and save as complete settings', async () => {
  const ui = mount();
  await settle();
  ui.get('pet-size').value = '1.3';
  ui.get('pet-size').dispatch('change');
  ui.get('break-reminders').checked = false;
  ui.get('break-reminders').dispatch('change');
  const incoming = state();
  incoming.settings.reducedMotion = true;
  ui.emit(incoming);
  assert.equal(ui.get('pet-size').value, '1.3');
  assert.equal(ui.get('break-reminders').checked, false);
  assert.equal(ui.get('reduced-motion').checked, true);
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.equal(ui.calls[0]!.petSize, 1.3);
  assert.equal(ui.calls[0]!.breakReminders, false);
  assert.equal(ui.calls[0]!.reducedMotion, true);
});

test('context menu and keyboard shortcuts open native care options', async () => {
  let opened = 0;
  const ui = mount({ openPetMenu: async () => { opened++; } }, false);
  await settle();
  ui.get('cat').dispatch('contextmenu');
  for (const key of ['Enter', 'ContextMenu', ' ']) ui.get('cat').dispatch('keydown', { key });
  ui.get('cat').dispatch('keydown', { key: 'F10', shiftKey: true });
  ui.get('cat').dispatch('keydown', { key: 'F10' });
  ui.get('cat').dispatch('keydown', { key: 'Enter', repeat: true });
  ui.get('cat').dispatch('click', { detail: 0 });
  ui.get('cat').dispatch('click', { detail: 1 });
  await settle();
  assert.equal(opened, 6);
});

test('dragging captures the pointer, throttles movement, passes no coordinates and never pets', async () => {
  const calls: string[] = [];
  const ui = mount({
    startDrag: async (...args: unknown[]) => { assert.equal(args.length, 0); calls.push('start'); },
    dragPet: async (...args: unknown[]) => { assert.equal(args.length, 0); calls.push('move'); },
    endDrag: async (...args: unknown[]) => { assert.equal(args.length, 0); calls.push('end'); },
    care: async () => { calls.push('pet'); return state(); },
  }, false);
  await settle();
  const cat = ui.get('cat');
  cat.dispatch('pointerdown');
  assert.equal(cat.hasPointerCapture(1), true);
  cat.dispatch('pointermove', { screenX: 106 });
  await settle();
  ui.advance(10);
  cat.dispatch('pointermove', { screenX: 110 });
  await settle();
  ui.advance(30);
  cat.dispatch('pointermove', { screenX: 120 });
  await settle();
  cat.dispatch('pointerup', { screenX: 120 });
  await settle();
  assert.deepEqual(calls, ['start', 'move', 'move', 'end']);
  assert.equal(cat.hasPointerCapture(1), false);
  assert.equal(cat.dataset.dragging, 'false');
});

test('cancelled pointer gestures do not pet and still end a started native drag', async () => {
  const calls: string[] = [];
  let startReady!: () => void;
  const ui = mount({
    startDrag: () => new Promise(resolve => { calls.push('start'); startReady = resolve; }),
    endDrag: async () => { calls.push('end'); },
    dragPet: async () => { calls.push('move'); },
    care: async () => { calls.push('pet'); return state(); },
  }, false);
  await settle();
  ui.get('cat').dispatch('pointerdown');
  ui.get('cat').dispatch('pointercancel');
  await settle();
  assert.deepEqual(calls, []);
  ui.get('cat').dispatch('pointerdown');
  ui.get('cat').dispatch('pointermove', { screenX: 110 });
  ui.get('cat').dispatch('lostpointercapture');
  startReady();
  await settle();
  assert.deepEqual(calls, ['start', 'end']);
});
