import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, systemPreferences, Tray } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { addDisturbance, breakReminder, care, commentCooldown, createPet, idleActivity, scriptedComment, setHome, setSleeping, shouldFollowCursor, tick } from '../domain/pet.js';
import { DEFAULT_SETTINGS, IDLE_MOTION } from '../shared/contracts.js';
import type { Attention, CareAction, PetMotion, PetState, Settings, Snapshot } from '../shared/contracts.js';
import { LocalAiService, MODEL_INFO } from './ai/service.js';
import { foregroundAppName, stopForegroundLookup } from './foreground.js';
import { StateStore } from './store.js';
import { normalizeAppName, validateCare, validateIpcSender, validateSettings } from './validation.js';
import { cursorAttention, NEUTRAL_ATTENTION } from '../domain/attention.js';
import { fallPosition, hopPosition, MOTION_PROFILES, nextWalkingDisplay, walkToward, walkingSurface, type Travel, type WindowGeometry } from '../domain/motion.js';
import { createDragStress, sampleDrag } from '../domain/drag-stress.js';
import { ANGER_DURATION_MS, IRRITATION_DURATION_MS, REASSURANCE_DURATION_MS, homeBeat, irritationBeat } from '../domain/reactions.js';
import { WindowGeometryTracker } from './window-geometry.js';
import { getSpecies } from '../shared/species.js';
import { MAX_SPEECH_LENGTH, SPEECH_LIFETIME_MS } from '../shared/speech.js';
import { CARE_WIDTH, CARE_HEIGHT, SPEECH_WIDTH, SPEECH_HEIGHT, careOrbit, petUiBounds } from '../shared/pet-ui.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const rendererFile = path.resolve(directory, '../renderer/index.html');
const WINDOW_SIZE = 300;
app.setName('Miso');
app.setPath('userData', path.join(app.getPath('appData'), 'Miso'));
if (process.platform === 'win32') app.setAppUserModelId('app.miso.desktop');
const smoke = process.argv.includes('--smoke-test');
const smokeDirectory = app.isPackaged
  ? path.join(path.dirname(process.execPath), '.smoke-data')
  : path.resolve(directory, '../../.smoke-data');
if (smoke) app.setPath('userData', smokeDirectory);
let pet: PetState;
let settings: Settings = { ...DEFAULT_SETTINGS, allowedApps: [] };
let overlay: BrowserWindow | null = null;
let preferences: BrowserWindow | null = null;
let careWindow: BrowserWindow | null = null;
let speechWindow: BrowserWindow | null = null;
let petUiReady: Promise<void> | null = null;
let speechBelow = false;
let speechAnchor = 140;
let tray: Tray | null = null;
let ai: LocalAiService;
let store: StateStore;
let lastError: string | null = null;
let comment: string | null = null;
let commentUntil = 0;
let dialogueVersion = 0;
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
let nextIdleAt = Date.now() + 25_000;
let overlayMoving = false;
let dragging = false;
let careMenuOpen = false;
let careMenuOpenedAt = 0;
let dragStress = createDragStress(0);
let dragOrigin = { x: 0, y: 0 };
let windowOrigin = { x: 0, y: 0 };
let previousDragPoint = { x: 0, y: 0 };
let lastDragUpdate = 0;
let attention: Attention = { ...NEUTRAL_ATTENTION };
let motion: PetMotion = { ...IDLE_MOTION };
let position: Travel = { x: 0, y: 0, vx: 0 };
let lastMovement = 0;
let lastMotionSent = 0;
let lastAttentionSent = 0;
let walkUntil = 0;
let hop: { from: { x: number; y: number }; to: { x: number; y: number }; start: number; fromInset: number; toInset: number } | null = null;
let petTop = 64;
let releaseLanding = false;
let followAfter = 0;
let displayTransfer: { x: number; y: number; min: number; max: number } | null = null;
let homeStarted = 0;
let homeStage = false;
let irritationStarted = 0;
let irritationSoftened = false;
let systemReducedMotion = false;
let windowFollowing = 'Desktop';
let geometry: WindowGeometry | null = null;
let geometryTracker: WindowGeometryTracker | null = null;
let geometryBusy = false;
let geometryFailed = false;
let lastGeometryPoll = 0;

function still(): boolean { return settings.motionLevel === 'still' || systemReducedMotion; }

function report(error: unknown, context: string): void {
  console.error(`Miso ${context}:`, error);
  lastError = `${context}: ${error instanceof Error ? error.message : String(error)}`;
  if (modelStateReady) broadcast();
}

function snapshot(): Snapshot {
  return {
    pet, settings, model: ai.getStatus(), modelInfo: MODEL_INFO, comment, error: lastError,
    platform: process.platform, packaged: app.isPackaged, moving: overlayMoving, attention,
    motion, systemReducedMotion, windowFollowing, careMenuOpen, speechBelow, speechAnchor,
  };
}

function broadcast(): void {
  updatePetUi();
  for (const window of [overlay, preferences, careWindow, speechWindow]) {
    if (window && !window.isDestroyed() && !window.webContents.isLoading()) {
      window.webContents.send('miso:snapshot', snapshot());
    }
  }
}

function updatePetUi(): void {
  if (quitting || !overlay || overlay.isDestroyed()) return;
  const bounds = overlay.getBounds();
  const layout = petUiBounds(bounds, screen.getDisplayMatching(bounds).workArea, settings.petSize, petTop);
  speechBelow = layout.speechBelow;
  speechAnchor = layout.speechAnchor;
  for (const [window, target, visible] of [
    [careWindow, layout.care, careMenuOpen && !pet.atHome && overlay.isVisible()],
    [speechWindow, layout.speech, Boolean(comment) && !pet.atHome && !careMenuOpen && overlay.isVisible()],
  ] as const) {
    if (!window || window.isDestroyed()) continue;
    if (!visible) { if (window.isVisible()) window.hide(); continue; }
    const current = window.getBounds();
    if (current.x !== target.x || current.y !== target.y || current.width !== target.width || current.height !== target.height) {
      window.setBounds(target, false);
    }
    if (window === speechWindow && !window.isVisible() && !window.webContents.isLoading()) window.showInactive();
  }
}

async function createPetUi(): Promise<void> {
  const create = (view: 'care' | 'speech'): BrowserWindow => {
    const window = new BrowserWindow({
      width: view === 'care' ? CARE_WIDTH : SPEECH_WIDTH, height: view === 'care' ? CARE_HEIGHT : SPEECH_HEIGHT,
      useContentSize: true, parent: overlay ?? undefined,
      transparent: true, backgroundColor: '#00000000', frame: false, hasShadow: false,
      resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
      alwaysOnTop: true, skipTaskbar: true, show: false, focusable: view === 'care',
      webPreferences: {
        preload: path.join(directory, 'preload.cjs'), zoomFactor: 1,
        contextIsolation: true, sandbox: true, nodeIntegration: false,
        backgroundThrottling: true, partition: `miso-${view}`,
      },
    });
    secureWindow(window);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    if (view === 'speech') window.setIgnoreMouseEvents(true);
    window.on('close', event => {
      if (!quitting) {
        event.preventDefault();
        if (view === 'care') setCareMenuState(false);
        else { clearDialogue(); broadcast(); }
      }
    });
    return window;
  };
  careWindow = create('care');
  speechWindow = create('speech');
  careWindow.on('blur', () => { if (!quitting) setCareMenuState(false); });
  await Promise.all([
    careWindow.loadFile(rendererFile, { query: { view: 'care' } }),
    speechWindow.loadFile(rendererFile, { query: { view: 'speech' } }),
  ]);
}

function setCareMenuState(open: boolean, restoreFocus = false): void {
  if (careMenuOpen === open) return;
  const now = Date.now();
  if (open) {
    careMenuOpenedAt = now;
    position.vx = 0;
    overlayMoving = false;
    clearDialogue();
  } else {
    if (hop) hop.start += now - careMenuOpenedAt;
    walkUntil = 0;
    moveAt = now + 1500;
  }
  careMenuOpen = open;
  broadcast();
  if (open) careWindow?.show();
  else if (restoreFocus && overlay && !overlay.isDestroyed() && overlay.isVisible()) overlay.focus();
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
      partition: 'miso-pet',
    },
  });
  secureWindow(overlay);
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  overlay.webContents.on('did-finish-load', () => {
    if (careMenuOpen && hop) hop.start += Date.now() - careMenuOpenedAt;
    careMenuOpen = false;
    overlay?.webContents.setZoomFactor(settings.petSize);
  });
  overlay.on('blur', finishDrag);
  overlay.on('hide', updatePetUi);
  overlay.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      void goHome().catch((error: unknown) => report(error, 'Could not send Miso home'));
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
  homeStage = false;
  petTop = 64;
  const area = screen.getPrimaryDisplay().workArea;
  const size = Math.round(WINDOW_SIZE * settings.petSize);
  setPetBounds(Math.max(area.x, Math.min(area.x + Math.max(0, area.width - size), area.x + area.width * 0.65 - size / 2)),
    Math.max(area.y, area.y + area.height - size));
  destinationX = overlay.getBounds().x;
  const bounds = overlay.getBounds();
  position = { x: bounds.x, y: bounds.y, vx: 0 };
  hop = null;
  motion = { ...IDLE_MOTION };
}

