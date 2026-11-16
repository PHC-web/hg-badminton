/** 本地模拟用的滑块图。正式环境由云函数生成，这里不依赖 zlib。 */

export const SLIDER_WIDTH = 300
export const SLIDER_HEIGHT = 156
export const SLIDER_PIECE = 56
export const SLIDER_TOLERANCE = 20
const THEMES = [
  'court', 'dusk', 'night', 'garden', 'sea', 'mosaic',
  'snow', 'city', 'desert', 'forest', 'rain', 'aurora',
  'lantern', 'lake', 'blossom', 'field', 'reef', 'cabin',
  'stalls', 'kites'
]

function crcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const CRC = crcTable()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u32(n) {
  const b = new Uint8Array(4)
  const v = n >>> 0
  b[0] = (v >>> 24) & 255
  b[1] = (v >>> 16) & 255
  b[2] = (v >>> 8) & 255
  b[3] = v & 255
  return b
}

function concat(parts) {
  const n = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(n)
  let o = 0
  parts.forEach((p) => {
    out.set(p, o)
    o += p.length
  })
  return out
}

function chunk(type, data) {
  return concat([u32(data.length), new Uint8Array([...type].map((ch) => ch.charCodeAt(0))), data, u32(crc32(concat([new Uint8Array([...type].map((ch) => ch.charCodeAt(0))), data])))])
}

function adler32(data) {
  let a = 1
  let b = 0
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function storedZlib(data) {
  const parts = [new Uint8Array([0x78, 0x01])]
  let off = 0
  while (off < data.length) {
    const len = Math.min(65535, data.length - off)
    const last = off + len >= data.length
    const header = new Uint8Array(5)
    header[0] = last ? 1 : 0
    header[1] = len & 255
    header[2] = (len >> 8) & 255
    const nlen = len ^ 0xffff
    header[3] = nlen & 255
    header[4] = (nlen >> 8) & 255
    parts.push(header, data.subarray(off, off + len))
    off += len
  }
  const sum = adler32(data)
  parts.push(u32(sum))
  return concat(parts)
}

function mix(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k)
  ]
}

