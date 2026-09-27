import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { DesktopAwareness } from "../src/electron/DesktopAwareness";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe.skipIf(process.platform !== "win32")("desktop awareness lifecycle", () => {
  function setup() {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const changed = vi.fn();
    const awareness = new DesktopAwareness(changed);
    awareness.start();
    return { child, changed, awareness };
  }

  it("starts only the opted-in detector and replaces the helper when switches change", () => {
    const { child, awareness } = setup();
    awareness.start({ app: false, keyboard: true });
    expect(child.kill).toHaveBeenCalledOnce();
    const call = vi.mocked(spawn).mock.calls.at(-1)!;
    const args = call[1] as string[];
    const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
    expect(script).toContain("[MintForeground]::Read($false, $true)");
    expect(script).toContain("if ($true) { [MintForeground]::StartKeyboard() }");
    awareness.start({ app: false, keyboard: true });
    expect(spawn).toHaveBeenCalledTimes(2);
    awareness.start({ app: false, keyboard: false });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(child.kill).toHaveBeenCalledTimes(2);
    awareness.stop();
  });

  it("clears stale fullscreen metadata and rate-limits retries", () => {
    const { child, changed, awareness } = setup();
    child.stdout.write('{"activeApp":"game","processId":123,"keyboardActive":false,"fullscreen":true}\n');
    expect(changed).toHaveBeenLastCalledWith({ activeApp: "game", processId: 123, keyboardActive: false, fullscreen: true });
    vi.advanceTimersByTime(12_000);
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(child.kill).toHaveBeenCalledOnce();
    awareness.start();
    expect(spawn).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    awareness.start();
    expect(spawn).toHaveBeenCalledTimes(2);
    awareness.stop();
  });

  it("stops on disable and ignores late samples or exit from the old helper", () => {
    const { child, changed, awareness } = setup();
    awareness.stop();
    child.stdout.write('{"activeApp":"game","processId":123,"keyboardActive":false,"fullscreen":true}\n');
    child.emit("exit", 0);
    vi.advanceTimersByTime(30_000);
    expect(changed).toHaveBeenCalledExactlyOnceWith(null);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("handles helper launch failures without retaining fullscreen state", () => {
    const { child, changed, awareness } = setup();
    child.emit("error", new Error("blocked"));
    expect(changed).toHaveBeenLastCalledWith(null);
    awareness.start();
    expect(spawn).toHaveBeenCalledOnce();
    awareness.stop();
  });
});
