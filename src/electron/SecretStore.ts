import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface SecretEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class SecretStore {
  constructor(
    private readonly filePath: string,
    private readonly encryption: SecretEncryption
  ) {}

  isAvailable(): boolean {
    return this.encryption.isEncryptionAvailable();
  }

  hasKey(): boolean {
    return this.isAvailable() && existsSync(this.filePath);
  }

  readKey(): string | undefined {
    if (!this.hasKey()) return undefined;
    try {
      const value = this.encryption.decryptString(readFileSync(this.filePath)).trim();
      return value || undefined;
    } catch {
      return undefined;
    }
  }

  saveKey(value: string): void {
    const key = value.trim();
    if (!key) throw new Error("Enter an API key first.");
    if (!this.isAvailable()) throw new Error("Secure storage is unavailable.");
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, this.encryption.encryptString(key), { mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
  }

  clearKey(): void {
    if (existsSync(this.filePath)) unlinkSync(this.filePath);
  }
}
