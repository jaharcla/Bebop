import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";

export interface ForegroundContext {
  activeApp: string | null;
  processId: number;
  fullscreen: boolean;
  keyboardActive: boolean;
}

export function parseForegroundContext(line: string, ownProcessId: number): ForegroundContext | null {
  try {
    const value = JSON.parse(line);
    if (!value || !Number.isInteger(value.processId) || value.processId < 0
      || typeof value.fullscreen !== "boolean" || typeof value.keyboardActive !== "boolean"
      || (value.activeApp !== null && (typeof value.activeApp !== "string" || value.activeApp.length > 260))) return null;
    if (value.processId === ownProcessId) return { activeApp: null, processId: 0, fullscreen: false, keyboardActive: value.keyboardActive };
    return { activeApp: value.activeApp, processId: value.processId, fullscreen: value.fullscreen, keyboardActive: value.keyboardActive };
  } catch { return null; }
}

export const foregroundScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public class MintForeground {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Monitor { public int Size; public Rect Bounds, Work; public uint Flags; }
  public class Sample { public string activeApp; public uint processId; public bool fullscreen; public bool keyboardActive; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr monitor, ref Monitor info);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern int GetClassName(IntPtr window, StringBuilder name, int count);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public int X, Y; public uint Private; }
  delegate IntPtr KeyboardCallback(int code, IntPtr message, IntPtr data);
  static readonly KeyboardCallback keyboardCallback = OnKeyboard;
  static long lastKeyboardTick;
  static IntPtr keyboardHook;
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int type, KeyboardCallback callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string module);
  static IntPtr OnKeyboard(int code, IntPtr message, IntPtr data) {
    if (code >= 0 && (message.ToInt64() == 0x100 || message.ToInt64() == 0x104))
      Interlocked.Exchange(ref lastKeyboardTick, DateTime.UtcNow.Ticks);
    return CallNextHookEx(keyboardHook, code, message, data);
  }
  public static void StartKeyboard() {
    var ready = new ManualResetEvent(false);
    var thread = new Thread(() => {
      keyboardHook = SetWindowsHookEx(13, keyboardCallback, GetModuleHandle(null), 0);
      ready.Set();
      if (keyboardHook == IntPtr.Zero) return;
      try { Message message; while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { } }
      finally { UnhookWindowsHookEx(keyboardHook); }
    });
    thread.IsBackground = true;
    thread.Start();
    if (!ready.WaitOne(5000) || keyboardHook == IntPtr.Zero) throw new InvalidOperationException("Keyboard activity detection unavailable.");
  }
  public static Sample Read(bool apps, bool keyboard) {
    var result = new Sample { keyboardActive = keyboard && DateTime.UtcNow.Ticks - Interlocked.Read(ref lastKeyboardTick) < TimeSpan.FromSeconds(5).Ticks };
    if (!apps) return result;
    var previousDpi = SetThreadDpiAwarenessContext(new IntPtr(-4));
    try {
      var window = GetForegroundWindow();
      if (window == IntPtr.Zero || IsIconic(window)) return result;
      var name = new StringBuilder(256);
      GetClassName(window, name, name.Capacity);
      if (name.ToString() == "Progman" || name.ToString() == "WorkerW" || name.ToString() == "Shell_TrayWnd") return result;
      GetWindowThreadProcessId(window, out result.processId);
      try { using (var process = Process.GetProcessById((int)result.processId)) result.activeApp = process.ProcessName; } catch { }
      Rect rect;
      var monitor = new Monitor { Size = Marshal.SizeOf(typeof(Monitor)) };
      if (GetWindowRect(window, out rect) && GetMonitorInfo(MonitorFromWindow(window, 2), ref monitor)) {
        var bounds = monitor.Bounds;
        bool covers = rect.Left <= bounds.Left + 2 && rect.Top <= bounds.Top + 2 && rect.Right >= bounds.Right - 2 && rect.Bottom >= bounds.Bottom - 2;
        bool caption = (GetWindowLong(window, -16) & 0x00C00000) != 0;
        result.fullscreen = covers && !caption;
      }
      return result;
    } finally { if (previousDpi != IntPtr.Zero) SetThreadDpiAwarenessContext(previousDpi); }
  }
}
'@
if (KEYBOARD_ENABLED) { [MintForeground]::StartKeyboard() }
while ($true) {
  try { $parent = [System.Diagnostics.Process]::GetProcessById(PARENT_PROCESS_ID); $parent.Dispose() } catch { break }
  [MintForeground]::Read(APP_ENABLED, KEYBOARD_ENABLED) | ConvertTo-Json -Compress
  Start-Sleep -Milliseconds 1000
}
`;

export class DesktopAwareness {
  private child: ChildProcess | undefined;
  private watchdog: NodeJS.Timeout | undefined;
  private lastSampleAt = 0;
  private retryAt = 0;
  private mode = "";

  constructor(private readonly onContext: (context: ForegroundContext | null) => void) {}

  start(options = { app: true, keyboard: false }): void {
    const mode = JSON.stringify(options);
    if (this.mode !== mode) { if (this.mode) this.stop(); this.mode = mode; this.retryAt = 0; }
    if ((!options.app && !options.keyboard) || process.platform !== "win32" || this.child || Date.now() < this.retryAt) return;
    const script = foregroundScript.replace("PARENT_PROCESS_ID", String(process.pid))
      .replaceAll("APP_ENABLED", options.app ? "$true" : "$false")
      .replaceAll("KEYBOARD_ENABLED", options.keyboard ? "$true" : "$false");
    const child = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    this.child = child;
    this.lastSampleAt = Date.now();
    const lines = createInterface({ input: child.stdout! });
    lines.on("line", (line) => {
      if (this.child !== child) return;
      const context = parseForegroundContext(line, process.pid);
      if (!context) return;
      this.lastSampleAt = Date.now();
      this.onContext(context);
    });
    const failed = () => {
      lines.close();
      if (this.child !== child) return;
      this.retryAt = Date.now() + 30_000;
      this.stop();
    };
    child.once("error", failed);
    child.once("exit", failed);
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastSampleAt > 10_000) failed();
    }, 2_000);
  }

  stop(): void {
    const child = this.child;
    this.child = undefined;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = undefined;
    child?.kill();
    this.onContext(null);
  }
}
