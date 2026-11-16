// Makes the home-screen icons from public/icon.svg. Run: node scripts/make-icons.mjs
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out(name));
}
// A maskable icon keeps its artwork inside the middle 80%, so phones can crop it to any shape.
const inner = await sharp(svg, { density: 384 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#8f3812' } })
  .composite([{ input: inner, gravity: 'centre' }])
  .png()
  .toFile(out('icon-maskable-512.png'));
