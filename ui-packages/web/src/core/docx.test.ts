import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertDocxToMarkdown } from './docx'

type ImageHandler = (image: {
  contentType: string
  readAsArrayBuffer: () => Promise<ArrayBuffer>
}) => Promise<{ src: string }>

const mocks = vi.hoisted(() => ({ convertToHtml: vi.fn() }))
vi.mock('mammoth', () => ({
  default: {
    convertToHtml: mocks.convertToHtml,
    images: { imgElement: (handler: ImageHandler) => handler },
  },
}))

const respond = (html: string, messages: Array<{ message: string }> = []) => {
  mocks.convertToHtml.mockResolvedValue({ value: html, messages })
}
const convert = (options?: { images?: boolean }) =>
  convertDocxToMarkdown(new Blob(['docx fixture']), options)

beforeEach(() => {
  mocks.convertToHtml.mockReset()
})

describe('docx conversion', () => {
  it('turns a header-less Word table into a GFM table instead of dropping it', async () => {
    // Word tables rarely mark a header row, and Mammoth wraps every cell in <p>.
    respond(
      '<table><tr><td><p>指标</p></td><td><p>数值</p></td></tr>' +
        '<tr><td><p>营收</p><p>季度</p></td><td><p>120</p></td></tr></table>',
    )
    const { markdown } = await convert()
    expect(markdown).toBe('| 指标 | 数值 |\n| --- | --- |\n| 营收 季度 | 120 |')
    expect(markdown).not.toMatch(/<table|<td|<tr|<p>/)
  })

  it('marks emphasis so that it still renders inside CJK text', async () => {
    respond(`<p>包含<strong>粗体</strong>和<em>斜体</em>。</p>`)
    const { markdown } = await convert()
    expect(markdown).toBe('包含**粗体**和*斜体*。')
  })

  it('references images by name and keeps the bytes out of the Markdown', async () => {
    const readAsArrayBuffer = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer)
    mocks.convertToHtml.mockImplementation(async (_input, options) => {
      const image = await options.convertImage({ contentType: 'image/png', readAsArrayBuffer })
      return { value: `<p><img alt="示意图" src="${image.src}" /></p>`, messages: [] }
    })
    const { markdown, images } = await convert()
    expect(markdown).toBe('![示意图](docx-image-1)')
    expect(markdown).not.toContain('data:')
    expect(images.get('docx-image-1')?.type).toBe('image/png')
    expect(await images.get('docx-image-1')?.arrayBuffer()).toEqual(
      new Uint8Array([1, 2, 3]).buffer,
    )
  })

  it('skips reading image bytes when only the text is wanted', async () => {
    const readAsArrayBuffer = vi.fn()
    mocks.convertToHtml.mockImplementation(async (_input, options) => {
      await options.convertImage({ contentType: 'image/png', readAsArrayBuffer })
      return {
        value: '<p>正文</p>',
        messages: [{ message: "Unrecognised paragraph style: '标题 1'" }],
      }
    })
    const { markdown, images, warnings } = await convert({ images: false })
    expect(readAsArrayBuffer).not.toHaveBeenCalled()
    expect(images.size).toBe(0)
    expect(markdown).toBe('正文')
    expect(warnings).toEqual(["Unrecognised paragraph style: '标题 1'"])
  })
})
