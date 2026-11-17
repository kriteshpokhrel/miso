import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS } from '../shared/contracts.js';
import { validateCare, validateIpcSender, validateSettings } from './validation.js';

test('IPC rejects destroyed owners without accessing their destroyed native webContents getter', () => {
  const sender = { isDestroyed: () => false, mainFrame: {} };
  const closed = {
    isDestroyed: () => true,
    get webContents(): typeof sender { throw new TypeError('Object has been destroyed'); },
  };
  assert.throws(() => validateIpcSender({ sender, senderFrame: sender.mainFrame }, [closed], false), /Untrusted request/);
});

test('IPC rejects shutdown and dead senders before touching their frames or owners', () => {
  for (const shuttingDown of [false, true]) {
    const sender = {
      isDestroyed: () => !shuttingDown,
      get mainFrame(): object { throw new TypeError('Object has been destroyed'); },
    };
    const event = {
      sender,
      get senderFrame(): object { throw new TypeError('Object has been destroyed'); },
    };
    const owner = {
      isDestroyed: () => false,
      get webContents(): typeof sender { throw new TypeError('Object has been destroyed'); },
    };
    assert.throws(() => validateIpcSender(event, [owner], shuttingDown), /closed or Nooki is shutting down/);
  }
});

test('IPC still requires an owned live main frame, never a child frame or another window', () => {
  const sender = { isDestroyed: () => false, mainFrame: {} };
  const owner = { isDestroyed: () => false, webContents: sender };
  assert.doesNotThrow(() => validateIpcSender({ sender, senderFrame: sender.mainFrame }, [null, owner], false));
  assert.throws(() => validateIpcSender({ sender, senderFrame: {} }, [owner], false), /Untrusted request/);
  assert.throws(() => validateIpcSender({ sender, senderFrame: null }, [owner], false), /Untrusted request/);
  assert.throws(() => validateIpcSender({ sender, senderFrame: sender.mainFrame }, [], false), /Untrusted request/);
});

test('settings normalize and deduplicate only application names', () => {
  assert.deepEqual(validateSettings({ ...DEFAULT_SETTINGS, allowedApps: ['Code.exe', ' code.exe ', 'Safari'] }).allowedApps,
    ['code.exe', 'safari']);
});

test('settings reject paths, commands, malformed settings and excessive allowlists', () => {
  for (const app of ['C:\\private\\document.txt', '../secret', 'Code.exe; calc', '$(whoami)', 'x'.repeat(81)]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, allowedApps: [app] }));
  }
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, aiEnabled: 'yes' }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, allowedApps: Array(31).fill('code.exe') }));
  assert.throws(() => validateCare('delete'));
  for (const petSize of [0, -1, 0.49, 1.51, NaN, Infinity, 'large']) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, petSize }));
  }
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, petSize: 0.5 }).petSize, 0.5);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, breakReminders: 'yes' }));
});

test('new preference fields migrate only when absent', () => {
  const legacy = { launchAtLogin: true, commentFrequency: 'quiet', aiEnabled: false, reducedMotion: false, allowedApps: [] };
  assert.equal(validateSettings(legacy).petSize, 1);
  assert.equal(validateSettings(legacy).breakReminders, true);
  assert.equal(validateSettings(legacy).coatColor, DEFAULT_SETTINGS.coatColor);
  assert.equal(validateSettings(legacy).accentColor, DEFAULT_SETTINGS.accentColor);
  assert.equal(validateSettings(legacy).coatPattern, 'dual');
  assert.equal(validateSettings(legacy).motionLevel, 'gentle');
  assert.equal(validateSettings({ ...legacy, reducedMotion: true }).motionLevel, 'still');
  assert.equal(validateSettings(legacy).followWindow, true);
  assert.equal(validateSettings(legacy).petSpecies, 'cat');
  for (const petSpecies of ['dog', 'panda', 'octopus', '__proto__', null, ['cat']]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, petSpecies }));
  }
  for (const motionLevel of ['fast', '', null, true, ['gentle'], {}]) assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, motionLevel }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, followWindow: 'yes' }));
});

test('coat choices accept only a known pattern and full hex colors, without discarding the accent in single mode', () => {
  const colors = validateSettings({ ...DEFAULT_SETTINGS, coatPattern: 'single', coatColor: '#1122FF', accentColor: '#AABBCC' });
  assert.equal(colors.coatColor, '#1122ff');
  assert.equal(colors.accentColor, '#aabbcc');
  for (const invalid of ['red', '#fff', '#11223344', '#12345z', 'url(file://secret)', '', null, 123]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, coatColor: invalid }));
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, accentColor: invalid }));
  }
  for (const coatPattern of ['triple', '', null, 0]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, coatPattern }));
  }
});
