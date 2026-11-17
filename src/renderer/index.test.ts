import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import type { NookiApi, Settings, Snapshot } from '../shared/contracts.js';
import { DEFAULT_SETTINGS, IDLE_MOTION } from '../shared/contracts.js';

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
  static active: Control | undefined;
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
  style = { setProperty: (_name: string, _value: string) => {} };
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
  replaceChildren(...children: Control[]): void { this.children = children; }
  setAttribute(name: string, value: string): void { this.attributes[name] = value; }
  removeAttribute(name: string): void { delete this.attributes[name]; }
  focus(): void { this.focused = true; Control.active = this; }
  blur(): void { this.focused = false; if (Control.active === this) Control.active = undefined; }
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
    pet: { species: 'cat', hunger: 20, energy: 80, mood: 'idle', atHome: false, manualSleep: false, lastTickAt: 0, lastInteractionAt: 0, lastCommentAt: 0, reactionUntil: 0, disturbance: 0, lastDisturbedAt: 0, activeTimeMs: 0, lastBreakReminderAt: 0 },
    settings: { ...DEFAULT_SETTINGS, allowedApps: [] },
    model: { phase: 'not-installed', downloadedBytes: 0, totalBytes: 100 },
    modelInfo: { id: 'test', name: 'Test local model', sizeBytes: 100, license: 'Test license', licenseUrl: 'https://example.invalid/license', sourceUrl: 'https://example.invalid/model', resourceNote: 'Test resource disclosure' },
    comment: null, error: null, platform: 'win32', packaged: false, moving: false,
    attention: { x: 0, y: 0, nearby: false }, motion: { ...IDLE_MOTION }, systemReducedMotion: false, windowFollowing: 'Desktop',
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
  get('settings-form').children = ['pet-species', 'launch-at-login', 'comment-frequency', 'motion-level', 'follow-window', 'ai-enabled', 'allowed-apps', 'pet-size', 'break-reminders', 'coat-pattern', 'coat-color', 'accent-color'].map(get);
  let nextSnapshot = state();
  let now = 0;
  let listener: (snapshot: Snapshot) => void = () => {};
  const calls: Settings[] = [];
  const previews: Array<{ snapshot: Snapshot; active: boolean }> = [];
  const api: NookiApi = {
    getSnapshot: async () => nextSnapshot,
    care: async () => nextSnapshot,
    setSleeping: async () => nextSnapshot,
    setCareMenuOpen: async () => {},
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
    onSnapshot: handler => { listener = handler; return () => {}; },
    onAttention: () => () => {},
    onMotion: () => () => {},
    ...overrides,
  };
  runInNewContext(source, {
    URLSearchParams, location: { search: settingsView ? '?view=settings' : '' }, performance: { now: () => now },
    CustomEvent, Option: class extends Control { constructor(label: string, value: string) { super(); this.textContent = label; this.value = value; } },
    window: { nooki: api, addEventListener() {}, dispatchEvent(event: CustomEvent) { previews.push(event.detail); } },
    document: {
      body: new Control(), getElementById: (id: string) => controls.get(id),
      get activeElement() { return Control.active; },
      querySelectorAll: () => [...controls.values()],
    },
  });
  return { get, calls, previews, advance(ms: number) { now += ms; }, emit(snapshot: Snapshot) { nextSnapshot = snapshot; listener(snapshot); } };
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

test('coat closet previews drafts without saving, preserves them across snapshots, and retains contrast in single mode', async () => {
  const ui = mount();
  await settle();
  ui.get('coat-page').dispatch('click');
  ui.get('palette-cocoa').dispatch('click');
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.get('company-panel').hidden, true);
  assert.equal(ui.get('coat-panel').hidden, false);
  assert.equal(ui.previews.at(-1)?.active, true);
  assert.equal(ui.previews.at(-1)?.snapshot.settings.coatColor, '#79584f');
  ui.get('coat-pattern').value = 'single';
  ui.get('coat-pattern').dispatch('change');
  assert.equal(ui.get('accent-color').disabled, true);
  ui.emit(state());
  assert.equal(ui.get('coat-color').value, '#79584f');
  assert.equal(ui.get('accent-color').value, '#f4dfc3');
  ui.get('coat-pattern').value = 'dual';
  ui.get('coat-pattern').dispatch('change');
  assert.equal(ui.get('accent-color').disabled, false);
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.equal(ui.calls[0]?.coatPattern, 'dual');
  assert.equal(ui.calls[0]?.coatColor, '#79584f');
  assert.equal(ui.calls[0]?.accentColor, '#f4dfc3');
  ui.get('company-page').dispatch('click');
  assert.equal(ui.previews.at(-1)?.active, false);
});

