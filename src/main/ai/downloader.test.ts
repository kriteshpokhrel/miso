import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { MODEL_INFO } from './catalog.js';
import { fetchModelResponse, validateDownloadUrl, writeVerifiedModel } from './downloader.js';
import { modelPaths } from './storage.js';

const expected = { sizeBytes: 3, sha256: createHash('sha256').update('cat').digest('hex') };
const signal = () => new AbortController().signal;
async function fixture(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(resolve('src', 'main', 'ai'), '.test-model-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
const body = (text: string, length = '3') => new Response(text, { headers: { 'content-length': length } });

test('download URL rejects plaintext, credentials, arbitrary ports, local and suffix lookalike hosts', () => {
  for (const url of [
    'http://huggingface.co/model', 'https://huggingface.co.evil.example/model',
    'https://huggingface.co@evil.example/model', 'https://user:pass@huggingface.co/model',
    'https://huggingface.co:8443/model', 'https://127.0.0.1/model', 'file:///model',
    'https://subdomain.huggingface.co/model',
  ]) assert.throws(() => validateDownloadUrl(url));
  assert.equal(validateDownloadUrl('https://us.aws.cdn.hf.co/model').hostname, 'us.aws.cdn.hf.co');
});

test('transport starts at pinned catalog URL and validates each redirect before following it', async () => {
  const requests: string[] = [];
  const response = await fetchModelResponse(signal(), async (url, init) => {
    requests.push(url);
    assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit');
    assert.equal((init.headers as Record<string, string>)['Accept-Encoding'], 'identity');
    return requests.length === 1
      ? new Response(null, { status: 302, headers: { location: 'https://us.aws.cdn.hf.co/file' } })
      : body('cat');
  });
  assert.deepEqual(requests, [MODEL_INFO.sourceUrl, 'https://us.aws.cdn.hf.co/file']);
  await response.body?.cancel();
  let requestsMade = 0;
  await assert.rejects(fetchModelResponse(signal(), async () => {
    requestsMade++;
    return new Response(null, { status: 302, headers: { location: 'https://localhost/private' } });
  }), /untrusted/);
  assert.equal(requestsMade, 1);
});

test('redirect loops, missing locations, server errors and cancellation fail closed', async () => {
  let requests = 0;
  await assert.rejects(fetchModelResponse(signal(), async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: '/loop' } });
  }), /redirect/i);
  assert.equal(requests, 6);
  await assert.rejects(fetchModelResponse(signal(), async () => new Response(null, { status: 302 })), /redirect/i);
  await assert.rejects(fetchModelResponse(signal(), async () => new Response(null, { status: 503 })), /503/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchModelResponse(controller.signal, async () => {
    assert.fail('Aborted transfer must not start a request');
  }), { name: 'AbortError' });
});

test('verified bytes promote atomically; the final file is absent while receiving chunks', async () => {
  await fixture(async (directory) => {
    const progress: number[] = [];
    let send: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { send = controller; } });
    const response = new Response(stream, { headers: { 'content-length': '3' } });
    const task = writeVerifiedModel(directory, response, expected, signal(), (bytes) => {
      progress.push(bytes);
    });
    send!.enqueue(Buffer.from('c'));
    send!.enqueue(Buffer.from('at'));
    assert.deepEqual(await readdir(directory), []);
    send!.close();
    await task;
    assert.equal(await readFile(modelPaths(directory).model, 'utf8'), 'cat');
    assert.deepEqual(await readdir(directory), [modelPaths(directory).model.split(/[\\/]/).at(-1)]);
    assert.deepEqual(progress, [1, 3]);
  });
});

test('rejects incorrect/missing/encoded length, truncated, oversized and corrupt bodies, leaving no files', async () => {
  const cases: Array<() => Response> = [
    () => body('cat', '4'),
    () => new Response('cat'),
    () => new Response('cat', { headers: { 'content-length': '3', 'content-encoding': 'gzip' } }),
    () => body('ca'),
    () => body('cats'),
    () => body('dog'),
  ];
  for (const response of cases) {
    await fixture(async (directory) => {
      await assert.rejects(writeVerifiedModel(directory, response(), expected, signal()));
      assert.deepEqual(await readdir(directory), []);
    });
  }
});

test('network stream failure cleans partial data without altering unrelated files', async () => {
  await fixture(async (directory) => {
    await writeFile(join(directory, 'keep.txt'), 'safe');
    let count = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (count++ === 0) controller.enqueue(Buffer.from('c'));
        else controller.error(new Error('connection lost'));
      },
    });
    await assert.rejects(writeVerifiedModel(
      directory, new Response(stream, { headers: { 'content-length': '3' } }), expected, signal(),
    ), /connection lost/);
    assert.deepEqual(await readdir(directory), ['keep.txt']);
    assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), 'safe');
  });
});

test('cancellation interrupts a stalled reader and removes its partial file', async () => {
  await fixture(async (directory) => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(reader) { reader.enqueue(Buffer.from('c')); },
      cancel() { cancelled = true; },
    });
    const task = writeVerifiedModel(
      directory, new Response(stream, { headers: { 'content-length': '3' } }),
      expected, controller.signal, () => controller.abort(),
    );
    await assert.rejects(task, { name: 'AbortError' });
    assert.equal(cancelled, true);
    assert.deepEqual(await readdir(directory), []);
  });
});

test('existing partial paths are never followed or overwritten', async () => {
  await fixture(async (directory) => {
    await writeFile(modelPaths(directory).part, 'existing');
    await assert.rejects(writeVerifiedModel(directory, body('cat'), expected, signal()), /EEXIST/);
    assert.equal(await readFile(modelPaths(directory).part, 'utf8'), 'existing');
  });
});
