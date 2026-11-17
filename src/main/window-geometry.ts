import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WindowGeometry } from '../domain/motion.js';
import { WindowsLineReader } from './windows-line-reader.js';

const execute = promisify(execFile);
const windowsScript = `
$ErrorActionPreference = 'Stop';
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class NookiGeometry {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out Rect r, int size);
  static IntPtr previous;
  public static string Read(uint own) {
    SetProcessDPIAware();
    var h = GetForegroundWindow(); uint pid; GetWindowThreadProcessId(h, out pid);
    if (pid == own) h = previous; else previous = h;
    if (h == IntPtr.Zero || h == GetShellWindow() || !IsWindowVisible(h) || IsIconic(h)) return "null";
    Rect r;
    if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(Rect))) != 0 && !GetWindowRect(h, out r)) return "null";
    return "{\\"bounds\\":{\\"x\\":" + r.Left + ",\\"y\\":" + r.Top + ",\\"width\\":" + (r.Right-r.Left) + ",\\"height\\":" + (r.Bottom-r.Top) + "},\\"maximized\\":" + (IsZoomed(h) ? "true" : "false") + "}";
  }
}
'@
while ($null -ne [Console]::ReadLine()) { [Console]::WriteLine([NookiGeometry]::Read(${process.pid})); }
`;

export function parseWindowGeometry(value: unknown): WindowGeometry | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || !('bounds' in value) || !('maximized' in value) || typeof value.maximized !== 'boolean') {
    throw new Error('Invalid window geometry response.');
  }
  const bounds = value.bounds;
  if (!bounds || typeof bounds !== 'object' || !('x' in bounds) || !('y' in bounds) || !('width' in bounds) || !('height' in bounds)) {
    throw new Error('Missing window bounds.');
  }
  const { x, y, width, height } = bounds;
  if (![x, y, width, height].every(item => typeof item === 'number' && Number.isFinite(item) && Math.abs(item) < 1_000_000)
    || typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number'
    || width <= 0 || height <= 0) throw new Error('Invalid window bounds.');
  return { bounds: { x, y, width, height }, maximized: value.maximized };
}

/** Read-only geometry channel. No titles, process names, pixels or window-control operations. */
export class WindowGeometryTracker {
  private readonly windowsReader = new WindowsLineReader({ script: windowsScript, label: 'Window geometry' });
  private macOwner = 0;
  private stopped = false;

  async read(): Promise<WindowGeometry | null> {
    if (this.stopped) throw new Error('Window geometry tracker was stopped.');
    if (process.platform === 'darwin') {
      const source = `ObjC.import('AppKit'); ObjC.import('CoreGraphics');
const front = Number($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);
const owner = front === ${process.pid} ? ${this.macOwner} : front;
const windows = ObjC.deepUnwrap($.CGWindowListCopyWindowInfo(1, 0));
const found = windows.find(w => w.kCGWindowOwnerPID === owner && w.kCGWindowLayer === 0 && w.kCGWindowBounds.Width > 100 && w.kCGWindowBounds.Height > 100);
JSON.stringify(found ? {owner, bounds: {x:found.kCGWindowBounds.X,y:found.kCGWindowBounds.Y,width:found.kCGWindowBounds.Width,height:found.kCGWindowBounds.Height},maximized:false} : null);`;
      const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', source], { timeout: 3500, maxBuffer: 4096 });
      const raw: unknown = JSON.parse(stdout);
      if (raw && typeof raw === 'object' && 'owner' in raw && typeof raw.owner === 'number') this.macOwner = raw.owner;
      return parseWindowGeometry(raw);
    }
    if (process.platform !== 'win32') throw new Error('Window following is available on Windows and macOS only.');
    return parseWindowGeometry(JSON.parse(await this.windowsReader.read()));
  }

  dispose(): void {
    this.stopped = true;
    this.windowsReader.dispose();
  }
}