test('reverting coat edits leaves other unsaved settings intact', async () => {
  const ui = mount();
  await settle();
  ui.get('comment-frequency').value = 'chatty';
  ui.get('comment-frequency').dispatch('change');
  ui.get('palette-cloud').dispatch('click');
  ui.get('revert-coat').dispatch('click');
  assert.equal(ui.get('coat-color').value, DEFAULT_SETTINGS.coatColor);
  assert.equal(ui.get('comment-frequency').value, 'chatty');
  assert.equal(ui.get('save-button').disabled, false);
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.equal(ui.calls[0]?.coatColor, DEFAULT_SETTINGS.coatColor);
  assert.equal(ui.calls[0]?.commentFrequency, 'chatty');
});

test('color edits made during save stay in the preview and remain unsaved', async () => {
  let resolveSave!: (value: Snapshot) => void;
  let sent!: Settings;
  const ui = mount({ updateSettings: settings => {
    sent = settings;
    return new Promise(resolve => { resolveSave = resolve; });
  } });
  await settle();
  ui.get('coat-color').value = '#123456';
  ui.get('coat-color').dispatch('input');
  ui.get('settings-form').dispatch('submit');
  ui.get('coat-color').value = '#654321';
  ui.get('coat-color').dispatch('input');
  resolveSave({ ...state(), settings: sent });
  await settle();
  assert.equal(ui.get('coat-color').value, '#654321');
  assert.equal(ui.previews.at(-1)?.snapshot.settings.coatColor, '#654321');
  assert.equal(ui.get('save-button').disabled, false);
});

test('failed coat saves report the error without losing draft colors', async () => {
  const ui = mount({ updateSettings: async () => { throw new Error('Disk is full.'); } });
  await settle();
  ui.get('palette-peach').dispatch('click');
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.match(ui.get('settings-error').textContent, /Disk is full/);
  assert.equal(ui.get('coat-color').value, '#d99576');
  assert.equal(ui.get('save-button').disabled, false);
});

