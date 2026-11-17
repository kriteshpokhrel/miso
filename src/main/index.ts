import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { breakReminder, care, commentCooldown, createPet, disturb, scriptedComment, setHome, shouldFollowCursor, tick } from '../domain/pet.js';
import { DEFAULT_SETTINGS } from '../shared/contracts.js';
import type { Attention, CareAction, PetState, Settings, Snapshot } from '../shared/contracts.js';
import { LocalAiService, MODEL_INFO } from './ai/service.js';
import { foregroundAppName } from './foreground.js';
import { StateStore } from './store.js';
import { normalizeAppName, validateCare, validateSettings } from './validation.js';
import { cursorAttention, NEUTRAL_ATTENTION } from '../domain/attention.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const rendererFile = path.resolve(directory, '../renderer/index.html');
const WINDOW_SIZE = 300;
const smoke = process.argv.includes('--smoke-test');
const smokeDirectory = app.isPackaged
  ? path.join(path.dirname(process.execPath), '.smoke-data')
  : path.resolve(directory, '../../.smoke-data');
if (smoke) app.setPath('userData', smokeDirectory);
let pet: PetState;
let settings: Settings = { ...DEFAULT_SETTINGS, allowedApps: [] };
let overlay: BrowserWindow | null = null;
let preferences: BrowserWindow | null = null;
let tray: Tray | null = null;
let ai: LocalAiService;
let store: StateStore;
let lastError: string | null = null;
let comment: string | null = null;
let commentUntil = 0;
let quitting = false;
let homeTravel = false;
let destinationX = 0;
let moveAt = 0;
let lastSimulation = 0;
let lastSaved = 0;
let lastAiPoll = 0;
let aiBusy = false;
let timer: ReturnType<typeof setInterval> | null = null;
let foregroundFailureReported = false;
let modelStateReady = false;
let nextMimicAt = Date.now() + 90_000;
let overlayMoving = false;
let dragging = false;
let dragDistance = 0;
let dragOrigin = { x: 0, y: 0 };
let windowOrigin = { x: 0, y: 0 };
let previousDragPoint = { x: 0, y: 0 };
let lastDragUpdate = 0;
let attention: Attention = { ...NEUTRAL_ATTENTION };

function report(error: unknown, context: string): void {
  console.error(`Nooki ${context}:`, error);
  lastError = `${context}: ${error instanceof Error ? error.message : String(error)}`;
  if (modelStateReady) broadcast();
}

function snapshot(): Snapshot {
  return {
    pet, settings, model: ai.getStatus(), modelInfo: MODEL_INFO, comment, error: lastError,
    platform: process.platform, packaged: app.isPackaged, moving: overlayMoving, attention,
  };
}

function broadcast(): void {
  for (const window of [overlay, preferences]) {
    if (window && !window.isDestroyed() && !window.webContents.isLoading()) {
      window.webContents.send('nooki:snapshot', snapshot());
    }
  }
}

async function save(): Promise<void> {
  await store.save({ version: 1, pet, settings });
}

function secureWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true }));
}

function createOverlay(): void {
  const size = Math.round(WINDOW_SIZE * settings.petSize);
  overlay = new BrowserWindow({
    width: size, height: size, useContentSize: true,
    transparent: true, backgroundColor: '#00000000', frame: false,
    resizable: false, maximizable: false, minimizable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: false,
    webPreferences: {
      preload: path.join(directory, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      backgroundThrottling: true,
      partition: 'nooki-pet',
    },
  });
  secureWindow(overlay);
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  overlay.webContents.on('did-finish-load', () => overlay?.webContents.setZoomFactor(settings.petSize));
  overlay.on('blur', finishDrag);
  overlay.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      void goHome().catch((error: unknown) => report(error, 'Could not send Nooki home'));
    }
  });
  overlay.once('ready-to-show', () => {
    positionAtBottom();
    if (!pet.atHome) overlay?.showInactive();
  });
  void overlay.loadFile(rendererFile).catch((error: unknown) => report(error, 'Could not load pet interface'));
}

