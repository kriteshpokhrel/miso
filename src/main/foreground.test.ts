import assert from 'node:assert/strict';
import test from 'node:test';
import { foregroundAppName, parseForegroundAppName, stopForegroundLookup } from './foreground.js';
import { WindowsLineReader } from './windows-line-reader.js';

test('foreground names retain exact lowercase/trim allowlist normalization', () => {
  assert.equal(parseForegroundAppName('  Code.EXE\r\n'), 'code.exe');
  assert.equal(parseForegroundAppName('Visual Studio Code'), 'visual studio code');
  assert.equal(parseForegroundAppName('App (Work)+_-.exe'), 'app (work)+_-.exe');
  assert.equal(parseForegroundAppName('a'.repeat(80)), 'a'.repeat(80));
  for (const invalid of ['', ' ', 'a'.repeat(81), 'C:\\private\\code.exe', '../code.exe', 'code.exe\nprivate',
    'code.exe;command', '$(command)', 'é.exe']) {
    assert.throws(() => parseForegroundAppName(invalid), /^Error: The active application did not provide a usable application name\.$/);
  }
});

test('Windows polls reuse a reader until explicitly stopped, then create a fresh reader', async context => {
  const readers: WindowsLineReader[] = [];
  let disposals = 0;
  context.mock.method(WindowsLineReader.prototype, 'read', async function (this: WindowsLineReader) {
    readers.push(this);
    return ' Code.EXE\r\n';
  });
  context.mock.method(WindowsLineReader.prototype, 'dispose', () => { disposals++; });
  try {
    assert.equal(await foregroundAppName('win32'), 'code.exe');
    assert.equal(await foregroundAppName('win32'), 'code.exe');
    assert.equal(readers[0], readers[1]);
    stopForegroundLookup();
    stopForegroundLookup();
    assert.equal(disposals, 1);
    assert.equal(await foregroundAppName('win32'), 'code.exe');
    assert.notEqual(readers[0], readers[2]);
  } finally { stopForegroundLookup(); }
});

test('invalid foreground names dispose their helper and allow a fresh lookup', async context => {
  let response = 'PRIVATE/path';
  const read = context.mock.method(WindowsLineReader.prototype, 'read', async () => response);
  const dispose = context.mock.method(WindowsLineReader.prototype, 'dispose', () => {});
  try {
    await assert.rejects(foregroundAppName('win32'), error =>
      error instanceof Error && /usable application name/.test(error.message) && !error.message.includes('PRIVATE'));
    assert.equal(dispose.mock.calls.length, 1);
    response = 'code.exe';
    assert.equal(await foregroundAppName('win32'), 'code.exe');
    assert.notEqual(read.mock.calls[0]!.this, read.mock.calls[1]!.this);
  } finally { stopForegroundLookup(); }
});

test('stopping after a response arrives still suppresses the obsolete foreground result', async context => {
  let finish!: (name: string) => void;
  context.mock.method(WindowsLineReader.prototype, 'read', () => new Promise<string>(resolve => { finish = resolve; }));
  context.mock.method(WindowsLineReader.prototype, 'dispose', () => {});
  const result = foregroundAppName('win32');
  const rejected = assert.rejects(result, /stopped/);
  finish('code.exe');
  stopForegroundLookup();
  await rejected;
});

test('unsupported platforms fail without starting a native helper', async context => {
  const read = context.mock.method(WindowsLineReader.prototype, 'read', async () => 'code.exe');
  await assert.rejects(foregroundAppName('linux'), /Windows and macOS/);
  assert.equal(read.mock.calls.length, 0);
});