function setPetBounds(x: number, y: number): void {
  // Carry explicit dimensions: setPosition can grow frameless windows at fractional Windows DPI.
  overlay?.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round((homeStage ? 500 : WINDOW_SIZE) * settings.petSize),
    height: Math.round((!homeStage && petTop < 63.99 ? 328 : WINDOW_SIZE) * settings.petSize) }, false);
  updatePetUi();
}

function openSettings(): void {
  clearDialogue();
  if (modelStateReady) broadcast();
  if (preferences && !preferences.isDestroyed()) { preferences.show(); preferences.focus(); return; }
  preferences = new BrowserWindow({
    width: 660, height: 800, minWidth: 480, minHeight: 540,
    title: 'Miso settings', backgroundColor: '#f5f6f3', autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(directory, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      partition: 'miso-settings',
    },
  });
  secureWindow(preferences);
  preferences.once('ready-to-show', () => preferences?.show());
  preferences.on('closed', () => { preferences = null; });
  void preferences.loadFile(rendererFile, { query: { view: 'settings' } })
    .catch((error: unknown) => report(error, 'Could not load settings'));
}

function restore(): void {
  releaseLanding = false;
  displayTransfer = null;
  careMenuOpen = false;
  dragging = false;
  homeTravel = false;
  homeStarted = 0;
  irritationStarted = 0;
  motion = { ...IDLE_MOTION };
  geometryFailed = false;
  pet = setHome(pet, false, Date.now());
  positionAtBottom();
  overlay?.showInactive();
  clearDialogue();
  lastError = null;
  broadcast();
  void save().catch((error: unknown) => report(error, 'Could not save restored state'));
}

async function goHome(): Promise<void> {
  if (pet.atHome) return;
  careMenuOpen = false;
  releaseLanding = false;
  displayTransfer = null;
  finishDrag();
  pet = setHome(pet, true, Date.now());
  updateAttention();
  clearDialogue();
  homeTravel = true;
  homeStarted = 0;
  irritationStarted = 0;
  hop = null;
  const tracker = geometryTracker;
  geometryTracker = null;
  tracker?.dispose();
  geometry = null;
  if (still()) { homeTravel = false; overlay?.hide(); }
  broadcast();
  await save();
  stopForegroundLookup();
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
  tray.setToolTip('Miso - your desktop companion');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Bring Miso back', click: restore },
    { label: 'Send Miso home', click: () => { void goHome().catch((error: unknown) => report(error, 'Home failed')); } },
    { type: 'separator' },
    { label: 'Settings', click: openSettings },
    { label: 'Quit Miso', click: () => app.quit() },
  ]));
  tray.on('click', restore);
}

type SenderScope = 'any' | 'settings' | 'pet' | 'overlay' | 'read';
function checkSender(event: IpcMainInvokeEvent, scope: SenderScope = 'any'): void {
  const windows = scope === 'settings' ? [preferences] : scope === 'overlay' ? [overlay]
    : scope === 'pet' ? [overlay, careWindow] : scope === 'read' ? [overlay, preferences, careWindow, speechWindow]
      : [overlay, preferences, careWindow];
  validateIpcSender(event, windows, quitting);
}

function registerIpc(): void {
  const handle = (channel: string, handler: (value: unknown, extra: unknown) => unknown | Promise<unknown>, scope: SenderScope = 'any'): void => {
    ipcMain.handle(channel, async (event, value: unknown, extra: unknown) => {
      checkSender(event, scope);
      try { return await handler(value, extra); }
      catch (error) { report(error, 'Action failed'); throw error; }
    });
  };
  handle('miso:snapshot', () => snapshot(), 'read');
  handle('miso:care', (value) => giveCare(validateCare(value)));
  handle('miso:care-menu', async (value, focus) => {
    if (typeof value !== 'boolean') throw new Error('Care-menu visibility must be on or off.');
    if (focus !== undefined && typeof focus !== 'boolean') throw new Error('Care-menu focus must be on or off.');
    if (value && pet.atHome) throw new Error('Bring Miso back before opening care.');
    await petUiReady;
    if (!careWindow || careWindow.isDestroyed()) throw new Error('The care window is unavailable.');
    setCareMenuState(value, focus === true);
  }, 'pet');
  for (const [channel, key] of [['miso:stay', 'stayPut'], ['miso:follow', 'followWindow']] as const) {
    handle(channel, async value => {
      if (typeof value !== 'boolean') throw new Error('The quick setting must be on or off.');
      settings = { ...settings, [key]: value,
        motionLevel: key === 'stayPut' && !value && settings.motionLevel === 'still' ? 'gentle' : settings.motionLevel };
      position.vx = 0;
      walkUntil = 0;
      destinationX = position.x;
      moveAt = Date.now() + 1500;
      geometryFailed = false;
      if (!settings.followWindow || still()) {
        geometryTracker?.dispose();
        geometryTracker = null;
        geometry = null;
        displayTransfer = null;
      }
      clearDialogue();
      lastError = null;
      broadcast();
      await save();
      return snapshot();
    }, 'pet');
  }
  handle('miso:sleep', async value => {
    if (typeof value !== 'boolean') throw new Error('Sleep must be on or off.');
    if (pet.atHome) throw new Error('Bring Miso back before changing sleep.');
    pet = setSleeping(pet, value, Date.now());
    if (value) {
      hop = null;
      displayTransfer = null;
      releaseLanding = false;
      stopForegroundLookup();
    }
    nextIdleAt = Date.now() + 25_000;
    moveAt = Date.now() + 1500;
    irritationStarted = 0;
    walkUntil = 0;
    position.vx = 0;
    clearDialogue();
    broadcast();
    await save();
    return snapshot();
  }, 'pet');
  handle('miso:home', goHome);
  handle('miso:restore', restore);
  handle('miso:settings', openSettings);
  handle('miso:update-settings', async (value) => {
    const next = validateSettings(value);
    if (app.isPackaged && !smoke) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
      if (app.getLoginItemSettings().openAtLogin !== next.launchAtLogin) {
        throw new Error('The operating system did not accept the sign-in setting. Check your startup applications.');
      }
    }
    const oldSize = settings.petSize;
    if (settings.petSpecies !== next.petSpecies) {
      pet = setHome(createPet(Date.now(), next.petSpecies), pet.atHome, Date.now());
      irritationStarted = 0;
      comment = null;
    }
    if (homeTravel && oldSize !== next.petSize) {
      homeTravel = false;
      homeStarted = 0;
      homeStage = false;
      overlay?.hide();
    }
    if (settings.motionLevel !== next.motionLevel || settings.followWindow !== next.followWindow) {
      moveAt = Date.now() + 1500;
      walkUntil = 0;
      geometryFailed = false;
    }
    settings = next;
    clearDialogue();
    if (!settings.aiEnabled || settings.allowedApps.length === 0) stopForegroundLookup();
    if (!settings.followWindow || still()) {
      const tracker = geometryTracker;
      geometryTracker = null;
      tracker?.dispose();
      geometry = null;
    }
    updateAttention();
    if (overlay) {
      overlay.webContents.setZoomFactor(settings.petSize);
      if (oldSize !== settings.petSize) {
        const bounds = overlay.getBounds();
        const area = screen.getDisplayMatching(bounds).workArea;
        const size = WINDOW_SIZE * settings.petSize;
        position = { x: Math.max(area.x, Math.min(area.x + Math.max(0, area.width - size), bounds.x)),
          y: Math.max(area.y, Math.min(area.y + Math.max(0, area.height - size), bounds.y)), vx: 0 };
        hop = null;
        setPetBounds(position.x, position.y);
      }
    }
    lastError = null;
    if (settings.commentFrequency === 'off') comment = null;
    await save();
    if (!settings.aiEnabled) await ai.dispose();
    broadcast();
    return snapshot();
  }, 'settings');
  handle('miso:download-model', async (value) => {
    if (value !== true) throw new Error('Explicit download consent is required.');
    await ai.download(true);
  }, 'settings');
  handle('miso:cancel-model', () => ai.cancelDownload(), 'settings');
  handle('miso:remove-model', async () => {
    stopForegroundLookup();
    settings = { ...settings, aiEnabled: false };
    await save();
    await ai.remove();
    broadcast();
  }, 'settings');
  handle('miso:drag-start', startDrag, 'overlay');
  handle('miso:drag', dragPet, 'overlay');
  handle('miso:drag-end', finishDrag, 'overlay');
}

