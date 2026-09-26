import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecretStore, type SecretEncryption } from "../src/electron/SecretStore";

const directories: string[] = [];

function encryption(available = true): SecretEncryption {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value).toString("base64")}`),
    decryptString: (value) => Buffer.from(value.toString().slice("encrypted:".length), "base64").toString()
  };
}

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("SecretStore", () => {
  it("persists only encrypted bytes and returns the decrypted key to the main process", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-secret-"));
    directories.push(directory);
    const file = join(directory, "groq-key.bin");
    const store = new SecretStore(file, encryption());

    store.saveKey(" secret-value ");

    expect(store.hasKey()).toBe(true);
    expect(store.readKey()).toBe("secret-value");
    expect(readFileSync(file, "utf8")).not.toContain("secret-value");
    store.clearKey();
    expect(store.hasKey()).toBe(false);
  });

  it("refuses plaintext persistence when secure encryption is unavailable", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-secret-"));
    directories.push(directory);
    const store = new SecretStore(join(directory, "groq-key.bin"), encryption(false));

    expect(() => store.saveKey("secret-value")).toThrow("Secure storage is unavailable");
    expect(store.readKey()).toBeUndefined();
  });
});