function positionAtBottom(): void {
  if (!overlay) return;
  const area = screen.getPrimaryDisplay().workArea;
  const size = Math.round(WINDOW_SIZE * settings.petSize);
  setPetBounds(Math.max(area.x, Math.min(area.x + Math.max(0, area.width - size), area.x + area.width * 0.65 - size / 2)),
    Math.max(area.y, area.y + area.height - size));
  destinationX = overlay.getBounds().x;
}

function setPetBounds(x: number, y: number): void {
  const size = Math.round(WINDOW_SIZE * settings.petSize);
  // Carry explicit dimensions: setPosition can grow frameless windows at fractional Windows DPI.
  overlay?.setBounds({ x: Math.round(x), y: Math.round(y), width: size, height: size }, false);
}

function openSettings(): void {
  if (preferences && !preferences.isDestroyed()) { preferences.show(); preferences.focus(); return; }
  preferences = new BrowserWindow({
    width: 660, height: 800, minWidth: 480, minHeight: 540,
    title: 'Nooki settings', backgroundColor: '#f5f6f3', autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(directory, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      partition: 'nooki-settings',
    },
  });
  secureWindow(preferences);
  preferences.once('ready-to-show', () => preferences?.show());
  preferences.on('closed', () => { preferences = null; });
  void preferences.loadFile(rendererFile, { query: { view: 'settings' } })
    .catch((error: unknown) => report(error, 'Could not load settings'));
}

function restore(): void {
  dragging = false;
  homeTravel = false;
  pet = setHome(pet, false, Date.now());
  positionAtBottom();
  overlay?.showInactive();
  comment = null;
  lastError = null;
  broadcast();
  void save().catch((error: unknown) => report(error, 'Could not save restored state'));
}

async function goHome(): Promise<void> {
  if (pet.atHome) return;
  finishDrag();
  pet = setHome(pet, true, Date.now());
  updateAttention();
  comment = null;
  homeTravel = true;
  if (settings.reducedMotion) { homeTravel = false; overlay?.hide(); }
  broadcast();
  await save();
  await ai.dispose();
}

function createTray(): void {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const face = ((x - 16) ** 2 / 144 + (y - 19) ** 2 / 100) < 1;
      const ears = y >= 3 && y <= 16 && ((x >= 4 && x <= 13 && x - 4 < y - 2) || (x >= 19 && x <= 28 && 28 - x < y - 2));
      const eye = (x === 11 || x === 21) && y >= 17 && y <= 20;
      const i = (y * size + x) * 4;
      pixels[i] = eye ? 245 : 68;
      pixels[i + 1] = eye ? 245 : 72;
      pixels[i + 2] = eye ? 245 : 91;
      pixels[i + 3] = face || ears ? 255 : 0;
    }
  }
  const image = nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 1 });
  if (process.platform === 'darwin') image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Nooki - your desktop companion');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Bring Nooki back', click: restore },
    { label: 'Send Nooki home', click: () => { void goHome().catch((error: unknown) => report(error, 'Home failed')); } },
    { type: 'separator' },
    { label: 'Settings', click: openSettings },
    { label: 'Quit Nooki', click: () => app.quit() },
  ]));
  tray.on('click', restore);
}

function checkSender(event: IpcMainInvokeEvent, scope: 'any' | 'settings' | 'pet' = 'any'): void {
  const sender = event.sender;
  const known = scope === 'settings' ? preferences?.webContents === sender
    : scope === 'pet' ? overlay?.webContents === sender
      : overlay?.webContents === sender || preferences?.webContents === sender;
  if (!known || event.senderFrame !== sender.mainFrame) throw new Error('Untrusted request.');
}

