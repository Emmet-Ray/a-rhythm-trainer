import { crc32, deflateSync } from "node:zlib";
import { TRANSPARENT } from "../core/color.ts";
import type { Img } from "../core/image.ts";

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG bytes: indexed (with tRNS) when the image has <= 256 colors, RGBA otherwise. */
export function encodePng(img: Img): Buffer {
  const { w, h, data } = img;
  const index = new Map<number, number>();
  for (let i = 0; i < data.length && index.size <= 256; i++) if (!index.has(data[i])) index.set(data[i], index.size);
  const indexed = index.size <= 256;

  const rowLen = indexed ? w + 1 : w * 4 + 1;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    let o = y * rowLen + 1; // filter byte 0
    for (let x = 0; x < w; x++) {
      const c = data[y * w + x];
      if (indexed) raw[o++] = index.get(c)!;
      else { raw[o++] = c >>> 24; raw[o++] = (c >>> 16) & 255; raw[o++] = (c >>> 8) & 255; raw[o++] = c & 255; }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = indexed ? 3 : 6;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  if (indexed) {
    const colors = [...index.keys()];
    const plte = Buffer.alloc(colors.length * 3), trns = Buffer.alloc(colors.length);
    let lastAlpha = -1;
    colors.forEach((c, i) => {
      plte[i * 3] = c >>> 24; plte[i * 3 + 1] = (c >>> 16) & 255; plte[i * 3 + 2] = (c >>> 8) & 255;
      trns[i] = c === TRANSPARENT ? 0 : c & 255;
      if (trns[i] !== 255) lastAlpha = i;
    });
    parts.push(chunk("PLTE", plte));
    if (lastAlpha >= 0) parts.push(chunk("tRNS", trns.subarray(0, lastAlpha + 1)));
  }
  parts.push(chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}