function clearDialogue(): void {
  dialogueVersion++;
  irritationStarted = 0;
  irritationSoftened = false;
  comment = null;
  commentUntil = 0;
}

function say(line: string, duration = SPEECH_LIFETIME_MS): void {
  if (settings.commentFrequency === 'off' || pet.atHome || pet.mood === 'sleeping') return;
  if (line.length > MAX_SPEECH_LENGTH) { report(new Error('Pet dialogue exceeded its length limit.'), 'Could not show message'); return; }
  comment = line;
  commentUntil = Date.now() + Math.min(SPEECH_LIFETIME_MS, duration);
  pet.lastCommentAt = Date.now();
}

async function giveCare(action: CareAction): Promise<Snapshot> {
  if (pet.atHome) throw new Error('Restore Miso before giving care.');
  clearDialogue();
  pet = care(pet, action, Date.now());
  irritationStarted = 0;
  position.vx = 0;
  destinationX = position.x;
  walkUntil = 0;
  say(getSpecies(pet.species).care[action].message);
  lastError = null;
  broadcast();
  await save();
  return snapshot();
}

function startDrag(): void {
  if (!overlay || pet.atHome || dragging) return;
  clearDialogue();
  dragging = true;
  dragStress = createDragStress(Date.now());
  hop = null;
  displayTransfer = null;
  position.vx = 0;
  dragOrigin = screen.getCursorScreenPoint();
  previousDragPoint = dragOrigin;
  const bounds = overlay.getBounds();
  windowOrigin = { x: bounds.x, y: bounds.y };
  motion = { ...motion, state: 'dragging', speed: 0 };
  broadcast();
}

function dragPet(): void {
  if (!dragging || !overlay || Date.now() - lastDragUpdate < 25) return;
  lastDragUpdate = Date.now();
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const size = Math.round(WINDOW_SIZE * settings.petSize);
  const x = Math.max(area.x, Math.min(area.x + Math.max(0, area.width - size), windowOrigin.x + cursor.x - dragOrigin.x));
  const y = Math.max(area.y, Math.min(area.y + Math.max(0, area.height - size), windowOrigin.y + cursor.y - dragOrigin.y));
  recordDrag(cursor.x - previousDragPoint.x, cursor.y - previousDragPoint.y, Date.now());
  previousDragPoint = cursor;
  setPetBounds(x, y);
  position = { x, y, vx: 0 };
}

function recordDrag(dx: number, dy: number, now: number): void {
  const sample = sampleDrag(dragStress, dx, dy, now);
  dragStress = sample.stress;
  const before = pet.mood;
  pet = addDisturbance(pet, sample.score, now);
  if (irritationStarted && irritationSoftened) pet = { ...pet, mood: 'purring' };
  else if (pet.mood === 'irritated' && before !== 'irritated' && !irritationStarted) {
    irritationStarted = now;
    irritationSoftened = false;
    say(irritationBeat(0).text);
    broadcast();
  }
}

function finishDrag(): void {
  if (!dragging) return;
  dragPet();
  dragging = false;
  releaseLanding = Math.hypot(position.x - windowOrigin.x, position.y - windowOrigin.y) > 1;
  if (releaseLanding) followAfter = Date.now() + 800;
  destinationX = position.x;
  moveAt = Date.now() + MOTION_PROFILES[settings.motionLevel].interval;
  walkUntil = 0;
  motion = { ...motion, state: 'idle', speed: 0 };
  broadcast();
  void save().catch((error: unknown) => report(error, 'Could not save reaction'));
}

async function maybeAiComment(now: number): Promise<void> {
  if (aiBusy || pet.atHome || pet.mood === 'sleeping' || !settings.aiEnabled || settings.allowedApps.length === 0
    || settings.commentFrequency === 'off' || ai.getStatus().phase !== 'ready'
    || now - pet.lastCommentAt < commentCooldown(settings.commentFrequency)
    || now - lastAiPoll < 30_000) return;
  lastAiPoll = now;
  aiBusy = true;
  const version = dialogueVersion;
  try {
    const name = await foregroundAppName();
    if (!name || !dynamicCommentStillAllowed(name)) return;
    const text = await ai.generate(name, pet);
    if (text && version === dialogueVersion && dynamicCommentStillAllowed(name)
      && Date.now() - pet.lastCommentAt >= commentCooldown(settings.commentFrequency)) {
      say(text);
      broadcast();
    }
    foregroundFailureReported = false;
  } catch (error) {
    if (quitting || pet.atHome || !settings.aiEnabled || version !== dialogueVersion) return;
    if (!foregroundFailureReported) report(error, 'Local application comments unavailable');
    foregroundFailureReported = true;
  } finally { aiBusy = false; }
}

function dynamicCommentStillAllowed(name: string): boolean {
  return !pet.atHome && pet.mood !== 'sleeping' && settings.aiEnabled && settings.commentFrequency !== 'off'
    && settings.allowedApps.includes(normalizeAppName(name));
}

async function pollGeometry(now: number): Promise<void> {
  if (now - lastGeometryPoll < 750 || geometryBusy || smoke) return;
  lastGeometryPoll = now;
  if (pet.mood === 'sleeping' || settings.stayPut) {
    geometryTracker?.dispose();
    geometryTracker = null;
    return;
  }
  if (!settings.followWindow || pet.atHome || still()) {
    geometryTracker?.dispose();
    geometryTracker = null;
    geometry = null;
    geometryFailed = false;
    return;
  }
  if (geometryFailed) return;
  geometryTracker ??= new WindowGeometryTracker();
  const tracker = geometryTracker;
  geometryBusy = true;
  try {
    const next = await tracker.read();
    if (geometryTracker !== tracker) return;
    geometry = next && process.platform === 'win32' ? { ...next, bounds: screen.screenToDipRect(null, next.bounds) } : next;
  } catch (error) {
    if (geometryTracker === tracker) {
      geometry = null;
      geometryFailed = true;
      report(error, 'Window following unavailable; using the desktop');
    }
  } finally { geometryBusy = false; }
}

