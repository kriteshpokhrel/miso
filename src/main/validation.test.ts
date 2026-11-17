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
});
