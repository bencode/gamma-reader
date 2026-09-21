export type DocxConversion = {
  markdown: string
  images: Map<string, Blob>
  warnings: readonly string[]
}

export type DocxConversionOptions = {
  // Reading the image bytes is wasted work when only the text is wanted.
  images?: boolean
}

const imageReference = (index: number) => `docx-image-${index}`

const withinTableCell = (node: Node) => {
  for (let parent = node.parentNode; parent; parent = parent.parentNode)
    if (parent.nodeName === 'TD' || parent.nodeName === 'TH') return true
  return false
}

// Mammoth wraps cell content in <p>, but a Markdown table row has to stay on one line.
const flattenTableCells = (root: Document) => {
  for (const cell of root.querySelectorAll('td, th')) {
    const paragraphs = [...cell.children].filter(child => child.tagName === 'P')
    if (!paragraphs.length || paragraphs.length !== cell.children.length) continue
    paragraphs.forEach((paragraph, index) => {
      if (index > 0) cell.insertBefore(root.createElement('br'), paragraph)
      paragraph.replaceWith(...paragraph.childNodes)
    })
  }
}

// The GFM table rule only fires when the first row is all <th>, which Word rarely marks.
// Without this the table survives as raw HTML, which the reader drops entirely.
const promoteHeaderRow = (root: Document) => {
  for (const table of root.querySelectorAll('table')) {
    if (table.querySelector('th')) continue
    const row = table.querySelector('tr')
    if (!row) continue
    for (const cell of [...row.children]) {
      if (cell.tagName !== 'TD') continue
      const heading = root.createElement('th')
      heading.append(...cell.childNodes)
      for (const attribute of cell.attributes) heading.setAttribute(attribute.name, attribute.value)
      cell.replaceWith(heading)
    }
  }
}

export const convertDocxToMarkdown = async (
  blob: Blob,
  { images: withImages = true }: DocxConversionOptions = {},
): Promise<DocxConversion> => {
  const [{ default: mammoth }, { default: TurndownService }, { gfm }] = await Promise.all([
    import('mammoth'),
    import('turndown'),
    import('turndown-plugin-gfm'),
  ])

  const images = new Map<string, Blob>()
  const { value, messages } = await mammoth.convertToHtml(
    { arrayBuffer: await blob.arrayBuffer() },
    {
      convertImage: mammoth.images.imgElement(async image => {
        if (!withImages) return { src: '' }
        const reference = imageReference(images.size + 1)
        images.set(
          reference,
          new Blob([await image.readAsArrayBuffer()], { type: image.contentType }),
        )
        return { src: reference }
      }),
    },
  )

  const parsed = new DOMParser().parseFromString(value, 'text/html')
  flattenTableCells(parsed)
  promoteHeaderRow(parsed)

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    // CommonMark ignores underscore emphasis between letters, and CJK text is all letters.
    emDelimiter: '*',
  })
  turndown.use(gfm)
  turndown.addRule('tableCellLineBreak', {
    filter: node => node.nodeName === 'BR' && withinTableCell(node),
    replacement: () => ' ',
  })

  return {
    markdown: turndown.turndown(parsed.body),
    images,
    warnings: messages.map(message => message.message),
  }
}
