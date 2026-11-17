import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeAppName } from './validation.js';

const run = promisify(execFile);
const WINDOWS_QUERY = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class NookiForeground { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint id); }';
$processIdValue = [uint32]0;
[void][NookiForeground]::GetWindowThreadProcessId([NookiForeground]::GetForegroundWindow(), [ref]$processIdValue);
$p = Get-Process -Id $processIdValue -ErrorAction Stop;
[Console]::Write($p.ProcessName + '.exe');
`;
const MAC_QUERY = `ObjC.import('AppKit'); $.NSWorkspace.sharedWorkspace.frontmostApplication.localizedName.js`;

export async function foregroundAppName(platform: NodeJS.Platform = process.platform): Promise<string | null> {
  let stdout: string;
  if (platform === 'win32') {
    ({ stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_QUERY], {
      windowsHide: true, timeout: 5000, maxBuffer: 1024,
    }));
  } else if (platform === 'darwin') {
    ({ stdout } = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_QUERY], {
      timeout: 5000, maxBuffer: 1024,
    }));
  } else {
    throw new Error('Application comments are supported only on Windows and macOS.');
  }
  const name = normalizeAppName(stdout);
  if (!name || name.length > 80 || !/^[a-z0-9][a-z0-9 ._()+-]*$/.test(name)) {
    throw new Error('The active application did not provide a usable application name.');
  }
  return name;
}
