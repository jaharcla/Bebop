import { existsSync } from "node:fs";
import { join } from "node:path";

export function loadDevelopmentEnvironment(devServerUrl: string | undefined, envPath = join(process.cwd(), ".env")): void {
  if (devServerUrl && existsSync(envPath)) process.loadEnvFile(envPath);
}
