/**
 * gen-icons.mjs — generates PNG icons and favicon.ico without any npm dependencies.
 * Uses Node.js built-in zlib to compress PNG data chunks.
 *
 * Colors:
 *   background  #0a0a0b  (near-black)
 *   inner rect  #111113
 *   accent      #14b8a6  (teal)
 */

import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');

// ─── colour helpers ───────────────────────────────────────────────────────────

function hex(h) {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, 255];
}

const BG    = hex('#0a0a0b');
const INNER = hex('#111113');
const TEAL  = hex('#14b8a6');
const TRANS = [0, 0, 0, 0];

// ─── pixel buffer ────────────────────────────────────────────────────────────

function makeBuffer(size) {
  // RGBA flat array
  const buf = new Uint8Array(size * size * 4);
  return { buf, size };
}

function setPixel({ buf, size }, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i]     = color[0];
  buf[i + 1] = color[1];
  buf[i + 2] = color[2];
  buf[i + 3] = color[3];
}

function getPixel({ buf, size }, x, y) {
  const i = (y * size + x) * 4;
  return [buf[i], buf[i+1], buf[i+2], buf[i+3]];
}

// ─── drawing primitives ───────────────────────────────────────────────────────

/** Fill all pixels */
function fill(fb, color) {
  for (let y = 0; y < fb.size; y++)
    for (let x = 0; x < fb.size; x++)
      setPixel(fb, x, y, color);
}

/** Filled rounded rectangle */
function roundRect(fb, rx, ry, rw, rh, r, color) {
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const dx = Math.min(x - rx, rx + rw - 1 - x);
      const dy = Math.min(y - ry, ry + rh - 1 - y);
      if (dx < r && dy < r) {
        const dist = Math.sqrt((r - dx - 1) ** 2 + (r - dy - 1) ** 2);
        if (dist > r) continue;
      }
      setPixel(fb, x, y, color);
    }
  }
}

/** Thick anti-aliased line using Wu's algorithm (alpha blend) */
function lineAA(fb, x0, y0, x1, y1, color, thickness) {
  const half = thickness / 2;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len, ny = dx / len; // normal

  const minX = Math.floor(Math.min(x0, x1) - half) - 1;
  const maxX = Math.ceil(Math.max(x0, x1) + half) + 1;
  const minY = Math.floor(Math.min(y0, y1) - half) - 1;
  const maxY = Math.ceil(Math.max(y0, y1) + half) + 1;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      // distance from point to segment
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (len * len)));
      const cx = x0 + t * dx, cy = y0 + t * dy;
      const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      const alpha = Math.max(0, Math.min(1, half - d + 0.5));
      if (alpha <= 0) continue;

      const existing = getPixel(fb, px, py);
      const a = alpha;
      const blended = [
        Math.round(existing[0] * (1 - a) + color[0] * a),
        Math.round(existing[1] * (1 - a) + color[1] * a),
        Math.round(existing[2] * (1 - a) + color[2] * a),
        Math.min(255, existing[3] + Math.round(color[3] * a)),
      ];
      setPixel(fb, px, py, blended);
    }
  }
}

/** Filled rectangle */
function rect(fb, rx, ry, rw, rh, color) {
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx; x < rx + rw; x++)
      setPixel(fb, x, y, color);
}

// ─── draw the icon ────────────────────────────────────────────────────────────

function drawIcon(size) {
  const fb = makeBuffer(size);
  const s = size;

  // transparent background (for areas outside rounded rect)
  fill(fb, TRANS);

  // outer rounded rect (dark bg)
  const outerR = Math.round(s * 0.17);
  roundRect(fb, 0, 0, s, s, outerR, BG);

  // inner rounded rect
  const pad = Math.round(s * 0.08);
  const innerR = Math.round(s * 0.13);
  roundRect(fb, pad, pad, s - pad * 2, s - pad * 2, innerR, INNER);

  // chevron >  (two lines meeting at a point on the right)
  // anchor points relative to size
  const thick = Math.round(s * 0.055);
  const cx = s * 0.25;   // left x of the two endpoints
  const mx = s * 0.44;   // tip x
  const ty = s * 0.41;   // top y endpoint
  const my = s * 0.50;   // mid y (tip)
  const by = s * 0.59;   // bottom y endpoint

  lineAA(fb, cx, ty, mx, my, TEAL, thick);
  lineAA(fb, cx, by, mx, my, TEAL, thick);

  // cursor bar  ▌
  const barX = Math.round(s * 0.47);
  const barY = Math.round(s * 0.45);
  const barW = Math.round(s * 0.30);
  const barH = Math.round(s * 0.10);
  const barR = Math.round(barH * 0.35);
  roundRect(fb, barX, barY, barW, barH, barR, TEAL);

  return fb;
}

// ─── PNG encoder ─────────────────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function encodePNG(fb) {
  const { buf, size } = fb;
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (size * 4 + 1) + 1 + x * 4;
      raw[dst]     = buf[src];
      raw[dst + 1] = buf[src + 1];
      raw[dst + 2] = buf[src + 2];
      raw[dst + 3] = buf[src + 3];
    }
  }

  const compressed = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── ICO encoder (single 32x32 RGBA image) ───────────────────────────────────

function encodeICO(fb32) {
  const png = encodePNG(fb32); // embed PNG inside ICO (supported since Vista)

  const headerSize = 6;
  const dirEntrySize = 16;
  const imageOffset = headerSize + dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);  // reserved
  header.writeUInt16LE(1, 2);  // type: ICO
  header.writeUInt16LE(1, 4);  // count: 1 image

  const dir = Buffer.alloc(dirEntrySize);
  dir[0] = 32;    // width  (0 = 256)
  dir[1] = 32;    // height
  dir[2] = 0;     // color count
  dir[3] = 0;     // reserved
  dir.writeUInt16LE(1, 4);   // color planes
  dir.writeUInt16LE(32, 6);  // bits per pixel
  dir.writeUInt32LE(png.length, 8);
  dir.writeUInt32LE(imageOffset, 12);

  return Buffer.concat([header, dir, png]);
}

// ─── main ─────────────────────────────────────────────────────────────────────

console.log('Generating icons...');

const fb192 = drawIcon(192);
const fb512 = drawIcon(512);
const fb32  = drawIcon(32);

writeFileSync(join(OUT, 'icon-192.png'), encodePNG(fb192));
console.log('  wrote icon-192.png');

writeFileSync(join(OUT, 'icon-512.png'), encodePNG(fb512));
console.log('  wrote icon-512.png');

writeFileSync(join(OUT, 'favicon.ico'), encodeICO(fb32));
console.log('  wrote favicon.ico');

console.log('Done.');
