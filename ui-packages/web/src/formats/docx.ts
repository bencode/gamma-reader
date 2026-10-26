export type DocxMessage = { type: 'warning' | 'error'; message: string }

export type DocxConversion = {
  markdown: string
  images: Map<string, Blob>
  messages: readonly DocxMessage[]
}

// Mammoth reports what it could not convert; every reader surfaces it the same way.
export const reportDocxMessages = (name: string, messages: readonly DocxMessage[]) => {
  const of = (type: DocxMessage['type']) =>
    messages.filter(message => message.type === type).map(message => message.message)
  const failures = of('error')
  const skipped = of('warning')
  if (failures.length) console.error(`Unreadable content in ${name}`, failures)
  if (skipped.length) console.warn(`Unconverted content in ${name}`, skipped)
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
// The <br> marks the paragraph boundary; the tableCellLineBreak rule below collapses it,
// along with any line break the author typed, into a space.
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

const takeSpan = (cell: Element, name: 'colspan' | 'rowspan') => {
  const span = Number(cell.getAttribute(name))
  cell.removeAttribute(name)
  return Number.isInteger(span) && span > 1 ? span : 1
}

// GFM tables cannot merge cells, and the reader cuts every row to the width of its header, so a
// merged cell would push the cells after it under the wrong heading. Each position a merged cell
// covers gets an empty cell of its own, leaving the value once, where Word shows it.
const expandMergedCells = (root: Document) => {
  for (const table of root.querySelectorAll('table')) {
    for (const cell of table.querySelectorAll('td[colspan], th[colspan]')) {
      const columns = takeSpan(cell, 'colspan')
      const rows = cell.getAttribute('rowspan')
      const fillers = Array.from({ length: columns - 1 }, () => {
        const filler = root.createElement(cell.tagName)
        if (rows) filler.setAttribute('rowspan', rows)
        return filler
      })
      cell.after(...fillers)
    }
    // How many more rows each column is still covered by a cell from a row above.
    const covered = new Map<number, number>()
    for (const row of table.rows) {
      let column = 0
      const fillCovered = (before: Element | null) => {
        for (let left = covered.get(column) ?? 0; left > 0; left = covered.get(column) ?? 0) {
          covered.set(column, left - 1)
          row.insertBefore(root.createElement('td'), before)
          column++
        }
      }
      for (const cell of [...row.cells]) {
        fillCovered(cell)
        const rows = takeSpan(cell, 'rowspan')
        if (rows > 1) covered.set(column, rows - 1)
        column++
      }
      fillCovered(null)
    }
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

// Turndown drops the ids these anchors point at, which would leave links that go nowhere:
// a reference keeps its number as text, and the back link to it has nothing left to say.
// Numbers move from [1] to (1) because escaped square brackets render as display math.
const commentNumber = (text: string) => text.replace(/\[(\d+)\]/, '($1)')

const unlinkComments = (root: Document) => {
  for (const back of root.querySelectorAll('a[href^="#comment-ref-"]')) back.remove()
  for (const link of root.querySelectorAll('a[href^="#comment-"]'))
    link.replaceWith(commentNumber(link.textContent ?? ''))
  for (const term of root.querySelectorAll('dt[id^="comment-"]'))
    term.textContent = commentNumber(term.textContent ?? '')
}

// Footnotes and endnotes lose their ids the same way, but GFM has footnotes of its own, which the
// reader links both ways. The noteReference and note rules below write them; Mammoth's back links go.
const noteId = /^(?:foot|end)note-\d+$/

const unlinkNoteBackLinks = (root: Document) => {
  for (const back of root.querySelectorAll('a[href^="#footnote-ref-"], a[href^="#endnote-ref-"]'))
    back.remove()
}

export const convertDocxToMarkdown = async (
  blob: Blob,
  { images: withImages = true }: DocxConversionOptions = {},
): Promise<DocxConversion> => {
  const [{ default: mammoth }, { default: TurndownService }, { gfm }, { markUnconvertedContent }] =
    await Promise.all([
      import('mammoth'),
      import('turndown'),
      import('turndown-plugin-gfm'),
      import('./docx-unconverted'),
    ])

  const images = new Map<string, Blob>()
  const { value, messages } = await mammoth.convertToHtml(
    { arrayBuffer: await markUnconvertedContent(await blob.arrayBuffer()) },
    {
      // A manual page break is the author separating sections; Mammoth drops it otherwise.
      // Comments are dropped unless their references are mapped; Mammoth then lists them at the end.
      // These are added to the default style map, not a replacement for it.
      styleMap: ["br[type='page'] => hr", 'comment-reference => sup'],
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
  expandMergedCells(parsed)
  flattenTableCells(parsed)
  promoteHeaderRow(parsed)
  unlinkComments(parsed)
  unlinkNoteBackLinks(parsed)

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
  // Written as rules because turndown escapes square brackets in text.
  turndown.addRule('noteReference', {
    filter: node => node.nodeName === 'A' && noteId.test(node.getAttribute('href')?.slice(1) ?? ''),
    replacement: (_content, node) => `[^${node.getAttribute('href')?.slice(1)}]`,
  })
  turndown.addRule('note', {
    filter: node => node.nodeName === 'LI' && noteId.test(node.id),
    // A note's later paragraphs stay in it by being indented.
    replacement: (content, node) =>
      `\n\n[^${node.id}]: ${content.trim().replace(/\n/g, '\n    ')}\n\n`,
  })

  return {
    markdown: turndown.turndown(parsed.body),
    images,
    messages: messages.map(({ type, message }) => ({ type, message })),
  }
}
