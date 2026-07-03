// PWA 아이콘 생성 (도장 모양). 의존성 없이 PNG를 직접 만든다.
// 사용: node scripts/gen-icons.mjs  → public/icons/*.png
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    pixels.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG = [0xb5, 0x32, 0x28]; // --stamp-red
const FG = [0xf8, 0xf2, 0xe2]; // --paper-card

function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const ringOuter = size * 0.37;
  const ringInner = size * 0.29;
  const disc = size * 0.15;
  const soft = Math.max(1, size / 256); // 안티앨리어싱 폭

  const coverage = (d, r) => Math.max(0, Math.min(1, (r - d) / soft + 0.5));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      // 링(도장 테두리) + 가운데 원
      const a = Math.max(
        coverage(d, ringOuter) * (1 - coverage(d, ringInner)),
        coverage(d, disc)
      );
      const i = (y * size + x) * 4;
      px[i] = BG[0] + (FG[0] - BG[0]) * a;
      px[i + 1] = BG[1] + (FG[1] - BG[1]) * a;
      px[i + 2] = BG[2] + (FG[2] - BG[2]) * a;
      px[i + 3] = 255;
    }
  }
  return png(size, size, px);
}

const outDir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), makeIcon(size));
  console.log(`icon-${size}.png`);
}
