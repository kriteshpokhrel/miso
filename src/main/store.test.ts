import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from './store.js';
import { DEFAULT_SETTINGS } from '../shared/contracts.js';
import { createPet } from '../domain/pet.js';

test('state saves serialize atomically and round-trip', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nooki-store-'));
  try {
    const store = new StateStore(directory);
    assert.deepEqual(await store.load(), { state: null, error: null });
    const pet = createPet(1000);
    await Promise.all([
      store.save({ version: 1, pet, settings: DEFAULT_SETTINGS }),
      store.save({ version: 1, pet, settings: { ...DEFAULT_SETTINGS, launchAtLogin: false } }),
    ]);
    assert.equal((await store.load()).state?.settings.launchAtLogin, false);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8')).version, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('corrupt state is preserved and recovery is explicit', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nooki-store-'));
  try {
    await writeFile(path.join(directory, 'state.json'), '{broken');
    const result = await new StateStore(directory).load();
    assert.equal(result.state, null);
    assert.match(result.error ?? '', /preserved/);
    const backup = (await readdir(directory)).find((file) => file.startsWith('state.corrupt-'));
    assert.ok(backup);
    assert.equal(await readFile(path.join(directory, backup), 'utf8'), '{broken');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
