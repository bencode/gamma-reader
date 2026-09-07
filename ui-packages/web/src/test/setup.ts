import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

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

afterEach(() => {
  cleanup()
  window.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
  localStorage.clear()
})
