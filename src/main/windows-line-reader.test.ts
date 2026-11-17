import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import test from 'node:test';
import { WindowsLineReader } from './windows-line-reader.js';

function fixture(options: { maxResponseBytes?: number } = {}) {
  const children: ReturnType<typeof makeChild>[] = [];
  function makeChild() {
    let writes = 0;
    let kills = 0;
    const child = Object.assign(new EventEmitter(), {
      stdin: new Writable({ write(_chunk, _encoding, done) { writes++; done(); } }),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill() { kills++; return true; },
      writes: 0,
      kills: 0,
    });
    return Object.defineProperties(child, { writes: { get: () => writes }, kills: { get: () => kills } });
  }
  const reader = new WindowsLineReader({ script: 'trusted script', label: 'Test lookup', ...options }, () => {
    const child = makeChild();
    children.push(child);
    return child as unknown as ChildProcessWithoutNullStreams;
  });
  return { reader, children };
}

test('one child serves successive requests, assembling split UTF-8/CRLF responses', async () => {
  const { reader, children } = fixture();
  try {
    const first = reader.read();
    const child = children[0]!;
    const encoded = Buffer.from('café.exe\r\n');
    child.stdout.write(encoded.subarray(0, 4));
    child.stdout.write(encoded.subarray(4));
    assert.equal(await first, 'café.exe');
    const second = reader.read();
    child.stdout.write('code.exe\n');
    assert.equal(await second, 'code.exe');
    assert.equal(children.length, 1);
    assert.equal(child.writes, 2);
  } finally { reader.dispose(); }
  assert.equal(children[0]!.kills, 1);
});

test('cold startup allows 20s, warm reads allow 3.5s, and timeouts permit a fresh cold retry', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { reader, children } = fixture();
  try {
    const cold = reader.read();
    context.mock.timers.tick(19_999);
    assert.equal(children[0]!.kills, 0);
    children[0]!.stdout.write('ready\n');
    await cold;
    const warm = reader.read();
    const warmFailure = assert.rejects(warm, /read timed out.*Retry/);
    context.mock.timers.tick(3499);
    assert.equal(children[0]!.kills, 0);
    context.mock.timers.tick(1);
    await warmFailure;
    assert.equal(children[0]!.kills, 1);
    const retry = reader.read();
    const coldFailure = assert.rejects(retry, /startup timed out.*PowerShell/);
    context.mock.timers.tick(19_999);
    assert.equal(children[1]!.kills, 0);
    context.mock.timers.tick(1);
    await coldFailure;
    assert.equal(children[1]!.kills, 1);
  } finally { reader.dispose(); }
});

test('concurrent requests are rejected without disturbing the outstanding response', async () => {
  const { reader, children } = fixture();
  try {
    const pending = reader.read();
    await assert.rejects(reader.read(), /already has a request/);
    children[0]!.stdout.write('ok\n');
    assert.equal(await pending, 'ok');
    assert.equal(children[0]!.writes, 1);
  } finally { reader.dispose(); }
});

test('dispose rejects pending reads, is idempotent and never restarts its child', async () => {
  const { reader, children } = fixture();
  const pending = reader.read();
  const rejected = assert.rejects(pending, /stopped/);
  reader.dispose();
  reader.dispose();
  await rejected;
  await assert.rejects(reader.read(), /stopped/);
  assert.equal(children.length, 1);
  assert.equal(children[0]!.kills, 1);
});

test('failures are sanitized and stale child events cannot kill a replacement', async () => {
  const { reader, children } = fixture();
  try {
    const pending = reader.read();
    const rejected = assert.rejects(pending, error =>
      error instanceof Error && /Windows error.*retry/.test(error.message) && !error.message.includes('PRIVATE'));
    children[0]!.stderr.write('PRIVATE source and command');
    await rejected;
    const retry = reader.read();
    children[0]!.emit('exit', null, 'SIGTERM');
    children[0]!.emit('error', new Error('PRIVATE'));
    children[0]!.stdout.write('stale\n');
    children[1]!.stdout.write('fresh\n');
    assert.equal(await retry, 'fresh');
    assert.equal(children[1]!.kills, 0);
  } finally { reader.dispose(); }
});

for (const failure of ['exit', 'close', 'spawn', 'stdin', 'stdout', 'stderr', 'end'] as const) {
  test(`${failure} failure rejects safely and permits a later retry`, async () => {
    const { reader, children } = fixture();
    try {
      const pending = reader.read();
      const rejected = assert.rejects(pending, error =>
        error instanceof Error && /helper/.test(error.message) && !error.message.includes('PRIVATE'));
      const child = children[0]!;
      if (failure === 'exit' || failure === 'close') child.emit(failure, null, 'SIGTERM');
      else if (failure === 'spawn') child.emit('error', new Error('PRIVATE command'));
      else if (failure === 'end') child.stdout.emit('end');
      else child[failure].emit('error', new Error('PRIVATE command'));
      await rejected;
      assert.equal(child.kills, 1);
      const retry = reader.read();
      children[1]!.stdout.write('recovered\n');
      assert.equal(await retry, 'recovered');
    } finally { reader.dispose(); }
  });
}

test('synchronous launch and write failures never expose their command', async () => {
  const failedLaunch = new WindowsLineReader({ script: 'PRIVATE', label: 'Test' }, () => { throw new Error('PRIVATE'); });
  await assert.rejects(failedLaunch.read(), /^Error: Test helper could not start\./);
  failedLaunch.dispose();
  const { reader, children } = fixture();
  try {
    const first = reader.read();
    children[0]!.stdout.write('ready\n');
    await first;
    children[0]!.stdin.write = () => { throw new Error('PRIVATE'); };
    await assert.rejects(reader.read(), /^Error: Test lookup helper could not receive a request\./);
    assert.equal(children[0]!.kills, 1);
  } finally { reader.dispose(); }
});

for (const response of ['123456789', 'one\ntwo\n', 'one\npartial']) {
  test(`oversized or extra response data is rejected (${JSON.stringify(response)})`, async () => {
    const { reader, children } = fixture({ maxResponseBytes: 8 });
    try {
      const pending = reader.read();
      const rejected = assert.rejects(pending, /response limit|invalid response/);
      children[0]!.stdout.write(response);
      await rejected;
      assert.equal(children[0]!.kills, 1);
    } finally { reader.dispose(); }
  });
}

test('unsolicited output invalidates the process rather than answering a future request', async () => {
  const { reader, children } = fixture();
  try {
    const first = reader.read();
    children[0]!.stdout.write('ok\n');
    await first;
    children[0]!.stdout.write('unsolicited\n');
    assert.equal(children[0]!.kills, 1);
    const next = reader.read();
    children[1]!.stdout.write('fresh\n');
    assert.equal(await next, 'fresh');
  } finally { reader.dispose(); }
});
