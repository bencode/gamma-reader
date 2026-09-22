import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { deleteFileStore } from '../data/file-store'

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

// fake-indexeddb delegates cloning to Node, which only preserves Node's Blob implementation.
vi.stubGlobal('Blob', NodeBlob)
vi.stubGlobal('File', NodeFile)

// That Blob also returns an ArrayBuffer belonging to Node rather than to jsdom, and a library
// that gates on `instanceof ArrayBuffer` then refuses it — JSZip, inside Mammoth, does exactly
// that. Copying the bytes into this realm lets a document parse here as it does in a browser.
const nodeArrayBuffer = NodeBlob.prototype.arrayBuffer
NodeBlob.prototype.arrayBuffer = async function arrayBuffer(this: Blob) {
  const source = new Uint8Array(await nodeArrayBuffer.call(this))
  const bytes = new Uint8Array(source.byteLength)
  bytes.set(source)
  return bytes.buffer as ArrayBuffer
}

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
)

// jsdom has no visual geometry or native modal implementation.
Object.defineProperties(HTMLElement.prototype, {
  offsetLeft: {
    configurable: true,
    get: function (this: HTMLElement) {
      const siblings = this.parentElement?.children
      return siblings ? Array.from(siblings).indexOf(this) : 0
    },
  },
  offsetWidth: { configurable: true, get: () => 500 },
  offsetHeight: { configurable: true, get: () => 900 },
})
HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(100, 100, 500, 900)
Range.prototype.getBoundingClientRect = () => new DOMRect(100, 100, 160, 24)
HTMLDialogElement.prototype.showModal = function () {
  this.open = true
}
HTMLDialogElement.prototype.close = function () {
  this.open = false
}
URL.createObjectURL = vi.fn(() => 'blob:gamma-reader-preview')
URL.revokeObjectURL = vi.fn()

afterEach(async () => {
  cleanup()
  window.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
  localStorage.clear()
  await deleteFileStore()
})

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (String(input) === '/api/agent/config') return Response.json({ enabled: false })
    throw new Error(`Unexpected network request in test: ${String(input)}`)
  })
})
