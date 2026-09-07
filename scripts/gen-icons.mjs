// Generates the PWA icon set into public/icons/ with no image dependencies:
// a simple ring mark on a solid dark background, 3x supersampled for smooth
// edges. Re-run with `node scripts/gen-icons.mjs` if the mark ever changes.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BG = [17, 24, 39] // #111827  — matches manifest theme_color
const MARK = [255, 255, 255] // white ring

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Coverage in [0,1] of the ring at a pixel, via 3x3 supersampling. */
function ringCoverage(x, y, size, outer, inner) {
  const cx = size / 2
  const cy = size / 2
  let hits = 0
  for (let sx = 0; sx < 3; sx += 1) {
    for (let sy = 0; sy < 3; sy += 1) {
      const px = x + (sx + 0.5) / 3
      const py = y + (sy + 0.5) / 3
      const d = Math.hypot(px - cx, py - cy)
      if (d <= outer && d >= inner) hits += 1
    }
  }
  return hits / 9
}

function makePng(size, { outerRatio, innerRatio }) {
  const outer = size * outerRatio
  const inner = size * innerRatio
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)

  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    for (let x = 0; x < size; x += 1) {
      const cov = ringCoverage(x, y, size, outer, inner)
      const o = y * (stride + 1) + 1 + x * 4
      raw[o] = Math.round(BG[0] + (MARK[0] - BG[0]) * cov)
      raw[o + 1] = Math.round(BG[1] + (MARK[1] - BG[1]) * cov)
      raw[o + 2] = Math.round(BG[2] + (MARK[2] - BG[2]) * cov)
      raw[o + 3] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  // 10..12 = compression / filter / interlace = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })

// "any" icons: generous mark. Maskable: mark pulled inside the ~80% safe zone.
const files = [
  ['icon-192.png', makePng(192, { outerRatio: 0.4, innerRatio: 0.26 })],
  ['icon-512.png', makePng(512, { outerRatio: 0.4, innerRatio: 0.26 })],
  ['icon-maskable-512.png', makePng(512, { outerRatio: 0.32, innerRatio: 0.2 })],
]

for (const [name, buf] of files) {
  writeFileSync(join(OUT_DIR, name), buf)
  console.log(`wrote public/icons/${name} (${buf.length} bytes)`)
}
