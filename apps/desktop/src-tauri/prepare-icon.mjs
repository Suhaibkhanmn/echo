import sharp from "../../../node_modules/.pnpm/sharp@0.32.6/node_modules/sharp/lib/index.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const input = join(__dirname, "icon-source.png");
const output = join(__dirname, "icon-square.png");

const SIZE = 1024;
const BG = { r: 245, g: 241, b: 232, alpha: 1 };

const meta = await sharp(input).metadata();
console.log("source:", meta.width, "x", meta.height);

// First, downscale so the longest side fits 80% of 1024 (some padding).
const scaled = await sharp(input)
  .resize({
    width: Math.round(SIZE * 0.85),
    height: Math.round(SIZE * 0.85),
    fit: "inside",
    background: BG,
  })
  .png()
  .toBuffer();

const sMeta = await sharp(scaled).metadata();
const w = sMeta.width ?? SIZE;
const h = sMeta.height ?? SIZE;

await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: BG,
  },
})
  .composite([
    {
      input: scaled,
      left: Math.floor((SIZE - w) / 2),
      top: Math.floor((SIZE - h) / 2),
    },
  ])
  .png()
  .toFile(output);

console.log(`wrote ${output}`);
