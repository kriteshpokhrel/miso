import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import type { ModelStatus, PetState } from '../../shared/contracts.js';
import { LocalAiService } from './service.js';
import { modelPaths } from './storage.js';

async function fixture(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(resolve('src', 'main', 'ai'), '.test-service-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('initialization is offline, clears stale partial data, and missing AI never blocks fallback', async () => {
  await fixture(async (directory) => {
    await writeFile(modelPaths(directory).part, 'interrupted transfer');
    const statuses: ModelStatus[] = [];
    const service = new LocalAiService(directory, (status) => statuses.push(status));
    await service.initialize();
    assert.equal(service.getStatus().phase, 'not-installed');
    assert.deepEqual(await readdir(directory), []);
    assert.equal(await service.generate('code.exe', {} as PetState), null);
    await service.download(false);
    assert.match(service.getStatus().error!, /explicit consent/);
    assert.deepEqual(await readdir(directory), []);
    await service.cancelDownload();
    await service.dispose();
    assert.equal(service.getStatus().phase, 'not-installed');
    assert.ok(statuses.length > 0);
  });
});

test('corrupt installed model never becomes ready and removal preserves unrelated data', async () => {
  await fixture(async (directory) => {
    await writeFile(modelPaths(directory).model, 'bad model');
    await writeFile(join(directory, 'unrelated.txt'), 'keep');
    const service = new LocalAiService(directory, () => {});
    await service.initialize();
    assert.equal(service.getStatus().phase, 'error');
    assert.match(service.getStatus().error!, /Remove/);
    await service.remove();
    assert.equal(service.getStatus().phase, 'not-installed');
    assert.equal(await readFile(join(directory, 'unrelated.txt'), 'utf8'), 'keep');
    assert.deepEqual(await readdir(directory), ['unrelated.txt']);
  });
});

test('unsafe storage fails closed and failing observers are logged without breaking the service', async (context) => {
  const logged = context.mock.method(console, 'error', () => {});
  const service = new LocalAiService('relative-model-directory', () => { throw new Error('observer'); });
  await service.initialize();
  assert.equal(service.getStatus().phase, 'error');
  const copy = service.getStatus();
  copy.phase = 'ready';
  assert.equal(service.getStatus().phase, 'error');
  await service.remove();
  await service.dispose();
  assert.ok(logged.mock.calls.length > 0);
  assert.match(String(logged.mock.calls[0]?.arguments[0]), /status observer failed/);
});

test('an immediately cancelled consented transfer starts no network and clears the error/progress', async () => {
  await fixture(async (directory) => {
    const service = new LocalAiService(directory, () => {});
    await service.initialize();
    const transfer = service.download(true);
    await service.cancelDownload();
    await transfer;
    assert.deepEqual(service.getStatus(), {
      phase: 'not-installed', downloadedBytes: 0, totalBytes: service.getStatus().totalBytes,
    });
    assert.deepEqual(await readdir(directory), []);
  });
});
