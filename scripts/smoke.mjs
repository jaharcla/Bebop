import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import electron from "electron";

const output = resolve("artifacts/smoke");
mkdirSync(output, { recursive: true });
const child = spawn(electron, ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TINY_MINT_SMOKE_OUTPUT: output,
    TINY_MINT_SMOKE_USER_DATA: mkdtempSync(resolve(tmpdir(), "tiny-mint-smoke-"))
  },
  stdio: "inherit"
});

child.on("exit", (code) => process.exit(code ?? 1));
