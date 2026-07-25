import { createHash } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { deflateSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "build");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      const nx = x / (size - 1);
      const ny = y / (size - 1);
      // Envision teal → emerald gradient
      const r = Math.round(13 + (4 - 13) * nx + 8 * ny);
      const g = Math.round(148 + (120 - 148) * nx + 20 * (1 - ny));
      const b = Math.round(136 + (80 - 136) * nx);
      // rounded square mask
      const pad = size * 0.08;
      const rx = size * 0.22;
      const inX = x >= pad && x < size - pad;
      const inY = y >= pad && y < size - pad;
      let alpha = inX && inY ? 255 : 0;
      if (alpha) {
        const lx = x - pad;
        const ly = y - pad;
        const w = size - pad * 2;
        const h = size - pad * 2;
        const cx = Math.min(Math.max(lx, rx), w - rx);
        const cy = Math.min(Math.max(ly, rx), h - rx);
        const dx = lx - cx;
        const dy = ly - cy;
        if (dx * dx + dy * dy > rx * rx) alpha = 0;
      }
      // White "E" glyph for Envision Mail
      if (alpha) {
        const gx = (x - size * 0.30) / (size * 0.40);
        const gy = (y - size * 0.22) / (size * 0.56);
        const stem = gx >= 0 && gx <= 0.26 && gy >= 0 && gy <= 1;
        const top = gy >= 0 && gy <= 0.16 && gx >= 0 && gx <= 1;
        const mid = gy >= 0.42 && gy <= 0.58 && gx >= 0 && gx <= 0.82;
        const bot = gy >= 0.84 && gy <= 1 && gx >= 0 && gx <= 1;
        if (gx >= 0 && gx <= 1 && gy >= 0 && gy <= 1 && (stem || top || mid || bot)) {
          raw[i] = 255;
          raw[i + 1] = 255;
          raw[i + 2] = 255;
          raw[i + 3] = alpha;
          continue;
        }
      }
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIco(png) {
  // ICO with single PNG image (Vista+)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

const png512 = createPng(512);
const png256 = createPng(256);
writeFileSync(join(outDir, "icon.png"), png512);
writeFileSync(join(outDir, "icon-256.png"), png256);
writeFileSync(join(outDir, "icon.ico"), createIco(png256));

console.log("Wrote build/icon.png, build/icon-256.png, build/icon.ico");
console.log("hash", createHash("sha1").update(png512).digest("hex").slice(0, 10));