function registerIpc(): void {
  const handle = (channel: string, handler: (value: unknown) => unknown | Promise<unknown>, scope: 'any' | 'settings' | 'pet' = 'any'): void => {
    ipcMain.handle(channel, async (event, value: unknown) => {
      checkSender(event, scope);
      try { return await handler(value); }
      catch (error) { report(error, 'Action failed'); throw error; }
    });
  };
  handle('nooki:snapshot', () => snapshot());
  handle('nooki:care', (value) => giveCare(validateCare(value)));
  handle('nooki:home', goHome);
  handle('nooki:restore', restore);
  handle('nooki:settings', openSettings);
  handle('nooki:update-settings', async (value) => {
    const next = validateSettings(value);
    if (app.isPackaged && !smoke) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
      if (app.getLoginItemSettings().openAtLogin !== next.launchAtLogin) {
        throw new Error('The operating system did not accept the sign-in setting. Check your startup applications.');
      }
    }
    settings = next;
    updateAttention();
    if (overlay) {
      overlay.webContents.setZoomFactor(settings.petSize);
      if (!dragging) positionAtBottom();
      else {
        const bounds = overlay.getBounds();
        setPetBounds(bounds.x, bounds.y);
      }
    }
    lastError = null;
    if (settings.commentFrequency === 'off') comment = null;
    await save();
    if (!settings.aiEnabled) await ai.dispose();
    broadcast();
    return snapshot();
  }, 'settings');
  handle('nooki:download-model', async (value) => {
    if (value !== true) throw new Error('Explicit download consent is required.');
    await ai.download(true);
  }, 'settings');
  handle('nooki:cancel-model', () => ai.cancelDownload(), 'settings');
  handle('nooki:remove-model', async () => {
    settings = { ...settings, aiEnabled: false };
    await save();
    await ai.remove();
    broadcast();
  }, 'settings');
  handle('nooki:drag-start', startDrag, 'pet');
  handle('nooki:drag', dragPet, 'pet');
  handle('nooki:drag-end', finishDrag, 'pet');
  handle('nooki:pet-menu', openPetMenu, 'pet');
}

function say(line: string, duration = 6500): void {
  if (settings.commentFrequency === 'off' || pet.atHome) return;
  comment = line;
  commentUntil = Date.now() + duration;
  pet.lastCommentAt = Date.now();
}

async function giveCare(action: CareAction): Promise<Snapshot> {
  if (pet.atHome) throw new Error('Restore Nooki before giving care.');
  pet = care(pet, action, Date.now());
  say({
    feed: 'A tiny feast. An enormous thank you.',
    pet: 'Yes. This is exactly where your hand belongs.',
    play: 'I definitely meant to miss that.',
  }[action], 5500);
  lastError = null;
  broadcast();
  await save();
  return snapshot();
}

function openPetMenu(): void {
  if (!overlay || pet.atHome) return;
  finishDrag();
  const offer = (action: CareAction): void => {
    void giveCare(action).catch((error: unknown) => report(error, 'Care failed'));
  };
  Menu.buildFromTemplate([
    { label: 'A tiny feast (Feed)', click: () => offer('feed') },
    { label: 'Give scritches (Pet)', click: () => offer('pet') },
    { label: 'Play a little', click: () => offer('play') },
    { type: 'separator' },
    { label: 'Home, sweet home', click: () => { void goHome().catch((error: unknown) => report(error, 'Home failed')); } },
    { label: "Nooki's quirks (Settings)", click: openSettings },
  ]).popup({ window: overlay });
}

function startDrag(): void {
  if (!overlay || pet.atHome || dragging) return;
  dragging = true;
  dragDistance = 0;
  dragOrigin = screen.getCursorScreenPoint();
  previousDragPoint = dragOrigin;
  const bounds = overlay.getBounds();
  windowOrigin = { x: bounds.x, y: bounds.y };
}

function dragPet(): void {
  if (!dragging || !overlay || Date.now() - lastDragUpdate < 25) return;
  lastDragUpdate = Date.now();
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const size = Math.round(WINDOW_SIZE * settings.petSize);
  const x = Math.max(area.x, Math.min(area.x + Math.max(0, area.width - size), windowOrigin.x + cursor.x - dragOrigin.x));
  const y = Math.max(area.y, Math.min(area.y + Math.max(0, area.height - size), windowOrigin.y + cursor.y - dragOrigin.y));
  dragDistance += Math.hypot(cursor.x - previousDragPoint.x, cursor.y - previousDragPoint.y);
  previousDragPoint = cursor;
  setPetBounds(x, y);
}

function finishDrag(): void {
  if (!dragging) return;
  dragPet();
  dragging = false;
  if (dragDistance < 8) return;
  const wasIrritated = pet.mood === 'irritated';
  pet = disturb(pet, dragDistance, Date.now());
  if (!wasIrritated && pet.mood === 'irritated') {
    say('I could close that app... kidding. I only have paws.', 7500);
  }
  broadcast();
  void save().catch((error: unknown) => report(error, 'Could not save reaction'));
}

