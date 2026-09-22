export type ImageExtent = { width: number; height: number }

// A provider prices an image by its pixels, so the size a caller claims is not
// something to take on trust. Every format below states its dimensions within
// the first few bytes of a header, which is all this reads.

const png = (view: DataView, bytes: Uint8Array): ImageExtent | null => {
  if (bytes.length < 24) return null
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return null
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

// Every marker that introduces a frame, and so carries the size. The gaps are
// markers that merely look adjacent: DHT, JPG and DAC describe tables instead.
const startOfFrame = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

const jpeg = (view: DataView, bytes: Uint8Array): ImageExtent | null => {
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1] ?? 0
    // Padding before a marker, and the standalone markers that carry no segment.
    if (marker === 0xff) at += 1
    else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) at += 2
    else {
      const length = view.getUint16(at + 2)
      if (length < 2) return null
      if (startOfFrame.has(marker))
        return at + 9 <= bytes.length
          ? { height: view.getUint16(at + 5), width: view.getUint16(at + 7) }
          : null
      at += 2 + length
    }
  }
  return null
}

const webp = (view: DataView, bytes: Uint8Array): ImageExtent | null => {
  if (bytes.length < 16) return null
  if (view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57454250) return null
  const chunk = view.getUint32(12)
  // 'VP8X': an extended file states its canvas as two 24-bit values, less one.
  if (chunk === 0x56503858) {
    if (bytes.length < 30) return null
    const at = (offset: number) =>
      (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16)
    return { width: at(24) + 1, height: at(27) + 1 }
  }
  // 'VP8L': 14 bits each, less one, packed behind a one-byte signature.
  if (chunk === 0x5650384c) {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null
    const packed = view.getUint32(21, true)
    return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 }
  }
  // 'VP8 ': a lossy key frame, its size behind the three-byte start code.
  if (chunk === 0x56503820) {
    if (bytes.length < 30 || view.getUint16(23) !== 0x9d01 || bytes[25] !== 0x2a) return null
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    }
  }
  return null
}

export const imageExtent = (bytes: Uint8Array): ImageExtent | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return png(view, bytes) ?? jpeg(view, bytes) ?? webp(view, bytes)
}

// Enough of a data URL to reach a frame header past any embedded thumbnail,
// without decoding megabytes of pixels to learn how many there are.
const headerCharacters = 96 * 1024

export const dataUrlExtent = (url: string): ImageExtent | null => {
  const separator = url.indexOf(',')
  if (separator < 0 || !url.slice(0, separator).endsWith(';base64')) return null
  const head = url.slice(separator + 1, separator + 1 + headerCharacters)
  const aligned = head.slice(0, head.length - (head.length % 4))
  if (!aligned) return null
  return imageExtent(new Uint8Array(Buffer.from(aligned, 'base64')))
}