function hash(x, y, s) {
  let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function scene(theme, x, y, w, h) {
  const nx = x / w
  const ny = y / h
  if (theme === 'court') {
    let c = mix([18, 122, 68], [92, 196, 112], ny)
    const L = w * 0.1
    const R = w * 0.9
    const T = h * 0.16
    const B = h * 0.84
    const mid = (T + B) / 2
    const on = (v) => Math.abs(v) < 1.3
    if (x > L && x < R && y > T && y < B && (on(y - T) || on(y - B) || on(x - L) || on(x - R) || on(y - mid) || on(x - w / 2))) {
      c = [248, 252, 246]
    }
    ;[[0.28, 0.34], [0.66, 0.58], [0.42, 0.72]].forEach(([bx, by]) => {
      const d = Math.hypot(x - bx * w, y - by * h)
      if (d < 4.2) c = [255, 208, 74]
      else if (d < 7.2) c = [255, 248, 230]
    })
    return c
  }
  if (theme === 'dusk') {
    let c = mix([255, 176, 92], [92, 54, 148], ny)
    const sun = Math.hypot(x - w * 0.22, y - h * 0.34)
    if (sun < 16) c = [255, 244, 196]
    else if (sun < 26) c = mix(c, [255, 220, 150], 1 - (sun - 16) / 10)
    const hill = h * 0.7 + Math.sin(nx * 7) * 8 + Math.sin(nx * 17) * 3
    if (y > hill) c = mix([62, 36, 84], [28, 22, 48], (y - hill) / (h * 0.3))
    return c
  }
  if (theme === 'night') {
    let c = mix([10, 22, 58], [28, 64, 120], ny)
    const moon = Math.hypot(x - w * 0.78, y - h * 0.28)
    if (moon < 11) c = [244, 246, 232]
    else if (moon < 18) c = mix(c, [180, 198, 220], 0.45)
    if (hash(x, y, 3) > 0.985) c = [255, 255, 240]
    const win = hash(Math.floor(x / 14), Math.floor(y / 10), 9)
    if (ny > 0.55 && win > 0.82 && (x % 14) > 3 && (x % 14) < 8 && (y % 10) > 2 && (y % 10) < 7) {
      c = win > 0.93 ? [255, 214, 120] : [72, 96, 128]
    }
    return c
  }
  if (theme === 'garden') {
    let c = mix([214, 236, 196], [78, 168, 126], ny)
    for (let i = 0; i < 7; i++) {
      const fx = (0.12 + hash(i, 1, 4) * 0.76) * w
      const fy = (0.2 + hash(i, 2, 4) * 0.62) * h
      const petal = hash(i, 3, 4)
      const color = petal > 0.66 ? [232, 96, 122] : petal > 0.33 ? [255, 176, 72] : [255, 244, 250]
      for (let p = 0; p < 5; p++) {
        const ang = (p / 5) * Math.PI * 2
        const d = Math.hypot(x - (fx + Math.cos(ang) * 6), y - (fy + Math.sin(ang) * 6))
        if (d < 5.5) c = color
      }
      if (Math.hypot(x - fx, y - fy) < 3.2) c = [255, 214, 86]
    }
    return c
  }
  if (theme === 'sea') {
    let c = mix([126, 206, 232], [12, 92, 140], ny)
    const wave = Math.sin(nx * 10 + ny * 2) * 6
    if (Math.abs(y - (h * 0.42 + wave)) < 2.2) c = [236, 248, 252]
    if (Math.abs(y - (h * 0.62 + Math.sin(nx * 8) * 5)) < 1.8) c = mix(c, [220, 244, 248], 0.7)
    if (Math.hypot(x - w * 0.7, y - h * 0.26) < 12) c = [255, 236, 170]
    return c
  }
  if (theme === 'snow') {
    let c = mix([186, 214, 236], [232, 240, 246], ny)
    const ground = h * 0.72
    if (y > ground) c = mix([246, 250, 252], [214, 226, 234], (y - ground) / (h * 0.28))
    ;[[0.16, 0.72, 34], [0.38, 0.72, 46], [0.64, 0.72, 30], [0.84, 0.72, 26]].forEach(([tx, ty, th]) => {
      const base = ty * h
      const top = base - th
      const rel = (y - top) / th
      if (y >= top && y <= base && Math.abs(x - tx * w) < th * 0.46 * rel) c = [28, 86, 62]
    })
    if (hash(Math.floor(x / 3), Math.floor(y / 3), 11) > 0.972 && y < ground) c = [255, 255, 255]
    return c
  }
  if (theme === 'city') {
    let c = mix([255, 168, 96], [58, 78, 138], ny)
    const heights = [0.4, 0.56, 0.34, 0.64, 0.46, 0.72, 0.4, 0.58, 0.36, 0.5]
    const bw = w / heights.length
    const i = Math.min(heights.length - 1, Math.floor(x / bw))
    const top = h * (1 - heights[i])
    if (y > top) {
      c = i % 2 ? [36, 46, 72] : [54, 64, 92]
      const wx = x % bw
      const wy = y - top
      if (wx > 5 && wx < bw - 5 && wy > 8 && Math.floor(wx / 8) % 2 === 0 && Math.floor(wy / 10) % 2 === 0 && hash(i, Math.floor(wy / 10), 2) > 0.28) {
        c = [255, 214, 120]
      }
    }
    return c
  }
  if (theme === 'desert') {
    let c = mix([255, 220, 160], [255, 168, 96], ny)
    if (Math.hypot(x - w * 0.78, y - h * 0.26) < 14) c = [255, 246, 214]
    const dune1 = h * 0.56 + Math.sin(nx * 4) * 10
    const dune2 = h * 0.74 + Math.sin(nx * 6 + 1.2) * 8
    if (y > dune2) c = mix([206, 140, 68], [168, 104, 46], (y - dune2) / (h * 0.28))
    else if (y > dune1) c = mix([236, 186, 108], [206, 144, 70], (y - dune1) / 36)
    const cx = w * 0.24
    if (Math.abs(x - cx) < 3.2 && y > h * 0.4 && y < h * 0.66) c = [42, 118, 70]
    if (Math.abs(y - h * 0.48) < 2.6 && x > cx - 2 && x < cx + 16) c = [42, 118, 70]
    if (Math.abs(x - (cx + 14)) < 2.6 && y > h * 0.44 && y < h * 0.52) c = [42, 118, 70]
    return c
  }
  if (theme === 'forest') {
    let c = mix([168, 214, 232], [126, 184, 146], ny)
    if (y > h * 0.8) c = [42, 96, 54]
    ;[[0.1, 26], [0.26, 40], [0.44, 30], [0.6, 48], [0.76, 28], [0.9, 36]].forEach(([tx, th], i) => {
      const base = h * 0.82
      const top = base - th * 1.7
      const rel = (y - top) / (base - top)
      if (y >= top && y <= base && Math.abs(x - tx * w) <= th * 0.72 * Math.max(0, rel)) {
        c = i % 2 ? [24, 88, 54] : [16, 68, 44]
      }
    })
    return c
  }
  if (theme === 'rain') {
    let c = mix([176, 190, 204], [96, 114, 132], ny)
    ;[[0.2, 0.22, 26], [0.3, 0.28, 16], [0.72, 0.16, 20]].forEach(([cx, cy, r]) => {
      if (Math.hypot(x - cx * w, y - cy * h) < r) c = [220, 226, 232]
    })
    const ux = w * 0.62
    const uy = h * 0.46
    if (y <= uy && y > uy - 24 && (x - ux) ** 2 / 784 + (y - uy) ** 2 / 280 < 1) c = [196, 64, 72]
    if (Math.abs(x - ux) < 1.6 && y >= uy - 2 && y < uy + 30) c = [64, 58, 66]
    if (y > h * 0.78) c = mix([58, 74, 92], [40, 52, 68], (y - h * 0.78) / (h * 0.22))
    if (hash(Math.floor(x / 8), Math.floor(y / 12), 4) > 0.7 && (y % 12) < 4 && (x % 8) < 1.5 && y < h * 0.76) {
      c = mix(c, [232, 238, 244], 0.85)
    }
    return c
  }
  if (theme === 'aurora') {
    let c = mix([8, 16, 42], [22, 40, 78], ny)
    if (hash(x, y, 5) > 0.988) c = [236, 242, 255]
    if (Math.abs(ny - 0.36 - Math.sin(nx * 8) * 0.07) < 0.05) c = mix(c, [64, 220, 156], 0.9)
    if (Math.abs(ny - 0.5 - Math.sin(nx * 5 + 1) * 0.06) < 0.04) c = mix(c, [132, 92, 220], 0.8)
    if (y > h * 0.84) c = [14, 26, 34]
    return c
  }
  if (theme === 'lantern') {
    let c = mix([42, 16, 32], [96, 28, 44], ny)
    ;[[0.16, 0.4], [0.38, 0.28], [0.6, 0.44], [0.82, 0.32]].forEach(([lx, ly]) => {
      const dx = (x - lx * w) / 12
      const dy = (y - ly * h) / 16
      if (dx * dx + dy * dy < 1) c = Math.abs(dy) < 0.16 ? [214, 170, 74] : [214, 46, 52]
      if (Math.abs(x - lx * w) < 8 && Math.abs(y - (ly * h - 18)) < 2.2) c = [214, 170, 74]
      if (Math.abs(x - lx * w) < 1.2 && y < ly * h - 10 && y > ly * h - 30) c = [176, 136, 68]
      if (Math.abs(x - lx * w) < 1.3 && y > ly * h + 14 && y < ly * h + 26) c = [214, 170, 74]
    })
    return c
  }
  if (theme === 'lake') {
    let c = mix([186, 220, 242], [232, 240, 246], ny)
    const ridge = h * 0.42 + Math.sin(nx * 5.5) * 14 + Math.sin(nx * 14) * 5
    if (y > ridge && y < h * 0.58) c = [58, 82, 108]
    if (y >= h * 0.58) {
      c = mix([36, 104, 148], [16, 58, 96], (y - h * 0.58) / (h * 0.42))
      if (Math.abs(y - (h * 0.74 + Math.sin(nx * 9) * 4)) < 1.6) c = mix(c, [210, 232, 240], 0.65)
    }
    return c
  }
  if (theme === 'blossom') {
    let c = mix([255, 232, 238], [255, 176, 198], ny)
    if (Math.abs(y - (h * 0.38 + Math.sin(nx * 3.2) * 10)) < 2.4 && nx > 0.04 && nx < 0.92) c = [96, 58, 54]
    for (let i = 0; i < 16; i++) {
      const px = hash(i, 1, 8) * w
      const py = (0.12 + hash(i, 2, 8) * 0.76) * h
      if (Math.hypot(x - px, y - py) < 5.2) c = hash(i, 3, 8) > 0.5 ? [236, 112, 148] : [255, 246, 248]
    }
    return c
  }
  if (theme === 'field') {
    let c = mix([120, 190, 236], [190, 222, 244], ny)
    if (Math.hypot(x - w * 0.78, y - h * 0.26) < 13) c = [255, 236, 164]
    if (y > h * 0.48) {
      c = mix([214, 176, 62], [168, 122, 40], (y - h * 0.48) / (h * 0.52))
      const sway = Math.sin(Math.floor(x / 7) * 0.8) * 3
      if ((x + sway) % 7 < 1.5 && y > h * 0.52) c = mix(c, [246, 220, 112], 0.75)
    }
    return c
  }
  if (theme === 'reef') {
    let c = mix([28, 150, 168], [8, 58, 108], ny)
    ;[[0.18, 0.28, 7], [0.52, 0.2, 5], [0.74, 0.36, 6]].forEach(([bx, by, r]) => {
      const d = Math.hypot(x - bx * w, y - by * h)
      if (d < r && d > r - 1.7) c = [214, 244, 246]
    })
    ;[[0.34, 0.5], [0.66, 0.64]].forEach(([fx, fy], i) => {
      const dx = (x - fx * w) / 16
      const dy = (y - fy * h) / 7
      if (dx * dx + dy * dy < 1) c = i ? [255, 176, 72] : [255, 112, 92]
    })
    if (y > h * 0.78) c = mix([176, 64, 92], [64, 36, 84], nx)
    return c
  }
  if (theme === 'cabin') {
    let c = mix([176, 210, 236], [228, 236, 244], ny)
    const ridge = h * 0.7 - Math.abs(nx - 0.42) * h * 0.85
    if (y > ridge) c = [236, 242, 246]
    const hx = w * 0.68
    const hy = h * 0.74
    if (y > hy - 34 && y < hy - 14 && Math.abs(x - hx) < (hy - 14 - y) * 1.05) c = [92, 46, 40]
    if (y > hy - 18 && y < hy + 18 && x > hx - 20 && x < hx + 20) c = [168, 102, 68]
    if (Math.abs(x - hx) < 5 && y > hy && y < hy + 18) c = [72, 46, 36]
    if (Math.abs(x - (hx - 10)) < 3.2 && Math.abs(y - (hy - 2)) < 3.2) c = [255, 214, 120]
    return c
  }
  if (theme === 'stalls') {
    let c = mix([255, 236, 214], [255, 196, 148], ny)
    if (y > h * 0.74) c = [116, 82, 60]
    const colors = [[214, 58, 68], [236, 168, 42], [52, 132, 196], [58, 158, 108], [156, 78, 168]]
    const bw = w / colors.length
    const i = Math.min(colors.length - 1, Math.floor(x / bw))
    const mid = i * bw + bw / 2
    const roofTop = h * 0.26
    const roofBot = h * 0.46
    if (y >= roofTop && y <= roofBot && Math.abs(x - mid) < bw * 0.4 * ((y - roofTop) / (roofBot - roofTop))) c = colors[i]
    if (y > roofBot && y < h * 0.74 && Math.abs(x - mid) < bw * 0.26) c = mix(colors[i], [255, 248, 236], 0.5)
    return c
  }
  if (theme === 'kites') {
    let c = mix([142, 202, 240], [214, 232, 248], ny)
    ;[[0.18, 0.28, 20], [0.26, 0.34, 14], [0.58, 0.22, 16]].forEach(([cx, cy, r]) => {
      if (Math.hypot(x - cx * w, y - cy * h) < r) c = [255, 255, 255]
    })
    ;[[0.42, 0.58, [226, 68, 80]], [0.74, 0.46, [52, 132, 214]]].forEach(([kx, ky, color]) => {
      const dx = Math.abs(x - kx * w) / 13
      const dy = Math.abs(y - ky * h) / 17
      if (dx + dy < 1) c = color
      const tailX = kx * w + Math.sin((y - ky * h) * 0.35) * 5
      if (y > ky * h + 8 && y < ky * h + 34 && Math.abs(x - tailX) < 1.4) c = color
    })
    return c
  }
  let c = [244, 239, 230]
  ;[[0.22, 0.4, 34, [0, 122, 184]], [0.62, 0.32, 28, [232, 112, 74]], [0.48, 0.68, 30, [242, 184, 64]], [0.78, 0.7, 22, [64, 168, 132]]].forEach(([bx, by, rad, color]) => {
    const d = Math.hypot(x - bx * w, y - by * h)
    if (d < rad) c = mix(c, color, 0.55 + 0.35 * (1 - d / rad))
  })
  return c
}

function inPiece(lx, ly) {
  const cx = SLIDER_PIECE * 0.42
  const cy = SLIDER_PIECE * 0.5
  const hw = SLIDER_PIECE * 0.3
  const hh = SLIDER_PIECE * 0.32
  const dx = Math.abs(lx - cx)
  const dy = Math.abs(ly - cy)
  const rad = 7
  let body = false
  if (dx <= hw && dy <= hh) {
    const ox = Math.max(0, dx - (hw - rad))
    const oy = Math.max(0, dy - (hh - rad))
    body = ox * ox + oy * oy <= rad * rad
  }
  const knob = (lx - (cx + hw)) ** 2 + (ly - cy) ** 2 <= (SLIDER_PIECE * 0.15) ** 2
  const notch = (lx - cx) ** 2 + (ly - (cy - hh)) ** 2 <= (SLIDER_PIECE * 0.11) ** 2
  if (notch && ly <= cy) return false
  return body || knob
}

function blank(width, height) {
  return new Uint8Array((width * 4 + 1) * height)
}

function paintPair(targetX, theme) {
  const holeY = Math.round((SLIDER_HEIGHT - SLIDER_PIECE) / 2)
  const board = blank(SLIDER_WIDTH, SLIDER_HEIGHT)
  const piece = blank(SLIDER_PIECE, SLIDER_PIECE)
  for (let y = 0; y < SLIDER_HEIGHT; y++) {
    const row = y * (SLIDER_WIDTH * 4 + 1)
    for (let x = 0; x < SLIDER_WIDTH; x++) {
      const lx = x - targetX
      const ly = y - holeY
      const inside = inPiece(lx, ly)
      const edge = inside && (!inPiece(lx - 1, ly) || !inPiece(lx + 1, ly) || !inPiece(lx, ly - 1) || !inPiece(lx, ly + 1))
      const shadow = !inside && inPiece(lx - 2, ly - 2)
      let c = scene(theme, x, y, SLIDER_WIDTH, SLIDER_HEIGHT)
      if (inside) c = edge ? [255, 255, 255] : mix(c, [20, 32, 48], 0.62)
      else if (shadow) c = mix(c, [20, 24, 32], 0.28)
      const i = row + 1 + x * 4
      board[i] = c[0]
      board[i + 1] = c[1]
      board[i + 2] = c[2]
      board[i + 3] = 255
    }
  }
  for (let y = 0; y < SLIDER_PIECE; y++) {
    const row = y * (SLIDER_PIECE * 4 + 1)
    for (let x = 0; x < SLIDER_PIECE; x++) {
      const inside = inPiece(x, y)
      const edge = inside && (!inPiece(x - 1, y) || !inPiece(x + 1, y) || !inPiece(x, y - 1) || !inPiece(x, y + 1))
      const c = inside ? (edge ? [255, 255, 255] : scene(theme, targetX + x, holeY + y, SLIDER_WIDTH, SLIDER_HEIGHT)) : [0, 0, 0]
      const i = row + 1 + x * 4
      piece[i] = c[0]
      piece[i + 1] = c[1]
      piece[i + 2] = c[2]
      piece[i + 3] = inside ? 255 : 0
    }
  }
  return { board, piece }
}

function toBase64(bytes) {
  if (typeof uni !== 'undefined' && uni.arrayBufferToBase64) {
    return uni.arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  }
  let s = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return btoa(s)
}

function encode(raw, width, height) {
  const ihdr = new Uint8Array(13)
  ihdr.set(u32(width), 0)
  ihdr.set(u32(height), 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const png = concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', storedZlib(raw)),
    chunk('IEND', new Uint8Array(0))
  ])
  return `data:image/png;base64,${toBase64(png)}`
}

export function randomTargetX() {
  const min = 78
  const max = SLIDER_WIDTH - SLIDER_PIECE - 12
  return min + Math.floor(Math.random() * (max - min + 1))
}

export function renderSlider(targetX, theme) {
  const name = THEMES.includes(theme) ? theme : THEMES[Math.floor(Math.random() * THEMES.length)]
  const { board, piece } = paintPair(targetX, name)
  return {
    image: encode(board, SLIDER_WIDTH, SLIDER_HEIGHT),
    pieceImage: encode(piece, SLIDER_PIECE, SLIDER_PIECE),
    theme: name
  }
}

export function sliderMatches(targetX, sliderX) {
  const x = Number(sliderX)
  return Number.isFinite(x) && Math.abs(x - Number(targetX)) <= SLIDER_TOLERANCE
}
