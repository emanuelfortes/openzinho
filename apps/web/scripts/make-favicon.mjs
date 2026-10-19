// Writes a 16+32+48 px favicon.ico (32-bit BMP entries): ice-to-blue bar on #030508.
// Usage (from apps/web): node scripts/make-favicon.mjs src/app/favicon.ico
import { writeFileSync } from 'node:fs';

const BG = [3, 5, 8];
const TOP = [194, 224, 255];
const BOTTOM = [31, 107, 255];

function image(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const barW = Math.round(size * 0.25), barH = Math.round(size * 0.625);
  const x0 = Math.round((size - barW) / 2), y0 = Math.round((size - barH) / 2);
  const corner = Math.max(1, Math.round(size / 16));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BG;
      const inBar = x >= x0 && x < x0 + barW && y >= y0 && y < y0 + barH;
      const cut = (x < x0 + corner || x >= x0 + barW - corner) && (y < y0 + corner || y >= y0 + barH - corner);
      if (inBar && !cut) {
        const t = (y - y0) / (barH - 1);
        color = TOP.map((c, i) => Math.round(c + (BOTTOM[i] - c) * t));
      }
      // BMP rows are bottom-up, pixels BGRA.
      const offset = ((size - 1 - y) * size + x) * 4;
      pixels[offset] = color[2]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[0]; pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // colour + AND mask
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(pixels.length, 20);
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  return Buffer.concat([header, pixels, mask]);
}

const sizes = [16, 32, 48];
const images = sizes.map(image);
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  dir.writeUInt8(size, entry); dir.writeUInt8(size, entry + 1);
  dir.writeUInt16LE(1, entry + 4); dir.writeUInt16LE(32, entry + 6);
  dir.writeUInt32LE(images[i].length, entry + 8); dir.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
writeFileSync(process.argv[2], Buffer.concat([dir, ...images]));
console.log('wrote', process.argv[2]);