async function maybeAiComment(now: number): Promise<void> {
  if (aiBusy || pet.atHome || !settings.aiEnabled || settings.allowedApps.length === 0
    || settings.commentFrequency === 'off' || ai.getStatus().phase !== 'ready'
    || now - pet.lastCommentAt < commentCooldown(settings.commentFrequency)
    || now - lastAiPoll < 30_000) return;
  lastAiPoll = now;
  aiBusy = true;
  try {
    const name = await foregroundAppName();
    if (!name || !dynamicCommentStillAllowed(name)) return;
    const text = await ai.generate(name, pet);
    if (text && dynamicCommentStillAllowed(name)
      && Date.now() - pet.lastCommentAt >= commentCooldown(settings.commentFrequency)) {
      comment = text;
      commentUntil = Date.now() + 8000;
      pet.lastCommentAt = Date.now();
      broadcast();
    }
    foregroundFailureReported = false;
  } catch (error) {
    if (!foregroundFailureReported) report(error, 'Local application comments unavailable');
    foregroundFailureReported = true;
  } finally { aiBusy = false; }
}

function dynamicCommentStillAllowed(name: string): boolean {
  return !pet.atHome && settings.aiEnabled && settings.commentFrequency !== 'off'
    && settings.allowedApps.includes(normalizeAppName(name));
}

function moveOverlay(now: number): void {
  overlayMoving = false;
  if (!overlay || overlay.isDestroyed() || (!overlay.isVisible() && !homeTravel)) return;
  if (dragging) return;
  const bounds = overlay.getBounds();
  const size = Math.round(WINDOW_SIZE * settings.petSize);
  const area = screen.getDisplayMatching(bounds).workArea;
  const min = area.x;
  const max = area.x + Math.max(0, area.width - size);
  destinationX = Math.max(min, Math.min(max, destinationX));
  let x = Math.max(min, Math.min(max, bounds.x));
  const floor = Math.max(area.y, area.y + area.height - size);
  let y = bounds.y + Math.sign(floor - bounds.y) * Math.min(settings.reducedMotion ? Math.abs(floor - bounds.y) : 14, Math.abs(floor - bounds.y));
  if (homeTravel) {
    const edge = x < min + (max - min) / 2 ? min : max;
    x += Math.sign(edge - x) * Math.min(20, Math.abs(edge - x));
    if (Math.abs(edge - x) < 2) { homeTravel = false; overlay.hide(); }
  } else if (!pet.atHome && !settings.reducedMotion && pet.mood !== 'sleeping'
    && pet.mood !== 'irritated' && pet.mood !== 'mimicking') {
    if (shouldFollowCursor(pet)) {
      const cursor = screen.getCursorScreenPoint();
      const cursorArea = screen.getDisplayNearestPoint(cursor).workArea;
      const target = Math.max(cursorArea.x, Math.min(cursorArea.x + Math.max(0, cursorArea.width - size), cursor.x - size / 2));
      if (screen.getDisplayNearestPoint(cursor).id !== screen.getDisplayMatching(bounds).id) {
        x = Math.max(cursorArea.x, Math.min(cursorArea.x + Math.max(0, cursorArea.width - size), cursor.x));
        y = cursorArea.y + cursorArea.height - size;
      } else {
        x += Math.sign(target - x) * Math.min(7, Math.abs(target - x));
      }
    } else if (pet.mood !== 'playing' && pet.mood !== 'purring') {
      if (now > moveAt) { destinationX = min + Math.random() * (max - min); moveAt = now + 15_000 + Math.random() * 20_000; }
      x += Math.sign(destinationX - x) * Math.min(2, Math.abs(destinationX - x));
    }
  }
  overlayMoving = Math.abs(x - bounds.x) > 0.5;
  if (Math.round(x) !== bounds.x || Math.round(y) !== bounds.y) setPetBounds(x, y);
}

