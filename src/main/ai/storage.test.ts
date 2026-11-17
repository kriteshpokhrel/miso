import assert from 'node:assert/strict';
import { link, mkdtemp, open, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, parse, resolve } from 'node:path';
import { test } from 'node:test';
import { MODEL_INFO } from './catalog.js';
import { deleteModelFile, ensureModelDirectory, modelPaths, verifyInstalledModel } from './storage.js';

async function fixture(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(resolve('src', 'main', 'ai'), '.test-storage-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('storage rejects relative/root destinations and directory junctions', async () => {
  assert.throws(() => modelPaths('relative-model'));
  assert.throws(() => modelPaths(parse(resolve('.')).root));
  await fixture(async (directory) => {
    const realDirectory = join(directory, 'real');
    await ensureModelDirectory(realDirectory);
    const junction = join(directory, 'junction');
    await symlink(realDirectory, junction, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(ensureModelDirectory(join(junction, 'child')), /symlink|junction/i);
  });
});

test('a same-sized but wrong-hash model is not accepted at startup', async () => {
  await fixture(async (directory) => {
    const handle = await open(modelPaths(directory).model, 'wx');
    try { await handle.truncate(MODEL_INFO.sizeBytes); } finally { await handle.close(); }
    await assert.rejects(verifyInstalledModel(directory), /integrity/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(verifyInstalledModel(directory, controller.signal), { name: 'AbortError' });
  });
});

test('hardlinked model is rejected; deletion never affects its other name', async () => {
  await fixture(async (directory) => {
    const original = join(directory, 'original');
    await writeFile(original, 'private data');
    const { model } = modelPaths(directory);
    await link(original, model);
    await assert.rejects(verifyInstalledModel(directory), /unsafe/);
    await deleteModelFile(model);
    assert.equal(await readFile(original, 'utf8'), 'private data');
  });
});
