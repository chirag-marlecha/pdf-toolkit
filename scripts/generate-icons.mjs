// Generates PWA PNG icons using only Node built-ins (zlib) — no image-library dependency.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { crc32 } from 'node:zlib'

const OUT_DIR = new URL('../public/icons/', import.meta.url)
mkdirSync(OUT_DIR, { recursive: true })

function crc(buf) {
  // node:zlib exposes crc32 (added in modern Node); fall back to manual table if missing.
  if (typeof crc32 === 'function') return crc32(buf) >>> 0
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return (~c) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function setPx(rgba, w, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= w) return
  const i = (y * w + x) * 4
  rgba[i] = r
  rgba[i + 1] = g
  rgba[i + 2] = b
  rgba[i + 3] = a
}

// Draws the app glyph: rounded indigo square, white "document with folded corner",
// two accent bars representing text lines. `pad` controls how far the glyph sits
// from the edge (bigger pad = more safe-zone for maskable icons).
function drawIcon(size, { pad = 0 } = {}) {
  const w = size, h = size
  const rgba = Buffer.alloc(w * h * 4)

  const bg = [79, 70, 229] // indigo-600
  const radius = size * 0.22

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // rounded-rect mask for background
      const cx = Math.min(x, w - 1 - x)
      const cy = Math.min(y, h - 1 - y)
      let inside = true
      if (cx < radius && cy < radius) {
        const dx = radius - cx
        const dy = radius - cy
        inside = dx * dx + dy * dy <= radius * radius
      }
      const i = (y * w + x) * 4
      if (inside) {
        rgba[i] = bg[0]; rgba[i + 1] = bg[1]; rgba[i + 2] = bg[2]; rgba[i + 3] = 255
      } else {
        rgba[i] = bg[0]; rgba[i + 1] = bg[1]; rgba[i + 2] = bg[2]; rgba[i + 3] = 0
      }
    }
  }

  // document rectangle (white), centered, leaving `pad` safe zone
  const dx0 = Math.round(w * (0.30 + pad))
  const dx1 = Math.round(w * (0.70 - pad))
  const dy0 = Math.round(h * (0.20 + pad))
  const dy1 = Math.round(h * (0.80 - pad))
  const fold = Math.round((dx1 - dx0) * 0.28)

  for (let y = dy0; y < dy1; y++) {
    for (let x = dx0; x < dx1; x++) {
      // cut the folded top-right corner
      if (x > dx1 - fold && y < dy0 + fold) {
        const rel = (x - (dx1 - fold)) - (fold - (y - dy0))
        if (rel > 0) continue
      }
      setPx(rgba, w, x, y, 255, 255, 255, 255)
    }
  }
  // fold triangle shading
  for (let y = dy0; y < dy0 + fold; y++) {
    for (let x = dx1 - fold; x < dx1; x++) {
      const rel = (x - (dx1 - fold)) - (fold - (y - dy0))
      if (rel > 0 && rel < fold) setPx(rgba, w, x, y, 199, 197, 255, 255)
    }
  }

  // accent lines (indigo bars) representing text content
  const lineColor = [99, 91, 235]
  const lx0 = dx0 + Math.round((dx1 - dx0) * 0.16)
  const lx1 = dx1 - Math.round((dx1 - dx0) * 0.16)
  const lineH = Math.max(2, Math.round(h * 0.035))
  const gaps = [0.42, 0.55, 0.68]
  for (const g of gaps) {
    const ly0 = dy0 + Math.round((dy1 - dy0) * g)
    const width = g === 0.68 ? Math.round((lx1 - lx0) * 0.6) : (lx1 - lx0)
    for (let y = ly0; y < ly0 + lineH; y++) {
      for (let x = lx0; x < lx0 + width; x++) {
        setPx(rgba, w, x, y, lineColor[0], lineColor[1], lineColor[2], 255)
      }
    }
  }

  return encodePNG(w, h, rgba)
}

writeFileSync(new URL('icon-192.png', OUT_DIR), drawIcon(192))
writeFileSync(new URL('icon-512.png', OUT_DIR), drawIcon(512))
writeFileSync(new URL('icon-512-maskable.png', OUT_DIR), drawIcon(512, { pad: 0.08 }))
writeFileSync(new URL('apple-touch-icon.png', OUT_DIR), drawIcon(180))

console.log('Icons generated in public/icons/')
