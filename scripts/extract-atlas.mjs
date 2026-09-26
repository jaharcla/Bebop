import { readFileSync, writeFileSync } from "node:fs";

// Legacy helper only. The production atlas is now the v3 16-row atlas and must
// not be overwritten by the old v2 preview extraction.
const source = readFileSync("prototypes/Tiny-Mint-Preview-v2.html", "utf8");
const match = source.match(/const ATLAS='data:image\/png;base64,([^']+)'/);
if (!match) throw new Error("Embedded PNG atlas was not found in the preserved v2 prototype.");
writeFileSync("assets/sprites/v3-source/legacy-mascot-atlas-v2.png", Buffer.from(match[1], "base64"));
console.log("Wrote legacy v2 atlas reference. Production assets/sprites/mascot-atlas.png was left unchanged.");