function step(): void {
  const now = Date.now();
  moveOverlay(now);
  updateAttention();
  if (now - lastSimulation < 1000) return;
  lastSimulation = now;
  pet = tick(pet, now);
  if (overlayMoving && pet.mood === 'idle') pet.mood = 'walking';
  if (now > commentUntil) comment = null;
  if (!pet.atHome) {
    const reminder = breakReminder(pet, settings.breakReminders, settings.commentFrequency, now);
    if (reminder) {
      say(reminder, 8000);
      pet.lastBreakReminderAt = pet.activeTimeMs;
    }
    if (now >= nextMimicAt && !dragging && pet.reactionUntil <= now && pet.energy > 30 && pet.hunger < 70) {
      nextMimicAt = now + 120_000 + Math.random() * 120_000;
      pet = { ...pet, mood: 'mimicking', reactionUntil: now + 14_000 };
      if (now - pet.lastCommentAt >= commentCooldown(settings.commentFrequency)) {
        say('If you are working, I am working. These paws have deadlines.');
      }
    }
    if (!reminder) void maybeAiComment(now);
    if (!aiBusy && !reminder) {
      const line = scriptedComment(pet, settings.commentFrequency, now);
      if (line) { comment = line; commentUntil = now + 6500; pet.lastCommentAt = now; }
    }
  }
  broadcast();
  if (now - lastSaved > 30_000) {
    lastSaved = now;
    void save().catch((error: unknown) => report(error, 'Could not save Nooki'));
  }
}

