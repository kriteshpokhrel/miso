import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeAppName } from './validation.js';
import { WindowsLineReader } from './windows-line-reader.js';

const run = promisify(execFile);
const WINDOWS_QUERY = `
$ErrorActionPreference = 'Stop';
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class NookiForeground { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint id); }';
while ($null -ne [Console]::ReadLine()) {
  $processIdValue = [uint32]0;
  [void][NookiForeground]::GetWindowThreadProcessId([NookiForeground]::GetForegroundWindow(), [ref]$processIdValue);
  if ($processIdValue -eq 0) { throw 'No foreground process is available.'; }
  $p = Get-Process -Id $processIdValue -ErrorAction Stop;
  [Console]::WriteLine($p.ProcessName + '.exe');
}
`;
const MAC_QUERY = `ObjC.import('AppKit'); $.NSWorkspace.sharedWorkspace.frontmostApplication.localizedName.js`;
let windowsReader: WindowsLineReader | null = null;
let macLookup: AbortController | null = null;

export function stopForegroundLookup(): void {
  windowsReader?.dispose();
  windowsReader = null;
  macLookup?.abort();
  macLookup = null;
}

export function parseForegroundAppName(stdout: string): string {
  const name = normalizeAppName(stdout);
  if (!name || name.length > 80 || !/^[a-z0-9][a-z0-9 ._()+-]*$/.test(name)) {
    throw new Error('The active application did not provide a usable application name.');
  }
  return name;
}

export async function foregroundAppName(platform: NodeJS.Platform = process.platform): Promise<string | null> {
  let stdout: string;
  if (platform === 'win32') {
    const reader = windowsReader ??= new WindowsLineReader({
      script: WINDOWS_QUERY, label: 'Foreground application', maxResponseBytes: 1024,
    });
    stdout = await reader.read();
    if (windowsReader !== reader) throw new Error('Foreground application lookup was stopped.');
    try { return parseForegroundAppName(stdout); }
    catch (error) {
      reader.dispose();
      if (windowsReader === reader) windowsReader = null;
      throw error;
    }
  } else if (platform === 'darwin') {
    if (macLookup) throw new Error('Foreground application lookup already running.');
    const controller = new AbortController();
    macLookup = controller;
    try {
      ({ stdout } = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_QUERY], {
        timeout: 5000, maxBuffer: 1024, signal: controller.signal,
      }));
      if (controller.signal.aborted) throw new Error('Stopped');
    } catch {
      throw new Error(controller.signal.aborted ? 'Foreground application lookup was stopped.'
        : 'Foreground application lookup failed. Check macOS app metadata availability and retry.');
    } finally {
      if (macLookup === controller) macLookup = null;
    }
  } else {
    throw new Error('Application comments are supported only on Windows and macOS.');
  }
  return parseForegroundAppName(stdout);
}
