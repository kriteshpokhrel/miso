import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS } from '../shared/contracts.js';
import { validateCare, validateSettings } from './validation.js';

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
  for (const petSize of [0, -1, 0.69, 1.51, NaN, Infinity, 'large']) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, petSize }));
  }
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, breakReminders: 'yes' }));
});

test('new preference fields migrate only when absent', () => {
  const legacy = { launchAtLogin: true, commentFrequency: 'quiet', aiEnabled: false, reducedMotion: false, allowedApps: [] };
  assert.equal(validateSettings(legacy).petSize, 1);
  assert.equal(validateSettings(legacy).breakReminders, true);
  assert.equal(validateSettings(legacy).coatColor, DEFAULT_SETTINGS.coatColor);
  assert.equal(validateSettings(legacy).accentColor, DEFAULT_SETTINGS.accentColor);
  assert.equal(validateSettings(legacy).coatPattern, 'dual');
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
