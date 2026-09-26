import { execFile } from "node:child_process";
import type { DesktopActivityKind } from "../shared/types";

export interface ForegroundWindowSample {
  processName: string;
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export const FOREGROUND_SAMPLE_INTERVAL_MS = 6_000;

const POWERSHELL_FOREGROUND_SCRIPT = String.raw`
$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TinyMintNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@
Add-Type -TypeDefinition $source -ErrorAction SilentlyContinue
$handle = [TinyMintNative]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { exit 0 }
[uint32]$processId = 0
[TinyMintNative]::GetWindowThreadProcessId($handle, [ref]$processId) | Out-Null
$text = New-Object System.Text.StringBuilder 512
[TinyMintNative]::GetWindowText($handle, $text, $text.Capacity) | Out-Null
$rect = New-Object TinyMintNative+RECT
[TinyMintNative]::GetWindowRect($handle, [ref]$rect) | Out-Null
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if ($null -eq $process) { exit 0 }
[pscustomobject]@{ processName=$process.ProcessName; title=$text.ToString(); x=$rect.Left; y=$rect.Top; width=[Math]::Max(0,$rect.Right-$rect.Left); height=[Math]::Max(0,$rect.Bottom-$rect.Top) } | ConvertTo-Json -Compress
`;

function has(value:string, terms:readonly string[]):boolean { return terms.some((term)=>value.includes(term)); }

export function classifyDesktopActivity(processName:string,title:string):DesktopActivityKind {
  const process=processName.trim().toLowerCase();
  const text=title.trim().toLowerCase();
  if (has(process,["code","devenv","idea64","webstorm64","pycharm64","rider64","cursor","windsurf","sublime_text","notepad++"]) || has(text,["visual studio code","github","gitlab","localhost:","typescript","javascript","python"])) return "coding";
  if (has(process,["photoshop","krita","clipstudio","illustrator","figma","blender","mspaint","paintdotnet"]) || has(text,["figma","canva","photoshop","krita"])) return "drawing";
  if (has(process,["discord","slack","teams","whatsapp","telegram","signal"]) || has(text,["chatgpt","claude","gemini","discord","slack"])) return "chatting";
  if (has(process,["powerpnt"]) || has(text,["powerpoint","google slides","presenting"])) return "presentation";
  if (has(process,["spotify","vlc","mpv","wmplayer"]) || has(text,["youtube","netflix","twitch","spotify"])) return "media";
  if (has(process,["acrord32","acrobat","sumatrapdf","calibre","kindle"]) || has(text,[".pdf","wikipedia","reader"])) return "reading";
  if (has(process,["winword","wordpad","notion"]) || has(text,["google docs","microsoft word","notion"])) return "writing";
  if (has(process,["chrome","msedge","firefox","opera","brave"])) return "browsing";
  if (has(process+" "+text,["steam_app_","minecraft","robloxplayer","valorant","fortnite"])) return "game";
  return "unknown";
}

export function isFullscreenWindow(windowBounds:ForegroundWindowSample["bounds"],displayBounds:{x:number;y:number;width:number;height:number},tolerance=4):boolean {
  return windowBounds.width>0 && windowBounds.height>0
    && Math.abs(windowBounds.x-displayBounds.x)<=tolerance
    && Math.abs(windowBounds.y-displayBounds.y)<=tolerance
    && Math.abs(windowBounds.width-displayBounds.width)<=tolerance
    && Math.abs(windowBounds.height-displayBounds.height)<=tolerance;
}

export async function sampleWindowsForegroundWindow(timeoutMs=2500):Promise<ForegroundWindowSample|null> {
  if (process.platform!=="win32") return null;
  return new Promise((resolve)=>{
    execFile("powershell.exe",["-NoProfile","-NonInteractive","-Command",POWERSHELL_FOREGROUND_SCRIPT],{windowsHide:true,timeout:timeoutMs,maxBuffer:64*1024},(error,stdout)=>{
      if (error || !stdout.trim()) return resolve(null);
      try {
        const value=JSON.parse(stdout.trim()) as Record<string,unknown>;
        const bounds={x:Number(value.x),y:Number(value.y),width:Number(value.width),height:Number(value.height)};
        if (typeof value.processName!=="string" || typeof value.title!=="string" || !Object.values(bounds).every(Number.isFinite)) return resolve(null);
        resolve({processName:value.processName,title:value.title,bounds});
      } catch { resolve(null); }
    });
  });
}
