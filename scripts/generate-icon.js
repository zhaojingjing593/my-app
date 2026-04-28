const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 256;
const CX = SIZE / 2;
const CY = SIZE / 2;
const PAD = 8;
const INNER_SIZE = SIZE - 2 * PAD;
const ICX = CX;
const ICY = CY;

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const table = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  table[i] = c;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcData = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(crcData));
  return Buffer.concat([len, t, data, c]);
}

function createPNG(width, height, getPixel) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      const i = (y * width + x) * 4;
      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
    }

  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4, dst = y * rowSize + 1 + x * 4;
      raw[dst] = pixels[src]; raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2]; raw[dst+3] = pixels[src+3];
    }
  }

  const compressed = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function getPixel(x, y) {
  const dx = x - CX, dy = y - CY;

  // Rounded rect mask
  const half = INNER_SIZE / 2, cr = 38;
  const ax = Math.abs(dx), ay = Math.abs(dy);

  let inside = false;
  if (ax <= half - cr || ay <= half - cr) {
    inside = ax <= half && ay <= half;
  } else {
    inside = Math.sqrt(Math.pow(ax - half + cr, 2) + Math.pow(ay - half + cr, 2)) <= cr;
  }
  if (!inside) return [0, 0, 0, 0];

  // Background: gradient from arXiv blue to deep purple-blue
  const t = y / SIZE;
  const bgR = Math.round(15 + t * 15);
  const bgG = Math.round(20 + t * 30);
  const bgB = Math.round(60 + t * 70);

  // arXiv "A" triangle
  const scale = 60;
  const nx = (x - ICX) / scale;
  const ny = (y - ICY + 10) / scale;

  const apexY = -1.2, baseY = 1.2;
  const crossY = 0.0;

  // Check if inside main triangle
  let inA = false;
  if (ny >= apexY && ny <= baseY) {
    const p = (ny - apexY) / (baseY - apexY);
    const hw = 0.55 * p;
    if (Math.abs(nx) <= hw) {
      inA = true;
    }
  }

  // Cut out hole (inner triangle below crossbar) to form the A shape
  if (inA && ny > crossY + 0.15 && ny < baseY - 0.05) {
    const p2 = (ny - crossY - 0.15) / (baseY - 0.2 - crossY);
    const innerHw = 0.55 * 0.35 * (1 - p2 * 0.4);
    if (Math.abs(nx) < innerHw) {
      inA = false;
    }
  }

  if (inA) {
    // arXiv orange accent for the letter
    return [255, 120, 20, 255];
  }

  return [bgR, bgG, bgB, 255];
}

const outputPath = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const png = createPNG(SIZE, SIZE, getPixel);
fs.writeFileSync(outputPath, png);
console.log(`Icon created: ${outputPath} (${png.length} bytes)`);
