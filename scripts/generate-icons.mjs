import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const source = await readFile("assets/sprites/mascot-atlas.png");
const frame = await sharp(source).extract({ left: 0, top: 0, width: 96, height: 96 }).png().toBuffer();
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(async (size) => {
  const spriteSize = Math.max(1, Math.floor(size * 0.875));
  const padding = Math.floor((size - spriteSize) / 2);
  return sharp(frame)
    .resize(spriteSize, spriteSize, { kernel: "nearest" })
    .extend({
      top: padding,
      bottom: size - spriteSize - padding,
      left: padding,
      right: size - spriteSize - padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
}));

await mkdir("build", { recursive: true });
await writeFile("build/icon.png", images.at(-1));
await writeFile("build/icon.ico", await pngToIco(images));