function moveOverlay(now: number): void {
  const dt = lastMovement ? Math.min(0.1, (now - lastMovement) / 1000) : 1 / 30;
  lastMovement = now;
  overlayMoving = false;
  if (!overlay || overlay.isDestroyed() || (!overlay.isVisible() && !homeTravel)) return;
  if (dragging) { motion = { ...motion, state: 'dragging', speed: 0 }; return; }
  if (pet.mood === 'sleeping' && !releaseLanding && !homeTravel) {
    position.vx = 0;
    hop = null;
    displayTransfer = null;
    motion = { ...IDLE_MOTION, direction: motion.direction, topInset: petTop };
    windowFollowing = 'Sleeping here';
    return;
  }
  const bounds = overlay.getBounds();
  const size = Math.round(WINDOW_SIZE * settings.petSize);
  const currentDisplay = screen.getDisplayMatching(bounds);
  const area = currentDisplay.workArea;
  const targetDisplay = geometry && settings.followWindow && !homeTravel ? screen.getDisplayMatching(geometry.bounds) : currentDisplay;
  const crossing = targetDisplay.id !== currentDisplay.id && !homeTravel;
  if (!settings.followWindow || !geometry || settings.stayPut) displayTransfer = null;
  const floor = walkingSurface(area, size, null, false);
  if (releaseLanding && !hop && Math.abs(position.y - floor.y) < 4) {
    releaseLanding = false;
    followAfter = now + 800;
  }
  let blockedTransfer = false;
  if (crossing && !releaseLanding && !displayTransfer && !hop && now >= followAfter && Math.abs(position.y - floor.y) < 4) {
    const next = nextWalkingDisplay(currentDisplay, targetDisplay, screen.getAllDisplays());
    if (next) displayTransfer = { x: next.workArea.x + (next.workArea.width - size) / 2, y: floor.y,
      min: Math.min(area.x, next.workArea.x), max: Math.max(area.x + area.width, next.workArea.x + next.workArea.width) - size };
    else blockedTransfer = true;
  }
  const surface = displayTransfer ? { ...floor, ...displayTransfer }
    : crossing || releaseLanding || now < followAfter ? floor
      : walkingSurface(area, size, homeTravel ? null : geometry, settings.followWindow && !homeTravel);
  windowFollowing = settings.stayPut ? 'Staying in this position' : !settings.followWindow ? 'Window following off' : still() ? 'Wandering paused'
    : geometryFailed ? 'Window following unavailable; using desktop' : surface.perched ? 'Following the active window'
      : !geometry ? 'Desktop: waiting for active-window geometry'
        : geometry.maximized ? 'Desktop: the active window is maximized'
          : geometry.bounds.y - size * 236 / 300 < area.y ? 'No room above this window. Move it lower or choose a smaller pet.'
            : 'Desktop: this window is too narrow or outside the work area';
  if (displayTransfer) windowFollowing = 'Walking across to your other display';
  else if (crossing) windowFollowing = blockedTransfer ? 'No connected floor to the other display. Carry Miso there.' : 'Landing here before following your other display';
  if (still() || !homeTravel && (careMenuOpen || settings.stayPut)) {
    if (!careMenuOpen) hop = null;
    position.vx = 0;
    motion = { ...IDLE_MOTION, direction: motion.direction, topInset: petTop };
    if (homeTravel && still()) { homeTravel = false; overlay.hide(); }
    return;
  }
  if (homeStarted) {
    const beat = homeBeat(now - homeStarted);
    motion = { state: beat.state, direction: 1, speed: 0, progress: beat.progress };
    if (beat.done) { homeTravel = false; homeStarted = 0; overlay.hide(); }
    return;
  }
  if (!hop && (Math.abs(position.y - surface.y) > 4 || position.x < surface.min - 4 || position.x > surface.max + 4)) {
    hop = { from: { ...position }, to: { x: Math.max(surface.min, Math.min(surface.max, position.x)), y: surface.y },
      start: now, fromInset: petTop, toInset: surface.compact ? 0 : 64 };
  }
  if (hop) {
    const falling = hop.to.y - hop.from.y > 80 * settings.petSize;
    const duration = falling ? Math.min(1100, Math.max(350, Math.sqrt((hop.to.y - hop.from.y) / 900) * 1000)) : 1000;
    const progress = Math.min(1, (now - hop.start) / duration);
    const next = falling ? fallPosition(hop.from, hop.to, progress) : hopPosition(hop.from, hop.to, progress);
    petTop = hop.fromInset + (hop.toInset - hop.fromInset) * progress * progress * (3 - 2 * progress);
    position = { x: next.x, y: Math.max(Math.min(area.y, hop.from.y), next.y), vx: 0 };
    motion = { state: falling ? 'falling' : 'hopping', direction: hop.to.x >= hop.from.x ? 1 : -1, speed: 0, progress };
    if (progress === 1) hop = null;
  } else {
    petTop = surface.compact ? 0 : 64;
    const profile = MOTION_PROFILES[settings.motionLevel];
    let target = position.x;
    const homeTarget = Math.max(surface.min, surface.max - 200 * settings.petSize);
    if (homeTravel) target = homeTarget;
    else if (!pet.atHome && !['sleeping', 'irritated', 'mimicking', 'playing', 'purring', 'eating', 'relaxing', 'yawning'].includes(pet.mood)) {
      if (displayTransfer) target = displayTransfer.x;
      else if (shouldFollowCursor(pet)) {
        const cursor = screen.getCursorScreenPoint();
        if (screen.getDisplayNearestPoint(cursor).id === screen.getDisplayMatching(bounds).id) target = cursor.x - size / 2;
      } else {
        if (now >= moveAt) {
          destinationX = surface.min + Math.random() * (surface.max - surface.min);
          moveAt = now + profile.interval + Math.random() * profile.interval * 0.5;
          walkUntil = now + profile.duration;
        }
        if (now < walkUntil) target = destinationX;
      }
    }
    target = Math.max(surface.min, Math.min(surface.max, target));
    position = walkToward(position, target, dt, (homeTravel ? 260 : profile.speed) * settings.petSize,
      (homeTravel ? 800 : profile.acceleration) * settings.petSize);
    motion = { state: Math.abs(position.vx) > 0.5 ? 'walking' : 'idle', direction: position.vx > 0 ? 1 : position.vx < 0 ? -1 : motion.direction,
      speed: Math.abs(position.vx) / settings.petSize, progress: 0 };
    if (displayTransfer && Math.abs(position.x - displayTransfer.x) < 0.5) displayTransfer = null;
    if (homeTravel && Math.abs(position.x - homeTarget) < 0.5) {
      homeStarted = now;
      homeStage = true;
      setPetBounds(position.x, position.y);
      motion = { state: 'home-arriving', direction: 1, speed: 0, progress: 0 };
      broadcast();
    }
  }
  motion.topInset = petTop;
  overlayMoving = motion.state === 'walking' || motion.state === 'hopping' || motion.state === 'falling';
  if (Math.round(position.x) !== bounds.x || Math.round(position.y) !== bounds.y
    || bounds.height !== Math.round((petTop < 63.99 && !homeStage ? 328 : WINDOW_SIZE) * settings.petSize)) setPetBounds(position.x, position.y);
}

function step(): void {
  const now = Date.now();
  moveOverlay(now);
  updateAttention();
  if (now - lastMotionSent >= 66 && overlay?.isVisible() && !overlay.webContents.isLoading()) {
    lastMotionSent = now;
    overlay.webContents.send('miso:motion', motion);
  }
  if (irritationStarted) {
    const beat = irritationBeat(now - irritationStarted);
    if (beat.mood === 'purring' && !irritationSoftened) {
      irritationSoftened = true;
      pet = { ...pet, mood: 'purring', disturbance: pet.disturbance * 0.4, reactionUntil: irritationStarted + IRRITATION_DURATION_MS };
      say(beat.text, REASSURANCE_DURATION_MS);
      broadcast();
    }
    if (beat.done) irritationStarted = 0;
  }
  if (comment && now >= commentUntil) { comment = null; broadcast(); }
  if (now - lastSimulation < 1000) return;
  lastSimulation = now;
  systemReducedMotion = systemPreferences.getAnimationSettings().prefersReducedMotion;
  void pollGeometry(now);
  pet = tick(pet, now);
  if (overlayMoving && pet.mood === 'idle') pet.mood = 'walking';
  if (now > commentUntil) comment = null;
  if (!pet.atHome && pet.mood !== 'sleeping') {
    if (now >= nextIdleAt && !still() && !dragging && !careMenuOpen) {
      const activity = idleActivity(pet, now, overlayMoving || Boolean(hop), Math.random());
      if (activity) { pet = activity; nextIdleAt = now + 35_000 + Math.random() * 40_000; }
    }
    const reminder = breakReminder(pet, settings.breakReminders, settings.commentFrequency, now);
    if (reminder) {
      say(reminder);
      pet.lastBreakReminderAt = pet.activeTimeMs;
    }
    if (now >= nextMimicAt && !dragging && !careMenuOpen && !overlayMoving && !hop && pet.reactionUntil <= now && pet.energy > 30 && pet.hunger < 70) {
      nextMimicAt = now + 120_000 + Math.random() * 120_000;
      pet = { ...pet, mood: 'mimicking', reactionUntil: now + 14_000 };
      if (now - pet.lastCommentAt >= commentCooldown(settings.commentFrequency)) {
        say('Working hard. Hardly working. Same thing, right?');
      }
    }
    if (!reminder) void maybeAiComment(now);
    if (!aiBusy && !reminder) {
      const line = scriptedComment(pet, settings.commentFrequency, now);
      if (line) say(line);
    }
  }
  broadcast();
  if (now - lastSaved > 30_000) {
    lastSaved = now;
    void save().catch((error: unknown) => report(error, 'Could not save Miso'));
  }
}

