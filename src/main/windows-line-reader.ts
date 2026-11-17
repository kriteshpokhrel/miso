import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

interface WindowsLineReaderOptions {
  script: string;
  label: string;
  startupTimeoutMs?: number;
  readTimeoutMs?: number;
  maxResponseBytes?: number;
}

type Launch = (script: string) => ChildProcessWithoutNullStreams;
const launchPowerShell: Launch = script => spawn('powershell.exe',
  ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });

/** Trusted main-process scripts only. One request/response at a time; no response or shell diagnostics are logged. */
export class WindowsLineReader {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending: {
    resolve: (line: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private buffer = Buffer.alloc(0);
  private warm = false;
  private stopped = false;

  constructor(private readonly options: WindowsLineReaderOptions, private readonly launch: Launch = launchPowerShell) {}

  async read(): Promise<string> {
    if (this.stopped) throw this.error('was stopped.');
    if (this.pending) throw this.error('already has a request running.');
    if (!this.child) this.start();
    const child = this.child!;
    return new Promise((resolve, reject) => {
      const cold = !this.warm;
      const timeout = cold ? this.options.startupTimeoutMs ?? 20_000 : this.options.readTimeoutMs ?? 3500;
      const timer = setTimeout(() => this.fail(child, this.error(
        cold ? 'startup timed out. Check that Windows PowerShell is available and permitted, then retry.'
          : 'read timed out. Retry; if it persists, check Windows PowerShell permissions.')), timeout);
      this.pending = { resolve, reject, timer };
      try {
        child.stdin.write('\n', error => {
          if (error) this.fail(child, this.error('could not receive a request. Retry the lookup.'));
        });
      } catch {
        this.fail(child, this.error('could not receive a request. Retry the lookup.'));
      }
    });
  }

  private error(message: string): Error {
    return new Error(`${this.options.label} helper ${message}`);
  }

  private start(): void {
    let child: ChildProcessWithoutNullStreams;
    try { child = this.launch(this.options.script); }
    catch { throw this.error('could not start. Check that Windows PowerShell is installed and permitted, then retry.'); }
    this.child = child;
    this.warm = false;
    this.buffer = Buffer.alloc(0);
    const ioFailure = (): void => this.fail(child, this.error('encountered a pipe error. Retry the lookup.'));
    child.on('error', () => this.fail(child, this.error(
      'could not start or continue. Check that Windows PowerShell is installed and permitted, then retry.')));
    child.stdin.on('error', ioFailure);
    child.stdout.on('error', ioFailure);
    child.stderr.on('error', ioFailure);
    child.stderr.on('data', () => this.fail(child, this.error(
      'reported a Windows error. Check PowerShell permissions and retry.')));
    child.on('exit', () => this.fail(child, this.error('exited unexpectedly. Retry the lookup.')));
    child.on('close', () => this.fail(child, this.error('closed unexpectedly. Retry the lookup.')));
    child.stdout.on('end', () => this.fail(child, this.error('closed its response stream. Retry the lookup.')));
    child.stdout.on('data', (chunk: Buffer) => {
      if (this.child !== child) return;
      if (!this.pending) {
        this.fail(child, this.error('sent an unexpected response. Retry the lookup.'));
        return;
      }
      if (this.buffer.length + chunk.length > (this.options.maxResponseBytes ?? 4096)) {
        this.fail(child, this.error('exceeded its response limit. Retry the lookup.'));
        return;
      }
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const end = this.buffer.indexOf(10);
      if (end < 0) return;
      if (end !== this.buffer.length - 1) {
        this.fail(child, this.error('sent an invalid response. Retry the lookup.'));
        return;
      }
      const line = this.buffer.subarray(0, end).toString('utf8').trim();
      this.buffer = Buffer.alloc(0);
      this.warm = true;
      const request = this.pending;
      this.pending = null;
      clearTimeout(request.timer);
      request.resolve(line);
    });
  }

  private fail(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.child = null;
    this.buffer = Buffer.alloc(0);
    this.warm = false;
    const request = this.pending;
    this.pending = null;
    if (request) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    // Terminate only the child owned by this reader; stale events cannot affect a replacement.
    try { child.kill(); } catch { /* The process may already have exited. */ }
  }

  dispose(): void {
    this.stopped = true;
    if (this.child) this.fail(this.child, this.error('was stopped.'));
  }
}