function updateAttention(): void {
  const next = overlay && overlay.isVisible() && !pet.atHome && pet.mood !== 'sleeping'
    && !settings.reducedMotion && !dragging
    ? cursorAttention(screen.getCursorScreenPoint(), overlay.getBounds())
    : { ...NEUTRAL_ATTENTION };
  if (next.nearby === attention.nearby && Math.abs(next.x - attention.x) < 0.005
    && Math.abs(next.y - attention.y) < 0.005) return;
  attention = next;
  if (overlay && !overlay.webContents.isLoading()) overlay.webContents.send('nooki:attention', attention);
}
async function start(): Promise<void> {
  store = new StateStore(app.getPath('userData'));
  const loaded = await store.load();
  settings = loaded.state?.settings ?? { ...DEFAULT_SETTINGS, allowedApps: [] };
  pet = loaded.state?.pet ?? createPet(Date.now());
  if (smoke) {
    settings = { ...DEFAULT_SETTINGS, allowedApps: [] };
    pet = createPet(Date.now());
  }
  pet.lastTickAt = Date.now();
  pet.reactionUntil = 0;
  lastError = loaded.error;
  ai = new LocalAiService(path.join(app.getPath('userData'), 'models'), () => {
    if (modelStateReady) broadcast();
  });
  await ai.initialize();
  modelStateReady = true;
  if (app.isPackaged && !smoke) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  createTray();
  createOverlay();
  registerIpc();
  if (!loaded.state && !smoke) openSettings();
  timer = setInterval(step, 100);
  await save();
  if (smoke) {
    const window = overlay;
    if (!window) throw new Error('Overlay creation failed.');
    if (window.webContents.isLoadingMainFrame()) {
      await new Promise<void>((resolve, reject) => {
        window.webContents.once('did-finish-load', () => resolve());
        window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
      });
    }
    const result: unknown = await window.webContents.executeJavaScript(`({
      bridge: typeof window.nooki?.getSnapshot === 'function',
      nodeBlocked: typeof window.require === 'undefined',
      title: document.title,
      hasToolbar: Boolean(document.querySelector('#pet-view .pet-controls'))
    })`);
    console.log('NOOKI_SMOKE', JSON.stringify(result));
    if (typeof result !== 'object' || result === null
      || !(result as Record<string, unknown>).bridge || !(result as Record<string, unknown>).nodeBlocked) {
      throw new Error('Desktop isolation smoke failed.');
    }
    if ((result as Record<string, unknown>).hasToolbar) throw new Error('Desktop still contains a persistent care toolbar.');
    const imageDirectory = smokeDirectory;
    await mkdir(imageDirectory, { recursive: true });
    const graphicsDeadline = Date.now() + 15_000;
    let graphicsReady = false;
    while (!graphicsReady && Date.now() < graphicsDeadline) {
      graphicsReady = await window.webContents.executeJavaScript(`document.getElementById('pet-canvas')?.dataset.ready === 'true'`);
      if (!graphicsReady) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!graphicsReady) {
      const error: string = await window.webContents.executeJavaScript(`document.getElementById('pet-render-error')?.textContent`);
      throw new Error(`The real WebGL cat did not render: ${error}`);
    }
    const initialImage = await window.capturePage();
    const pixels = initialImage.toBitmap();
    let visiblePixels = 0;
    let transparentPixels = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] === 0) transparentPixels++;
      else visiblePixels++;
    }
    if (visiblePixels < 500 || transparentPixels < 500) throw new Error('The 3D overlay is blank or not transparent.');
    await writeFile(path.join(imageDirectory, 'idle.png'), initialImage.toPNG());
    if (timer) clearInterval(timer);
    try {
      pet = { ...pet, mood: 'idle' };
      overlayMoving = false;
      comment = null;
      attention = { ...NEUTRAL_ATTENTION };
      broadcast();
      for (const [name, x] of [['look-left', -1], ['look-right', 1], ['look-neutral', 0]] as const) {
        window.webContents.send('nooki:attention', { x, y: 0, nearby: x !== 0 });
        await new Promise(resolve => setTimeout(resolve, 650));
        const yaw: number = await window.webContents.executeJavaScript(`Number(document.getElementById('pet-canvas').dataset.lookX)`);
        if (x === 0 ? Math.abs(yaw) > 0.02 : yaw * x < 0.45) throw new Error(`3D ${name} head tracking failed: ${yaw}`);
        await writeFile(path.join(imageDirectory, `${name}.png`), (await window.capturePage()).toPNG());
      }
    } finally { timer = setInterval(step, 100); }
    const originalBounds = window.getBounds();
    for (let index = 0; index < 30; index++) setPetBounds(originalBounds.x + index % 2, originalBounds.y);
    if (Math.abs(window.getContentBounds().width - WINDOW_SIZE) > 1) {
      throw new Error('Repeated high-DPI movement changed the pet size.');
    }
    const before = pet.hunger;
    await window.webContents.executeJavaScript(`window.nooki.care('feed')`);
    if (pet.hunger > before) throw new Error('Feed smoke failed.');
    await window.webContents.executeJavaScript(`window.nooki.care('play')`);
    await window.webContents.executeJavaScript(`window.nooki.care('pet')`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(path.join(imageDirectory, 'pet.png'), (await window.capturePage()).toPNG());
    pet = { ...pet, mood: 'mimicking', reactionUntil: Date.now() + 14_000 };
    comment = null;
    broadcast();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(path.join(imageDirectory, 'mimicking.png'), (await window.capturePage()).toPNG());
    pet = disturb({ ...pet, disturbance: 59 }, 300, Date.now());
    if (pet.mood !== 'irritated') throw new Error('Drag disturbance did not trigger an irritated reaction.');
    say('I could close that app... kidding. I only have paws.');
    broadcast();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(path.join(imageDirectory, 'irritated.png'), (await window.capturePage()).toPNG());
    pet = { ...pet, activeTimeMs: 45 * 60 * 1000, lastBreakReminderAt: 0, lastCommentAt: 0 };
    lastSimulation = 0;
    step();
    if (pet.lastBreakReminderAt < 45 * 60 * 1000 || !comment) throw new Error('Affectionate break reminder did not trigger.');
    const disturbanceBeforeTap = pet.disturbance;
    await window.webContents.executeJavaScript(`window.nooki.startDrag().then(() => window.nooki.endDrag())`);
    if (pet.disturbance > disturbanceBeforeTap) throw new Error('A stationary tap incorrectly disturbed Nooki.');
    attention = { x: 1, y: 0, nearby: true };
    await window.webContents.executeJavaScript(`window.nooki.goHome()`);
    if (!pet.atHome) throw new Error('Home smoke failed.');
    if (attention.nearby || attention.x !== 0 || attention.y !== 0) throw new Error('Home did not neutralize cursor attention.');
    const homeDeadline = Date.now() + 10_000;
    while (window.isVisible() && Date.now() < homeDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (window.isVisible()) throw new Error('Home edge animation did not hide the overlay.');
    const homeHunger = pet.hunger;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    if (pet.hunger !== homeHunger) throw new Error('Needs did not pause at home.');
    await window.webContents.executeJavaScript(`window.nooki.restore()`);
    if (pet.atHome) throw new Error('Restore smoke failed.');
    openSettings();
    const settingsWindow = preferences;
    if (!settingsWindow) throw new Error('Settings creation failed.');
    if (settingsWindow.webContents.isLoadingMainFrame()) {
      await new Promise<void>((resolve) => settingsWindow.webContents.once('did-finish-load', () => resolve()));
    }
    attention = { x: 1, y: 0, nearby: true };
    await settingsWindow.webContents.executeJavaScript(`window.nooki.updateSettings({
      launchAtLogin: false, aiEnabled: false, reducedMotion: true,
      commentFrequency: 'balanced', allowedApps: ['Code.exe'], petSize: 1.3, breakReminders: true
    })`);
    if (settings.launchAtLogin || !settings.reducedMotion || settings.allowedApps[0] !== 'code.exe') {
      throw new Error('Settings IPC smoke failed.');
    }
    if (attention.nearby) throw new Error('Reduced motion did not disable native cursor attention.');
    await new Promise(resolve => setTimeout(resolve, 200));
    const reducedYaw: number = await window.webContents.executeJavaScript(`Number(document.getElementById('pet-canvas').dataset.lookX)`);
    if (reducedYaw !== 0) throw new Error('Reduced motion left the 3D head tracking.');
    if (Math.abs(window.getContentBounds().width - 390) > 1 || Math.abs(window.webContents.getZoomFactor() - 1.3) > 0.01) {
      throw new Error(`Configurable native pet size smoke failed: content=${JSON.stringify(window.getContentBounds())}; outer=${JSON.stringify(window.getBounds())}; zoom=${window.webContents.getZoomFactor()}`);
    }
    const denied: boolean = await window.webContents.executeJavaScript(`window.nooki.updateSettings({
      launchAtLogin: false, aiEnabled: false, reducedMotion: true,
      commentFrequency: 'quiet', allowedApps: []
    }).then(() => false, () => true)`);
    if (!denied) throw new Error('Overlay was allowed to modify privileged settings.');
    const consentDenied: boolean = await settingsWindow.webContents.executeJavaScript(
      `window.nooki.downloadModel(false).then(() => false, () => true)`);
    if (!consentDenied) throw new Error('Model download did not require explicit consent.');
    lastError = null;
    broadcast();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await writeFile(path.join(imageDirectory, 'settings.png'), (await settingsWindow.capturePage()).toPNG());
    const waitForColors = async (target: BrowserWindow, canvas: string, base: string, accent: string): Promise<void> => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const matches: boolean = await target.webContents.executeJavaScript(`(() => {
          const canvas = document.getElementById(${JSON.stringify(canvas)});
          return canvas?.dataset.ready === 'true' && canvas.dataset.coatColor === ${JSON.stringify(base)}
            && canvas.dataset.accentColor === ${JSON.stringify(accent)};
        })()`);
        if (matches) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`The actual 3D ${canvas} did not render the chosen coat colors.`);
    };
    const coatBeforePreview = settings.coatColor;
    await settingsWindow.webContents.executeJavaScript(`document.getElementById('coat-page').click(); document.getElementById('palette-cocoa').click();`);
    await waitForColors(settingsWindow, 'coat-preview', '79584f', 'f4dfc3');
    if (settings.coatColor !== coatBeforePreview) throw new Error('A preview changed the saved desktop coat.');
    await writeFile(path.join(imageDirectory, 'coat-closet.png'), (await settingsWindow.capturePage()).toPNG());
    settingsWindow.setSize(500, 800);
    await new Promise(resolve => setTimeout(resolve, 300));
    const saveVisible: boolean = await settingsWindow.webContents.executeJavaScript(`(() => {
      const bounds = document.getElementById('save-button').getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight;
    })()`);
    if (!saveVisible) throw new Error('Coat customization hid Save below the compact viewport.');
    await writeFile(path.join(imageDirectory, 'coat-closet-compact.png'), (await settingsWindow.capturePage()).toPNG());
    settingsWindow.setSize(660, 800);
    await settingsWindow.webContents.executeJavaScript(`(() => {
      const pattern = document.getElementById('coat-pattern');
      pattern.value = 'single';
      pattern.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitForColors(settingsWindow, 'coat-preview', '79584f', '79584f');
    await settingsWindow.webContents.executeJavaScript(`document.getElementById('settings-form').requestSubmit()`);
    await waitForColors(window, 'pet-canvas', '79584f', '79584f');
    await writeFile(path.join(imageDirectory, 'coat-single.png'), (await window.capturePage()).toPNG());
    await new Promise<void>(resolve => {
      settingsWindow.once('closed', () => resolve());
      settingsWindow.close();
    });
    openSettings();
    const reopened = preferences;
    if (!reopened) throw new Error('Could not reopen the saved coat preferences.');
    if (reopened.webContents.isLoadingMainFrame()) {
      await new Promise<void>(resolve => reopened.webContents.once('did-finish-load', () => resolve()));
    }
    const loadedColors: boolean = await reopened.webContents.executeJavaScript(`window.nooki.getSnapshot().then(snapshot =>
      snapshot.settings.coatPattern === 'single' && snapshot.settings.coatColor === '#79584f'
        && snapshot.settings.accentColor === '#f4dfc3')`);
    if (!loadedColors) throw new Error('Reopened preferences lost the saved single coat or remembered contrast.');
    await reopened.webContents.executeJavaScript(`(() => {
      document.getElementById('coat-page').click();
      const pattern = document.getElementById('coat-pattern');
      pattern.value = 'dual';
      pattern.dispatchEvent(new Event('change', { bubbles: true }));
      const color = document.getElementById('coat-color');
      color.value = '#315b65';
      color.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForColors(reopened, 'coat-preview', '315b65', 'f4dfc3');
    await reopened.webContents.executeJavaScript(`document.getElementById('settings-form').requestSubmit()`);
    await waitForColors(window, 'pet-canvas', '315b65', 'f4dfc3');
    await writeFile(path.join(imageDirectory, 'coat-dual.png'), (await window.capturePage()).toPNG());
    if (process.argv.includes('--smoke-inference')) {
      const line = await ai.generate('code.exe', pet);
      if (ai.getStatus().phase !== 'ready') throw new Error(`Local inference smoke failed: ${ai.getStatus().error ?? 'Backend unavailable'}`);
      const fallback = scriptedComment({ ...pet, lastCommentAt: 0 }, settings.commentFrequency, Date.now());
      if (!line && !fallback) throw new Error('Rejected model output had no scripted fallback.');
      console.log('NOOKI_INFERENCE', line ?? `Generated output rejected; scripted fallback: ${fallback}`);
    }
    await save();
    const reloaded = await store.load();
    if (reloaded.state?.settings.allowedApps[0] !== 'code.exe' || !reloaded.state.settings.reducedMotion) {
      throw new Error('Saved preferences did not round-trip.');
    }
    if (reloaded.state.settings.coatPattern !== 'dual' || reloaded.state.settings.coatColor !== '#315b65'
      || reloaded.state.settings.accentColor !== '#f4dfc3') throw new Error('Custom coat colors did not persist.');
    console.log('NOOKI_SMOKE passed: real transparent WebGL, directional gaze/neutral reset, reduced motion, isolated renderer/IPC, care, mimic, irritation, break reminders, home/needs pause, restore, size, consent, privilege guards, persistent single/dual coat, draft-only 3D preview, presets/custom colors, persistence.');
    app.quit();
  }
}

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', restore);
  app.on('window-all-closed', () => { /* Tray owns the app lifetime. */ });
  app.on('activate', restore);
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    if (timer) clearInterval(timer);
    void Promise.all([store ? save() : Promise.resolve(), ai ? ai.dispose() : Promise.resolve()])
      .catch((error: unknown) => console.error('Nooki shutdown failed:', error))
      .finally(() => { tray?.destroy(); app.quit(); });
  });
  void app.whenReady().then(start).catch((error: unknown) => {
    console.error('Nooki startup failed:', error);
    quitting = true;
    app.exit(1);
  });
}
