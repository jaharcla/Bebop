import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import electron from "electron";

const output = resolve("artifacts/smoke");
const userData = mkdtempSync(resolve(tmpdir(), "tiny-mint-smoke-"));
mkdirSync(output, { recursive: true });
const child = spawn(electron, ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TINY_MINT_SMOKE_OUTPUT: output,
    TINY_MINT_SMOKE_USER_DATA: userData
  },
  stdio: "inherit"
});

child.on("error", (error) => {
  rmSync(userData, { recursive: true, force: true });
  console.error("Could not start Electron smoke test.", error);
  process.exit(1);
});
child.on("exit", (code) => {
  rmSync(userData, { recursive: true, force: true });
  process.exit(code ?? 1);
});