function updateAttention(): void {
  const next = overlay && overlay.isVisible() && !pet.atHome && pet.mood !== 'sleeping'
    && !still() && !dragging
    ? cursorAttention(screen.getCursorScreenPoint(), overlay.getBounds())
    : { ...NEUTRAL_ATTENTION };
  if (next.nearby && Date.now() - lastAttentionSent < 100) return;
  if (next.nearby === attention.nearby && Math.abs(next.x - attention.x) < 0.005
    && Math.abs(next.y - attention.y) < 0.005) return;
  attention = next;
  lastAttentionSent = Date.now();
  if (overlay && !overlay.webContents.isLoading()) overlay.webContents.send('miso:attention', attention);
}
async function start(): Promise<void> {
  store = new StateStore(app.getPath('userData'));
  const loaded = await store.load();
  settings = loaded.state?.settings ?? { ...DEFAULT_SETTINGS, allowedApps: [] };
  pet = loaded.state?.pet ?? createPet(Date.now(), settings.petSpecies);
  if (smoke) {
    settings = { ...DEFAULT_SETTINGS, allowedApps: [] };
    pet = createPet(Date.now());
  }
  pet.lastTickAt = Date.now();
  systemReducedMotion = systemPreferences.getAnimationSettings().prefersReducedMotion;
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
  petUiReady = createPetUi();
  await petUiReady;
  if (!loaded.state && !smoke) openSettings();
  timer = setInterval(step, 1000 / 30);
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
      bridge: typeof window.miso?.getSnapshot === 'function',
      nodeBlocked: typeof window.require === 'undefined',
      title: document.title,
      hasToolbar: Boolean(document.querySelector('#pet-view .pet-controls'))
    })`);
    console.log('MISO_SMOKE', JSON.stringify(result));
    if (typeof result !== 'object' || result === null
      || !(result as Record<string, unknown>).bridge || !(result as Record<string, unknown>).nodeBlocked) {
      throw new Error('Desktop isolation smoke failed.');
    }
    if (app.getName() !== 'Miso' || (result as Record<string, unknown>).title !== 'Miso') {
      throw new Error('The native application and renderer must both identify as Miso.');
    }
    if ((result as Record<string, unknown>).hasToolbar) throw new Error('Desktop still contains a persistent care toolbar.');
    const imageDirectory = smokeDirectory;
    await mkdir(imageDirectory, { recursive: true });
    const carePopup = careWindow;
    const speechPopup = speechWindow;
    if (!carePopup || !speechPopup) throw new Error('Unscaled pet UI was not created.');
    const checkCarePopup = async (name: string): Promise<void> => {
      const before = window.getBounds();
      await window.webContents.executeJavaScript(`document.getElementById('cat').dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,cancelable:true}))`);
      await new Promise(resolve => setTimeout(resolve, 250));
      const expected = Array.from({ length: 8 }, (_, index) => careOrbit(index, 8, carePopup.getContentBounds().width));
      const error: string | null = await carePopup.webContents.executeJavaScript(`(() => {
        const nav = document.getElementById('pet-menu');
        const buttons = [...nav.querySelectorAll('button')];
        if (nav.hidden || buttons.length !== 8) return 'Missing care actions';
        const expected = ${JSON.stringify(expected)};
        const labels = [];
        for (const [index, button] of buttons.entries()) {
          const box = button.getBoundingClientRect();
          const label = button.querySelector('span:last-child') || button;
          const text = label.getBoundingClientRect();
          if (!button.checkVisibility() || box.width < 44 || box.height < 44
            || Math.abs(box.x + box.width/2 - expected[index].x) > 1
            || Math.abs(box.y + box.height/2 - expected[index].y) > 1) return 'Invalid care target: ' + button.id;
          if (parseFloat(getComputedStyle(label).fontSize) < 12 || !text.width || !text.height
            || text.left < 0 || text.right > innerWidth || text.top < 0 || text.bottom > innerHeight) return 'Unreadable care label: ' + button.id;
          labels.push(text);
        }
        for (let i=0; i<labels.length; i++) for (let j=i+1; j<labels.length; j++) {
          const a=labels[i], b=labels[j];
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) return 'Overlapping care labels';
        }
        if (document.getElementById('pet-canvas').dataset.ready === 'true') return 'Care created a second 3D scene';
        return null;
      })()`);
      if (error || !carePopup.isVisible() || carePopup.webContents.getZoomFactor() !== 1) {
        throw new Error(`Unscaled ${name} care failed: ${error ?? 'native visibility or zoom'}`);
      }
      if (JSON.stringify(window.getBounds()) !== JSON.stringify(before)) throw new Error('Opening care moved or resized the pet.');
      const pixels = (await window.capturePage()).toBitmap();
      await new Promise(resolve => setTimeout(resolve, 350));
      if (JSON.stringify(window.getBounds()) !== JSON.stringify(before)
        || !pixels.equals((await window.capturePage()).toBitmap())) throw new Error('Miso moved or animated with care open.');
      await writeFile(path.join(imageDirectory, name), (await carePopup.capturePage()).toPNG());
      await carePopup.webContents.executeJavaScript(`document.getElementById('pet-menu').dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}))`);
      await new Promise(resolve => setTimeout(resolve, 100));
      if (careMenuOpen || carePopup.isVisible()) throw new Error('Escape did not dismiss native care.');
    };
    async function waitForSavedToggle(key: 'stayPut' | 'followWindow', expected: boolean): Promise<void> {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (settings[key] === expected && (await store.load()).state?.settings[key] === expected) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Quick ${key} did not persist ${expected}.`);
    }
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
        window.webContents.send('miso:attention', { x, y: 0, nearby: x !== 0 });
        await new Promise(resolve => setTimeout(resolve, 650));
        const yaw: number = await window.webContents.executeJavaScript(`Number(document.getElementById('pet-canvas').dataset.lookX)`);
        if (x === 0 ? Math.abs(yaw) > 0.02 : yaw * x < 0.45) throw new Error(`3D ${name} head tracking failed: ${yaw}`);
        await writeFile(path.join(imageDirectory, `${name}.png`), (await window.capturePage()).toPNG());
      }
    } finally { timer = setInterval(step, 1000 / 30); }
    const originalBounds = window.getBounds();
    for (let index = 0; index < 30; index++) setPetBounds(originalBounds.x + index % 2, originalBounds.y);
    if (Math.abs(window.getContentBounds().width - WINDOW_SIZE) > 1) {
      throw new Error('Repeated high-DPI movement changed the pet size.');
    }
    const smokeArea = screen.getDisplayMatching(window.getBounds()).workArea;
    moveAt = Date.now() + 60_000;
    geometry = { bounds: { x: smokeArea.x + 120, y: smokeArea.y + WINDOW_SIZE + 60, width: 650, height: 200 }, maximized: false };
    pet = { ...pet, mood: 'idle', reactionUntil: 0 };
    const jumpStart = Date.now();
    for (const [phase, at] of [['crouch', 120], ['flight', 500], ['landing', 920]] as const) {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, at - (Date.now() - jumpStart))));
      await writeFile(path.join(imageDirectory, `jump-${phase}.png`), (await window.capturePage()).toPNG());
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    if (Math.abs(window.getBounds().y - (geometry.bounds.y - WINDOW_SIZE)) > 2) throw new Error('Native top-edge hop did not land on the active-window fixture.');
    const ledge = walkingSurface(smokeArea, WINDOW_SIZE, geometry, true);
    destinationX = ledge.min;
    walkUntil = Date.now() + 4000;
    moveAt = Date.now() + 60_000;
    await new Promise(resolve => setTimeout(resolve, 650));
    const facing: number = await window.webContents.executeJavaScript(`Number(document.getElementById('pet-canvas').dataset.facing)`);
    if (facing > -0.8) throw new Error(`Walking did not turn the real character sideways: ${facing}`);
    await writeFile(path.join(imageDirectory, 'walking.png'), (await window.capturePage()).toPNG());
    for (let frame = 0; frame < 10; frame++) {
      await new Promise(resolve => setTimeout(resolve, 90));
      await writeFile(path.join(imageDirectory, `gait-${frame}.png`), (await window.capturePage()).toPNG());
    }
    geometry = { ...geometry, bounds: { ...geometry.bounds, y: smokeArea.y + 250 } };
    await new Promise(resolve => setTimeout(resolve, 1200));
    const compact: boolean = await window.webContents.executeJavaScript(`document.body.dataset.compactPerch === 'true'`);
    if (!compact || Math.abs(window.getBounds().y - (smokeArea.y + 14)) > 2) throw new Error('Compact perching did not reclaim transparent headroom.');
    await writeFile(path.join(imageDirectory, 'compact-perch.png'), (await window.capturePage()).toPNG());
    settings.motionLevel = 'still';
    const stillBounds = window.getBounds();
    await new Promise(resolve => setTimeout(resolve, 250));
    if (window.getBounds().x !== stillBounds.x || window.getBounds().y !== stillBounds.y) throw new Error('Still mode did not stop autonomous native travel.');
    settings.motionLevel = 'gentle';
    geometry = null;
    broadcast();
    const fallDeadline = Date.now() + 1000;
    while (motion.state !== 'falling' && Date.now() < fallDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    if (snapshot().motion.state !== 'falling') throw new Error('Dropping from the window ledge did not trigger a falling pose.');
    await new Promise(resolve => setTimeout(resolve, 120));
    await writeFile(path.join(imageDirectory, 'falling.png'), (await window.capturePage()).toPNG());
    const releaseX = smokeArea.x + 20;
    const localFloor = walkingSurface(smokeArea, WINDOW_SIZE, null, false).y;
    position = { x: releaseX, y: Math.max(smokeArea.y, localFloor - 250), vx: 0 };
    hop = null;
    releaseLanding = true;
    followAfter = Date.now() + 800;
    geometry = { bounds: { x: smokeArea.x + smokeArea.width - 650, y: smokeArea.y + 350, width: 650, height: 200 }, maximized: false };
    setPetBounds(position.x, position.y);
    await new Promise(resolve => setTimeout(resolve, 200));
    if (window.getBounds().x !== releaseX || snapshot().motion.state !== 'falling') throw new Error('A manual drop moved sideways toward the active window before landing.');
    await new Promise(resolve => setTimeout(resolve, 600));
    if (window.getBounds().x !== releaseX || Math.abs(window.getBounds().y - localFloor) > 2) throw new Error('A manual drop did not land on its current display floor.');
    geometry = null;
    releaseLanding = false;
    followAfter = 0;
    positionAtBottom();
    walkUntil = 0;
    destinationX = position.x;
    const before = pet.hunger;
    await window.webContents.executeJavaScript(`window.miso.care('feed')`);
    if (pet.hunger > before) throw new Error('Feed smoke failed.');
    await new Promise(resolve => setTimeout(resolve, 250));
    const eating: boolean = await window.webContents.executeJavaScript(`document.getElementById('pet-canvas').dataset.eating === 'true'`);
    if (!eating) throw new Error('Feeding did not render the real bowl and eating pose.');
    await writeFile(path.join(imageDirectory, 'eating.png'), (await window.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`window.miso.care('play')`);
    await new Promise(resolve => setTimeout(resolve, 250));
    await writeFile(path.join(imageDirectory, 'playing.png'), (await window.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`window.miso.care('pet')`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(path.join(imageDirectory, 'pet.png'), (await window.capturePage()).toPNG());
    pet = { ...pet, mood: 'mimicking', reactionUntil: Date.now() + 14_000 };
    comment = null;
    broadcast();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(path.join(imageDirectory, 'mimicking.png'), (await window.capturePage()).toPNG());
    startDrag();
    pet = { ...pet, disturbance: 0 };
    for (let index = 0; index < 6; index++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      recordDrag(index % 2 ? 80 : -80, 0, Date.now());
    }
    if (!dragging || pet.mood !== 'irritated' || !String(comment).includes('might close')) throw new Error('Shaking did not react immediately during the drag.');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(path.join(imageDirectory, 'irritated.png'), (await window.capturePage()).toPNG());
    finishDrag();
    await new Promise(resolve => setTimeout(resolve, Math.max(0, irritationStarted + ANGER_DURATION_MS - 300 - Date.now())));
    if (snapshot().pet.mood !== 'irritated' || String(comment).includes('windows are safe')) throw new Error('The angry expression ended before its five-second hold.');
    const reassuranceDeadline = irritationStarted + ANGER_DURATION_MS + 1000;
    while (Date.now() < reassuranceDeadline && (snapshot().pet.mood !== 'purring' || !String(comment).includes('windows are safe'))) {
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    if (snapshot().pet.mood !== 'purring' || !String(comment).includes('windows are safe')) {
      throw new Error(`The angry warning did not soften into reassurance (mood=${pet.mood}, softened=${irritationSoftened}, elapsed=${Date.now() - irritationStarted}).`);
    }
    await writeFile(path.join(imageDirectory, 'reassurance.png'), (await window.capturePage()).toPNG());
    await checkCarePopup('radial-care.png');
    await window.webContents.executeJavaScript(`window.miso.setCareMenuOpen(true)`);
    await new Promise(resolve => setTimeout(resolve, 100));
    await carePopup.webContents.executeJavaScript(`document.getElementById('care-stay').click()`);
    await waitForSavedToggle('stayPut', true);
    const pinnedBounds = window.getBounds();
    destinationX = position.x + 150;
    walkUntil = Date.now() + 2000;
    await new Promise(resolve => setTimeout(resolve, 250));
    if (window.getBounds().x !== pinnedBounds.x || window.getBounds().y !== pinnedBounds.y || settings.motionLevel !== 'gentle') throw new Error('Stay put failed to preserve position without disabling animations.');
    await window.webContents.executeJavaScript(`window.miso.setCareMenuOpen(true)`);
    await new Promise(resolve => setTimeout(resolve, 100));
    await carePopup.webContents.executeJavaScript(`document.getElementById('care-stay').click()`);
    await waitForSavedToggle('stayPut', false);
    const previousFollow = settings.followWindow;
    await window.webContents.executeJavaScript(`window.miso.setCareMenuOpen(true)`);
    await new Promise(resolve => setTimeout(resolve, 100));
    await carePopup.webContents.executeJavaScript(`document.getElementById('care-follow').click()`);
    await waitForSavedToggle('followWindow', !previousFollow);
    await carePopup.webContents.executeJavaScript(`window.miso.setFollowing(${previousFollow})`);
    await window.webContents.executeJavaScript(`window.miso.setSleeping(true)`);
    const sleepingBounds = window.getBounds();
    const beforeSleepGeometry = geometry;
    geometry = { bounds: { x: smokeArea.x + 40, y: smokeArea.y + 370, width: 700, height: 200 }, maximized: false };
    await new Promise(resolve => setTimeout(resolve, 500));
    if (window.getBounds().x !== sleepingBounds.x || window.getBounds().y !== sleepingBounds.y) throw new Error('Sleeping Miso followed a newly active window.');
    geometry = beforeSleepGeometry;
    if (snapshot().pet.mood !== 'sleeping' || comment !== null) throw new Error('Explicit sleep did not cancel old dialogue.');
    await writeFile(path.join(imageDirectory, 'sleeping.png'), (await window.capturePage()).toPNG());
    window.focus();
    window.webContents.sendInputEvent({ type: 'mouseDown', x: 150, y: 200, button: 'left', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseUp', x: 150, y: 200, button: 'left', clickCount: 1 });
    await new Promise(resolve => setTimeout(resolve, 100));
    if (snapshot().pet.mood === 'sleeping') throw new Error('Tapping did not wake Miso.');
    if (process.platform === 'win32') {
      if (!await foregroundAppName() || !await foregroundAppName()) throw new Error('Cold or warm foreground lookup returned no app name.');
      stopForegroundLookup();
      console.log('MISO_FOREGROUND cold and warm name-only lookup passed.');
    }
    for (const mood of ['relaxing', 'yawning'] as const) {
      pet = { ...pet, mood, reactionUntil: Date.now() + 5000 };
      broadcast();
      await new Promise(resolve => setTimeout(resolve, mood === 'yawning' ? 1800 : 500));
      await writeFile(path.join(imageDirectory, `${mood}.png`), (await window.capturePage()).toPNG());
    }
    irritationStarted = Date.now() - ANGER_DURATION_MS + 500;
    irritationSoftened = false;
    pet = { ...pet, mood: 'irritated' };
    say(irritationBeat(0).text);
    await giveCare('feed');
    const careMessage = comment;
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (comment !== careMessage || String(comment).includes('teasing') || snapshot().pet.mood !== 'eating') throw new Error('An interrupted threat overwrote the new care reaction.');
    commentUntil = Date.now() - 1;
    step();
    if (comment !== null) throw new Error('Expired speech was not cleared immediately.');
    pet = { ...pet, activeTimeMs: 45 * 60 * 1000, lastBreakReminderAt: 0, lastCommentAt: 0 };
    lastSimulation = 0;
    step();
    if (pet.lastBreakReminderAt < 45 * 60 * 1000 || !comment) throw new Error('Affectionate break reminder did not trigger.');
    const disturbanceBeforeTap = pet.disturbance;
    await window.webContents.executeJavaScript(`window.miso.startDrag().then(() => window.miso.endDrag())`);
    if (pet.disturbance > disturbanceBeforeTap) throw new Error('A stationary tap incorrectly disturbed Miso.');
    attention = { x: 1, y: 0, nearby: true };
    await window.webContents.executeJavaScript(`window.miso.goHome()`);
    if (!pet.atHome) throw new Error('Home smoke failed.');
    if (attention.nearby || attention.x !== 0 || attention.y !== 0) throw new Error('Home did not neutralize cursor attention.');
    const homeTravelStarted = Date.now();
    const homeTravelDeadline = homeTravelStarted + 15_000;
    let houseStarted = 0;
    let houseSeen = false;
    let entrySeen = false;
    let departureSeen = false;
    let homeFrame = 0;
    while (window.isVisible() && Date.now() < (houseStarted ? houseStarted + 6500 : homeTravelDeadline)) {
      if (motion.state.startsWith('home-')) {
        if (!houseStarted) houseStarted = Date.now();
        const image = (await window.capturePage()).toPNG();
        await writeFile(path.join(imageDirectory, `home-frame-${String(homeFrame++).padStart(2, '0')}.png`), image);
        if (motion.state === 'home-arriving' && motion.progress > 0.4 && !houseSeen) {
          await writeFile(path.join(imageDirectory, 'home-arriving.png'), image);
          houseSeen = true;
        }
        if (motion.state === 'home-entering' && motion.progress > 0.82 && !entrySeen) {
          await writeFile(path.join(imageDirectory, 'home-entering.png'), image);
          entrySeen = true;
        }
        if (motion.state === 'home-leaving' && motion.progress > 0.25 && !departureSeen) {
          await writeFile(path.join(imageDirectory, 'home-leaving.png'), image);
          departureSeen = true;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (window.isVisible()) throw new Error('Home edge animation did not hide the overlay.');
    if (!houseSeen || !entrySeen || !departureSeen) throw new Error('Home hid before the visible house, entry and departure sequence.');
    console.log('MISO_HOME', JSON.stringify({ travelMs: houseStarted - homeTravelStarted, sequenceMs: Date.now() - houseStarted }));
    const homeHunger = pet.hunger;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    if (pet.hunger !== homeHunger) throw new Error('Needs did not pause at home.');
    await window.webContents.executeJavaScript(`window.miso.restore()`);
    if (pet.atHome) throw new Error('Restore smoke failed.');
    openSettings();
    const settingsWindow = preferences;
    if (!settingsWindow) throw new Error('Settings creation failed.');
    if (settingsWindow.webContents.isLoadingMainFrame()) {
      await new Promise<void>((resolve) => settingsWindow.webContents.once('did-finish-load', () => resolve()));
    }
    attention = { x: 1, y: 0, nearby: true };
    await settingsWindow.webContents.executeJavaScript(`window.miso.updateSettings({
      launchAtLogin: false, aiEnabled: false, reducedMotion: true,
      commentFrequency: 'balanced', allowedApps: ['Code.exe'], petSize: 1.3, breakReminders: true
    })`);
    if (settings.launchAtLogin || snapshot().settings.motionLevel !== 'still' || settings.allowedApps[0] !== 'code.exe') {
      throw new Error('Settings IPC smoke failed.');
    }
    if (attention.nearby) throw new Error('Reduced motion did not disable native cursor attention.');
    await new Promise(resolve => setTimeout(resolve, 200));
    const reducedYaw: number = await window.webContents.executeJavaScript(`Number(document.getElementById('pet-canvas').dataset.lookX)`);
    if (reducedYaw !== 0) throw new Error('Reduced motion left the 3D head tracking.');
    if (Math.abs(window.getContentBounds().width - 390) > 1 || Math.abs(window.webContents.getZoomFactor() - 1.3) > 0.01) {
      throw new Error(`Configurable native pet size smoke failed: content=${JSON.stringify(window.getContentBounds())}; outer=${JSON.stringify(window.getBounds())}; zoom=${window.webContents.getZoomFactor()}`);
    }
    await settingsWindow.webContents.executeJavaScript(`window.miso.getSnapshot().then(({settings}) => window.miso.updateSettings({...settings, petSize:0.5}))`);
    if (Math.abs(window.getContentBounds().width - 150) > 1 || Math.abs(window.webContents.getZoomFactor() - 0.5) > 0.01) throw new Error('The 50% minimum did not render at the requested native size.');
    await new Promise(resolve => setTimeout(resolve, 150));
    await writeFile(path.join(imageDirectory, 'tiny.png'), (await window.capturePage()).toPNG());
    await checkCarePopup('tiny-care.png');
    const tinyBounds = window.getBounds();
    comment = 'W'.repeat(MAX_SPEECH_LENGTH);
    commentUntil = Date.now() + SPEECH_LIFETIME_MS;
    broadcast();
    await new Promise(resolve => setTimeout(resolve, 150));
    const speechError: string | null = await speechPopup.webContents.executeJavaScript(`(() => {
      const speech = document.getElementById('speech'), box = speech.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(speech);
      if (speech.hidden || speech.textContent.length !== ${MAX_SPEECH_LENGTH} || box.width <= 0 || box.height <= 0) return 'Missing speech';
      if (parseFloat(getComputedStyle(speech).fontSize) < 12) return 'Scaled speech text';
      if ([...range.getClientRects()].some(r => r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight)) return 'Clipped speech text: ' + JSON.stringify({
          viewport:[innerWidth,innerHeight], box:box.toJSON(), rects:[...range.getClientRects()].map(r=>r.toJSON()),
          style:getComputedStyle(speech).font
        });
      if (document.getElementById('pet-canvas').dataset.ready === 'true') return 'Speech created a second 3D scene';
      return null;
    })()`);
    await writeFile(path.join(imageDirectory, 'speech-stress.png'), (await speechPopup.capturePage()).toPNG());
    if (speechError || !speechPopup.isVisible() || speechPopup.webContents.getZoomFactor() !== 1
      || JSON.stringify(window.getBounds()) !== JSON.stringify(tinyBounds)) {
      throw new Error(`Tiny speech failed: ${speechError ?? 'native visibility, zoom or changed pet bounds'}`);
    }
    say('A tiny break? Stretch a little. I will guard the keyboard.');
    broadcast();
    await new Promise(resolve => setTimeout(resolve, 100));
    await writeFile(path.join(imageDirectory, 'tiny-speech.png'), (await speechPopup.capturePage()).toPNG());
    const priorTop = petTop;
    const priorPosition = { ...position };
    petTop = 0;
    setPetBounds(tinyBounds.x, screen.getDisplayMatching(tinyBounds).workArea.y + 120);
    broadcast();
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!speechBelow || speechPopup.getBounds().y <= window.getBounds().y) throw new Error('Compact speech did not appear below the perched pet.');
    await writeFile(path.join(imageDirectory, 'perched-speech.png'), (await speechPopup.capturePage()).toPNG());
    petTop = priorTop;
    position = priorPosition;
    setPetBounds(tinyBounds.x, tinyBounds.y);
    clearDialogue();
    broadcast();
    if (speechPopup.isVisible()) throw new Error('Cancelled speech left an invisible or stale speech window open.');
    await carePopup.webContents.executeJavaScript(`window.miso.setStayPut(false)`);
    if (snapshot().settings.motionLevel !== 'gentle') throw new Error('Roam did not resume Gentle from Still.');
    await settingsWindow.webContents.executeJavaScript(`window.miso.getSnapshot().then(({settings}) => window.miso.updateSettings({...settings,motionLevel:'still'}))`);
    await settingsWindow.webContents.executeJavaScript(`window.miso.getSnapshot().then(({settings}) => window.miso.updateSettings({...settings, petSize:1.3}))`);
    const denied: boolean = await window.webContents.executeJavaScript(`window.miso.updateSettings({
      launchAtLogin: false, aiEnabled: false, reducedMotion: true,
      commentFrequency: 'quiet', allowedApps: []
    }).then(() => false, () => true)`);
    if (!denied) throw new Error('Overlay was allowed to modify privileged settings.');
    const careDenied: boolean = await carePopup.webContents.executeJavaScript(`window.miso.getSnapshot().then(({settings}) =>
      Promise.all([window.miso.updateSettings(settings), window.miso.startDrag(), window.miso.downloadModel(true)]
        .map(p => p.then(() => false, () => true)))).then(results => results.every(Boolean))`);
    const speechDenied: boolean = await speechPopup.webContents.executeJavaScript(`window.miso.care('feed').then(() => false, () => true)`);
    if (!careDenied || !speechDenied) throw new Error('Auxiliary UI obtained settings, model, drag or mutation privileges outside its scope.');
    const consentDenied: boolean = await settingsWindow.webContents.executeJavaScript(
      `window.miso.downloadModel(false).then(() => false, () => true)`);
    if (!consentDenied) throw new Error('Model download did not require explicit consent.');
    lastError = null;
    broadcast();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await writeFile(path.join(imageDirectory, 'settings.png'), (await settingsWindow.capturePage()).toPNG());
    await settingsWindow.webContents.executeJavaScript(`document.getElementById('company-page').click()`);
    const disclosure: boolean = await settingsWindow.webContents.executeJavaScript(`(() => {
      const details = document.getElementById('model-details');
      return !details.open && !document.getElementById('model-source').checkVisibility()
        && document.getElementById('model-size').checkVisibility() && !document.getElementById('consent-label').hidden;
    })()`);
    if (!disclosure) throw new Error('Model details were not progressively disclosed with visible size and consent.');
    await settingsWindow.webContents.executeJavaScript(`document.getElementById('model-section').scrollIntoView({block:'center'})`);
    await writeFile(path.join(imageDirectory, 'general-settings.png'), (await settingsWindow.capturePage()).toPNG());
    for (const [width, height, image] of [[660, 800, 'model-details.png'], [500, 540, 'model-details-compact.png']] as const) {
      settingsWindow.setSize(width, height);
      await new Promise(resolve => setTimeout(resolve, 150));
      await settingsWindow.webContents.executeJavaScript(`document.getElementById('model-section').scrollIntoView({block:'center'}); document.querySelector('#model-details summary').click()`);
      await new Promise(resolve => setTimeout(resolve, 150));
      const disclosureError: string | null = await settingsWindow.webContents.executeJavaScript(`(() => {
        const panel = document.querySelector('.model-details-panel');
        const box = panel.getBoundingClientRect();
        const open = document.getElementById('model-details').open;
        const visible = panel.checkVisibility();
        return open && visible && box.width >= 100 && box.height >= 60
          && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
          ? null : JSON.stringify({open,visible,box:box.toJSON(),viewport:[innerWidth,innerHeight]});
      })()`);
      await writeFile(path.join(imageDirectory, image), (await settingsWindow.capturePage()).toPNG());
      if (disclosureError) throw new Error(`Model details were not visible inside the ${width}x${height} settings viewport: ${disclosureError}`);
      await settingsWindow.webContents.executeJavaScript(`document.querySelector('#model-details summary').click()`);
    }
    settingsWindow.setSize(660, 800);
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
    settingsWindow.setSize(500, 540);
    await new Promise(resolve => setTimeout(resolve, 300));
    const saveVisible: boolean = await settingsWindow.webContents.executeJavaScript(`(() => {
      const bounds = document.getElementById('save-button').getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight;
    })()`);
    if (!saveVisible) throw new Error('Coat customization hid Save below the compact viewport.');
    const layoutError: string | null = await settingsWindow.webContents.executeJavaScript(`(() => {
      if (document.documentElement.scrollWidth > innerWidth) return 'Horizontal overflow';
      const choices = [...document.querySelectorAll('#pet-species [role=radio]')];
      if (choices.length !== 4 || choices.some(choice => choice.getBoundingClientRect().height < 40)) return 'Missing companion choices';
      for (const row of document.querySelectorAll('.setting-row,.coat-color-row')) {
        if (!row.checkVisibility()) continue;
        const label = row.querySelector('div'), control = row.querySelector('select,input');
        if (label && control) {
          const a = label.getBoundingClientRect(), b = control.getBoundingClientRect();
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) return 'Overlapping label and field';
        }
      }
      for (const block of document.querySelectorAll('.selected-pet,.coat-color-row,fieldset,.setting-row,.save-bar,.model-section')) {
        if (!block.checkVisibility()) continue;
        const box = block.getBoundingClientRect(), style = getComputedStyle(block);
        const lines = [];
        if (parseFloat(style.borderTopWidth)) lines.push(box.top);
        if (parseFloat(style.borderBottomWidth)) lines.push(box.bottom);
        for (const field of block.querySelectorAll('input,select,textarea,button')) {
          if (!field.checkVisibility()) continue;
          const r = field.getBoundingClientRect();
          if (lines.some(y => y > r.top + 1 && y < r.bottom - 1)) return 'Divider crosses a field';
        }
      }
      return null;
    })()`);
    await writeFile(path.join(imageDirectory, 'coat-closet-compact.png'), (await settingsWindow.capturePage()).toPNG());
    if (layoutError) throw new Error(`Compact settings layout failed: ${layoutError}`);
    await settingsWindow.webContents.executeJavaScript(`window.scrollTo(0,0)`);
    await writeFile(path.join(imageDirectory, 'pets-compact.png'), (await settingsWindow.capturePage()).toPNG());
    settingsWindow.setSize(660, 800);
    await new Promise(resolve => setTimeout(resolve, 150));
    await writeFile(path.join(imageDirectory, 'pets-regular.png'), (await settingsWindow.capturePage()).toPNG());
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
    const loadedColors: boolean = await reopened.webContents.executeJavaScript(`window.miso.getSnapshot().then(snapshot =>
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
    const speciesSettings = { ...settings, allowedApps: [...settings.allowedApps] };
    if (timer) clearInterval(timer);
    try {
      await reopened.webContents.executeJavaScript(`window.miso.getSnapshot().then(({settings}) =>
        window.miso.updateSettings({...settings, petSize:1, motionLevel:'gentle', followWindow:false, stayPut:true}))`);
      async function waitForSpecies(target: BrowserWindow, canvas: string, species: string): Promise<void> {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const rendered: boolean = await target.webContents.executeJavaScript(`(() => {
            const canvas = document.getElementById(${JSON.stringify(canvas)});
            return canvas.dataset.ready === 'true' && canvas.dataset.species === ${JSON.stringify(species)};
          })()`);
          if (rendered) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error(`The ${species} companion did not render on ${canvas}.`);
      }
      for (const species of ['dog', 'panda', 'octopus'] as const) {
        const before = pet.species;
        await reopened.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(`choose-${species}`)}).click()`);
        await waitForSpecies(reopened, 'coat-preview', species);
        if (pet.species !== before) throw new Error('Previewing a companion changed the desktop before Save.');
        await reopened.webContents.executeJavaScript(`document.getElementById('settings-form').requestSubmit()`);
        await waitForSpecies(window, 'pet-canvas', species);
        const persisted = await store.load();
        if (persisted.state?.pet.species !== species || persisted.state.settings.petSpecies !== species) {
          throw new Error(`The ${species} companion was not saved through the settings form.`);
        }
        for (const action of ['feed', 'pet', 'play'] as const) {
          await window.webContents.executeJavaScript(`window.miso.care(${JSON.stringify(action)})`);
          if (pet.mood !== getSpecies(species).care[action].mood) throw new Error(`The ${species} ${action} reaction failed.`);
        }
        for (const phase of ['idle', 'walking', 'sleeping', 'mimicking', 'eating', 'irritated', 'falling', 'home'] as const) {
          homeStage = phase === 'home';
          setPetBounds(position.x, position.y);
          pet = { ...pet, mood: phase === 'walking' || phase === 'falling' ? 'idle' : phase, reactionUntil: 0 };
          motion = phase === 'walking' ? { state: 'walking', direction: 1, speed: 65, progress: 0 }
            : phase === 'falling' ? { state: 'falling', direction: 1, speed: 0, progress: 0.5 }
            : phase === 'home' ? { state: 'home-entering', direction: 1, speed: 0, progress: 0.65 } : { ...IDLE_MOTION };
          clearDialogue();
          broadcast();
          await new Promise(resolve => setTimeout(resolve, phase === 'sleeping' ? 1000 : 400));
          const rendered: { error: string; eating: string; house: string } = await window.webContents.executeJavaScript(`({
            error: document.getElementById('pet-canvas').dataset.renderError || '',
            eating: document.getElementById('pet-canvas').dataset.eating,
            house: document.getElementById('pet-canvas').dataset.house
          })`);
          if (rendered.error || (phase === 'eating' && rendered.eating !== 'true') || (phase === 'home' && rendered.house !== 'true')) {
            throw new Error(`The ${species} ${phase} visual state failed.`);
          }
          await writeFile(path.join(imageDirectory, `pet-${species}-${phase}.png`), (await window.capturePage()).toPNG());
        }
        homeStage = false;
        motion = { ...IDLE_MOTION };
        pet = { ...pet, mood: 'idle' };
        setPetBounds(position.x, position.y);
        broadcast();
      }
      const choice: string = await reopened.webContents.executeJavaScript(`document.querySelector('#pet-species [aria-checked="true"]').dataset.species`);
      if (choice !== 'octopus') throw new Error('The saved companion selection did not remain selected.');
      console.log('MISO_SPECIES dog, panda and octopus: draft preview, explicit save, native care, eight visual states and persistence passed.');
    } finally {
      homeStage = false;
      motion = { ...IDLE_MOTION };
      await reopened.webContents.executeJavaScript(`window.miso.updateSettings(${JSON.stringify(speciesSettings)})`);
      setPetBounds(position.x, position.y);
      timer = setInterval(step, 1000 / 30);
    }
    if (process.argv.includes('--smoke-inference')) {
      const line = await ai.generate('code.exe', pet);
      if (ai.getStatus().phase !== 'ready') throw new Error(`Local inference smoke failed: ${ai.getStatus().error ?? 'Backend unavailable'}`);
      const fallback = scriptedComment({ ...pet, lastCommentAt: 0 }, settings.commentFrequency, Date.now());
      if (!line && !fallback) throw new Error('Rejected model output had no scripted fallback.');
      console.log('MISO_INFERENCE', line ?? `Generated output rejected; scripted fallback: ${fallback}`);
    }
    await save();
    const reloaded = await store.load();
    if (reloaded.state?.settings.allowedApps[0] !== 'code.exe' || reloaded.state.settings.motionLevel !== 'still') {
      throw new Error('Saved preferences did not round-trip.');
    }
    if (reloaded.state.settings.coatPattern !== 'dual' || reloaded.state.settings.coatColor !== '#315b65'
      || reloaded.state.settings.accentColor !== '#f4dfc3') throw new Error('Custom coat colors did not persist.');
    console.log('MISO_SMOKE passed: real transparent WebGL, directional gaze/neutral reset, reduced motion, isolated renderer/IPC, care, mimic, irritation, break reminders, home/needs pause, restore, size, consent, privilege guards, persistent single/dual coat, draft-only 3D preview, presets/custom colors, persistence.');
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
    dragging = false;
    careMenuOpen = false;
    if (timer) clearInterval(timer);
    stopForegroundLookup();
    geometryTracker?.dispose();
    void Promise.all([store ? save() : Promise.resolve(), ai ? ai.dispose() : Promise.resolve()])
      .catch((error: unknown) => console.error('Miso shutdown failed:', error))
      .finally(() => { tray?.destroy(); app.quit(); });
  });
  void app.whenReady().then(start).catch((error: unknown) => {
    console.error('Miso startup failed:', error);
    stopForegroundLookup();
    geometryTracker?.dispose();
    quitting = true;
    dragging = false;
    careMenuOpen = false;
    app.exit(1);
  });
}