test('reverting a coat during save is treated as a newer draft instead of being overwritten', async () => {
  let resolveSave!: (value: Snapshot) => void;
  let sent!: Settings;
  const ui = mount({ updateSettings: settings => {
    sent = settings;
    return new Promise(resolve => { resolveSave = resolve; });
  } });
  await settle();
  ui.get('palette-cocoa').dispatch('click');
  ui.get('settings-form').dispatch('submit');
  ui.get('revert-coat').dispatch('click');
  resolveSave({ ...state(), settings: sent });
  await settle();
  assert.equal(ui.get('coat-color').value, DEFAULT_SETTINGS.coatColor);
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

test('speech only displays supplied comments, including a quiet going-home sequence', async () => {
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
  assert.equal(ui.get('speech').hidden, true);
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
  incoming.settings.motionLevel = 'still';
  ui.emit(incoming);
  assert.equal(ui.get('pet-size').value, '1.3');
  assert.equal(ui.get('break-reminders').checked, false);
  assert.equal(ui.get('motion-level').value, 'still');
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.equal(ui.calls[0]!.petSize, 1.3);
  assert.equal(ui.calls[0]!.breakReminders, false);
  assert.equal(ui.calls[0]!.motionLevel, 'still');
});

test('right-click and keyboard open radial care icons; Escape closes and restores keyboard focus', async () => {
  const actions: string[] = [];
  const ui = mount({ care: async action => { actions.push(action); return state(); } }, false);
  await settle();
  ui.get('cat').dispatch('contextmenu');
  await settle();
  assert.equal(ui.get('pet-menu').hidden, false);
  ui.get('care-feed').dispatch('click');
  await settle();
  assert.deepEqual(actions, ['feed']);
  assert.equal(ui.get('pet-menu').hidden, true);
  ui.get('cat').dispatch('keydown', { key: 'Enter' });
  await settle();
  assert.equal(ui.get('care-feed').focused, true);
  ui.get('pet-menu').dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(ui.get('care-play').focused, true);
  ui.get('pet-menu').dispatch('keydown', { key: 'Escape' });
  assert.equal(ui.get('pet-menu').hidden, true);
  assert.equal(ui.get('cat').focused, true);
});

test('app presets remain opt-in and merge with custom names without widening saved aliases', async () => {
  const ui = mount();
  await settle();
  assert.equal(ui.get('app-chrome').checked, false);
  ui.get('app-chrome').checked = true;
  ui.get('app-chrome').dispatch('change');
  ui.get('allowed-apps').value = 'devenv.exe';
  ui.get('allowed-apps').dispatch('input');
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.deepEqual(Array.from(ui.calls[0]!.allowedApps), ['chrome.exe', 'devenv.exe']);
  const saved = state();
  saved.settings.allowedApps = ['OUTLOOK.EXE'];
  ui.emit(saved);
  ui.get('pet-size').value = '1.3';
  ui.get('pet-size').dispatch('change');
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.deepEqual(Array.from(ui.calls[1]!.allowedApps), ['OUTLOOK.EXE']);
});

test('the sleep control requests a nap, and a tap wakes rather than pets', async () => {
  const requests: boolean[] = [];
  const asleep = state();
  asleep.pet.mood = 'sleeping';
  asleep.pet.manualSleep = true;
  const ui = mount({ setSleeping: async value => { requests.push(value); return value ? asleep : state(); },
    care: async () => { throw new Error('A sleeping pet must wake on a tap.'); } }, false);
  await settle();
  ui.get('care-sleep').dispatch('click');
  await settle();
  assert.equal(ui.get('sleep-action-label').textContent, 'Wake');
  ui.get('cat').dispatch('pointerdown');
  ui.get('cat').dispatch('pointerup');
  await settle();
  assert.deepEqual(requests, [true, false]);
});

test('closing a pending care menu cannot reopen it or leave native motion paused', async () => {
  const requests: boolean[] = [];
  let release!: () => void;
  const ui = mount({ setCareMenuOpen: async open => {
    requests.push(open);
    if (open) await new Promise<void>(resolve => { release = resolve; });
  } }, false);
  await settle();
  ui.get('cat').dispatch('contextmenu');
  await settle();
  assert.equal(ui.get('pet-menu').hidden, true);
  ui.get('pet-menu').dispatch('keydown', { key: 'Escape' });
  release();
  await settle();
  assert.deepEqual(requests, [true, false]);
  assert.equal(ui.get('pet-menu').hidden, true);
});
test('motion-level and following drafts survive navigation and snapshots; preview never inherits travel', async () => {
  const ui = mount();
  await settle();
  ui.get('motion-level').value = 'lively';
  ui.get('motion-level').dispatch('change');
  ui.get('follow-window').checked = false;
  ui.get('follow-window').dispatch('change');
  ui.get('company-page').dispatch('click');
  assert.equal(ui.get('model-section').hidden, false);
  assert.equal(ui.get('coat-panel').hidden, true);
  const walking = state();
  walking.motion = { state: 'walking', speed: 80, direction: -1, progress: 0 };
  walking.systemReducedMotion = true;
  ui.emit(walking);
  ui.get('coat-page').dispatch('click');
  assert.equal(ui.get('model-section').hidden, true);
  assert.equal(ui.get('system-motion-note').hidden, false);
  assert.equal(ui.get('motion-level').value, 'lively');
  assert.equal(ui.previews.at(-1)?.snapshot.motion.state, 'idle');
  ui.get('settings-form').dispatch('submit');
  await settle();
  assert.equal(ui.calls[0]?.motionLevel, 'lively');
  assert.equal(ui.calls[0]?.followWindow, false);
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
  assert.equal(cat.focused, false);
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
