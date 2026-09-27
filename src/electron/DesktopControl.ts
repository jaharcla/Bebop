import { execFile, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { foregroundScript } from "./DesktopAwareness";

export type DesktopAction = "cursor-nudge" | "spotify-play-pause" | "spotify-next" | "vlc-play-pause" | "vlc-next";
export interface ActionPermissions { cursorNudgesEnabled: boolean; spotifyControlEnabled: boolean; vlcControlEnabled: boolean; }
export function isDesktopAction(value: unknown): value is DesktopAction {
  return typeof value === "string" && ["cursor-nudge", "spotify-play-pause", "spotify-next", "vlc-play-pause", "vlc-next"].includes(value);
}
export function actionAllowed(action: DesktopAction, permissions: ActionPermissions): boolean {
  return action === "cursor-nudge" ? permissions.cursorNudgesEnabled
    : action.startsWith("spotify-") ? permissions.spotifyControlEnabled : permissions.vlcControlEnabled;
}

const cursorSource = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public class MintCursor {
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  static bool Cancel() { foreach (int key in new int[] { 1, 2, 4, 5, 6, 27 }) if ((GetAsyncKeyState(key) & 0x8000) != 0) return true; return false; }
  public static bool Nudge() {
    var previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
    try {
      Point expected, current;
      if (!GetCursorPos(out expected) || Cancel()) return false;
      Thread.Sleep(150);
      for (int i = 0; i < 12; i++) {
        if (Cancel() || !GetCursorPos(out current) || current.X != expected.X || current.Y != expected.Y) return false;
        if (!SetCursorPos(expected.X + 2, expected.Y)) return false;
        if (!GetCursorPos(out expected)) return false;
        Thread.Sleep(25);
      }
      return true;
    } finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
  }
}
'@
if ([MintForeground]::Read($true, $false).fullscreen) { throw 'Cursor play is unavailable during fullscreen apps.' }
if (![MintCursor]::Nudge()) { throw 'Nudge stopped because of user input or an unavailable desktop.' }
'Cursor nudged.'
`;

const mediaSource = String.raw`
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
function Await($operation, $resultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation' + [char]96 + '1' } | Select-Object -First 1
  $task = $method.MakeGenericMethod($resultType).Invoke($null, @($operation))
  if (!$task.Wait(5000)) { throw 'Media control timed out.' }
  return $task.Result
}
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'SESSION_PATTERN' } | Select-Object -First 1
if (!$session) { throw 'No supported media session. Open the permitted app and start playback first.' }
$operation = MEDIA_OPERATION
if (!(Await $operation ([bool]))) { throw 'The app did not accept that media command.' }
'Media command accepted.'
`;

export function desktopActionScript(action: DesktopAction): string {
  if (action === "cursor-nudge") return "$ErrorActionPreference = 'Stop'\n" + foregroundScript.slice(0, foregroundScript.indexOf("'@") + 2) + "\n" + cursorSource;
  const pattern = action.startsWith("spotify-") ? "^(Spotify(\\.exe)?|SpotifyAB\\.SpotifyMusic_[^!]+!Spotify)$" : "^(vlc(\\.exe)?|VideoLAN\\.VLC_[^!]+!App)$";
  return "$ErrorActionPreference = 'Stop'\n" + mediaSource.replace("SESSION_PATTERN", pattern)
    .replace("MEDIA_OPERATION", action.endsWith("-next") ? "$session.TrySkipNextAsync()" : "$session.TryTogglePlayPauseAsync()");
}

export class DesktopControl {
  private child: ChildProcess | undefined;
  private nextNudgeAt = 0;
  constructor(private readonly allowed: (action: DesktopAction) => boolean) {}

  cancel(): void { this.child?.kill(); this.child = undefined; }

  run(action: DesktopAction): Promise<{ ok: boolean; message: string }> {
    if (process.platform !== "win32" || !this.allowed(action)) return Promise.resolve({ ok: false, message: "Enable this permission in Settings first." });
    if (this.child) return Promise.resolve({ ok: false, message: "Tiny Mint is finishing another action." });
    if (action === "cursor-nudge" && Date.now() < this.nextNudgeAt) return Promise.resolve({ ok: false, message: "Cursor play is cooling down." });
    if (action === "cursor-nudge") this.nextNudgeAt = Date.now() + 180_000;
    return new Promise((resolve) => {
      const child = execFile(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(desktopActionScript(action), "utf16le").toString("base64")],
        { windowsHide: true, timeout: 12_000, maxBuffer: 32_768 }, (error, stdout) => {
          if (this.child === child) this.child = undefined;
          resolve({ ok: !error, message: error ? "Action stopped or unavailable. For media, open the permitted app and start playback first." : stdout.trim() });
        });
      this.child = child;
    });
  }
}
