const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[(w * 4 + 1) * y] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y)
      const i = (w * 4 + 1) * y + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

function inPoly(x, y, pts) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0]
    const yi = pts[i][1]
    const xj = pts[j][0]
    const yj = pts[j][1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

function circle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function rect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1
}

const shapes = {
  home: (x, y) =>
    inPoly(x, y, [
      [40, 14],
      [66, 36],
      [58, 36],
      [58, 66],
      [48, 66],
      [48, 48],
      [32, 48],
      [32, 66],
      [22, 66],
      [22, 36],
      [14, 36]
    ]),
  fixture: (x, y) => circle(x, y, 40, 40, 26) && !circle(x, y, 40, 40, 18) || rect(x, y, 37, 22, 43, 58) || rect(x, y, 22, 37, 58, 43),
  result: (x, y) =>
    circle(x, y, 40, 28, 16) ||
    rect(x, y, 28, 40, 52, 48) ||
    rect(x, y, 36, 48, 44, 62) ||
    rect(x, y, 28, 62, 52, 68),
  mine: (x, y) => circle(x, y, 40, 28, 12) || inPoly(x, y, [
    [18, 68],
    [24, 48],
    [56, 48],
    [62, 68]
  ])
}

const dir = path.join(__dirname, '../src/static/tab')
fs.mkdirSync(dir, { recursive: true })
const gray = [154, 161, 169, 255]
const green = [0, 168, 112, 255]
const none = [0, 0, 0, 0]

for (const [name, hit] of Object.entries(shapes)) {
  for (const [suffix, color] of [
    ['', gray],
    ['-active', green]
  ]) {
    const buf = png(81, 81, (x, y) => (hit(x, y) ? color : none))
    fs.writeFileSync(path.join(dir, `${name}${suffix}.png`), buf)
  }
}
console.log('tab icons generated')
