import JSZip from 'jszip'

const namespaces = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  dgm: 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  v: 'urn:schemas-microsoft-com:vml',
}
const documentPath = 'word/document.xml'

const elements = (root: Document | Element, namespace: string, name: string) =>
  Array.from(root.getElementsByTagNameNS(namespace, name))

const contains = (element: Element, namespace: string, name: string) =>
  element.getElementsByTagNameNS(namespace, name).length > 0

// Mammoth reads only mc:Fallback, so nothing under mc:Choice is shown to begin with.
const insideChoice = (element: Element) => {
  for (let parent = element.parentElement; parent; parent = parent.parentElement)
    if (parent.namespaceURI === namespaces.mc && parent.localName === 'Choice') return true
  return false
}

// Italic and in parentheses: square brackets would come out of Markdown escaping as \[…\],
// which the reader renders as display math.
const marker = (document: Document, label: string) => {
  const run = document.createElementNS(namespaces.w, 'w:r')
  const properties = document.createElementNS(namespaces.w, 'w:rPr')
  properties.append(document.createElementNS(namespaces.w, 'w:i'))
  const text = document.createElementNS(namespaces.w, 'w:t')
  text.textContent = `(${label} not converted)`
  run.append(properties, text)
  return run
}

// Drawings and objects sit inside a run, which cannot hold another run, so the marker follows it.
const markInPlace = (target: Element, label: string) => {
  const run = target.parentElement
  const document = target.ownerDocument
  if (run?.namespaceURI === namespaces.w && run.localName === 'r') {
    run.after(marker(document, label))
    target.remove()
  } else target.replaceWith(marker(document, label))
}

// Each rule names content Mammoth drops without trace; styles and anything it keeps stay out.
const markEquations = (document: Document) => {
  const paragraphs = elements(document, namespaces.m, 'oMathPara').filter(
    math => !insideChoice(math),
  )
  for (const math of paragraphs) markInPlace(math, 'Equation')
  const inline = elements(document, namespaces.m, 'oMath').filter(math => !insideChoice(math))
  for (const math of inline) markInPlace(math, 'Equation')
  return paragraphs.length + inline.length
}

const drawingLabel = (drawing: Element) => {
  if (contains(drawing, namespaces.c, 'chart')) return 'Chart'
  if (contains(drawing, namespaces.dgm, 'relIds')) return 'Diagram'
  return null
}

const markDrawings = (document: Document) => {
  const lost = elements(document, namespaces.w, 'drawing')
    .filter(drawing => !insideChoice(drawing))
    .flatMap(drawing => {
      const label = drawingLabel(drawing)
      return label ? [{ drawing, label }] : []
    })
  for (const { drawing, label } of lost) markInPlace(drawing, label)
  return lost.length
}

// An embedded object with a preview image is shown as that image, so only bare ones are lost.
const markObjects = (document: Document) => {
  const bare = elements(document, namespaces.w, 'object').filter(
    object => !insideChoice(object) && !contains(object, namespaces.v, 'imagedata'),
  )
  for (const object of bare) markInPlace(object, 'Embedded object')
  return bare.length
}

/** Puts a visible marker where Mammoth would silently drop content; other documents pass through untouched. */
export const markUnconvertedContent = async (docx: ArrayBuffer): Promise<ArrayBuffer> => {
  // Anything that is not a zip package has nothing to mark; Mammoth reports it as it always has.
  const [first, second] = new Uint8Array(docx, 0, Math.min(2, docx.byteLength))
  if (first !== 0x50 || second !== 0x4b) return docx
  const zip = await JSZip.loadAsync(docx)
  const entry = zip.file(documentPath)
  if (!entry) return docx
  const document = new DOMParser().parseFromString(await entry.async('string'), 'application/xml')
  const marked = markEquations(document) + markDrawings(document) + markObjects(document)
  if (marked === 0) return docx
  zip.file(documentPath, new XMLSerializer().serializeToString(document))
  return zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' })
}
