import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { convertDocxToMarkdown } from './docx'

const namespaces = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"',
  'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
].join(' ')

const relationship = (id: string, type: string, target: string) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`

// A minimal package Mammoth accepts: the body, its styles, and the comments it may cite.
const docx = async (body: string) => {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship('rId1', 'officeDocument', 'word/document.xml')}</Relationships>`,
  )
  zip.file(
    'word/_rels/document.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship('rIdS', 'styles', 'styles.xml')}${relationship('rIdC', 'comments', 'comments.xml')}</Relationships>`,
  )
  zip.file(
    'word/styles.xml',
    `<w:styles ${namespaces}><w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/></w:style></w:styles>`,
  )
  zip.file(
    'word/comments.xml',
    `<w:comments ${namespaces}><w:comment w:id="0" w:author="Reviewer"><w:p><w:r><w:t>Check this figure</w:t></w:r></w:p></w:comment></w:comments>`,
  )
  zip.file('word/document.xml', `<w:document ${namespaces}><w:body>${body}</w:body></w:document>`)
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })])
}

const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const drawing = (uri: string, data: string) =>
  `<w:drawing><wp:inline><wp:docPr id="1" name="Shape"/><a:graphic><a:graphicData uri="${uri}">${data}</a:graphicData></a:graphic></wp:inline></w:drawing>`
const chart = drawing(
  'http://schemas.openxmlformats.org/drawingml/2006/chart',
  '<c:chart r:id="rIdX"/>',
)
const diagram = drawing(
  'http://schemas.openxmlformats.org/drawingml/2006/diagram',
  '<dgm:relIds r:dm="rIdX" r:lo="rIdX" r:qs="rIdX" r:cs="rIdX"/>',
)

describe('unconverted Word content', () => {
  it('leaves a document whose content all converts exactly as it was', async () => {
    const { markdown } = await convertDocxToMarkdown(
      await docx(
        '<w:p><w:pPr><w:pStyle w:val="BodyText"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Styled body</w:t></w:r></w:p>',
      ),
    )
    expect(markdown).toBe('**Styled body**')
  })

  it('marks equations, charts and diagrams where they stood', async () => {
    const { markdown } = await convertDocxToMarkdown(
      await docx(
        [
          paragraph('Before'),
          '<w:p><m:oMathPara><m:oMath><m:r><m:t>E=mc2</m:t></m:r></m:oMath></m:oMathPara></w:p>',
          '<w:p><w:r><w:t xml:space="preserve">Inline </w:t></w:r><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>',
          `<w:p><w:r>${chart}</w:r></w:p>`,
          `<w:p><w:r>${diagram}</w:r></w:p>`,
          paragraph('After'),
        ].join(''),
      ),
    )
    expect(markdown.split('\n\n')).toEqual([
      'Before',
      '*(Equation not converted)*',
      'Inline *(Equation not converted)*',
      '*(Chart not converted)*',
      '*(Diagram not converted)*',
      'After',
    ])
  })

  it('trusts the fallback Word shows instead of marking the alternative it skips', async () => {
    const { markdown } = await convertDocxToMarkdown(
      await docx(
        `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="c14">${chart}</mc:Choice><mc:Fallback><w:t>Chart as text</w:t></mc:Fallback></mc:AlternateContent></w:r></w:p>`,
      ),
    )
    expect(markdown).toBe('Chart as text')
  })

  it('keeps comments, listed after the text they annotate, without dead links', async () => {
    const { markdown } = await convertDocxToMarkdown(
      await docx(
        '<w:p><w:r><w:t>Commented text</w:t></w:r><w:r><w:commentReference w:id="0"/></w:r></w:p>',
      ),
    )
    expect(markdown).toBe('Commented text(1)\n\nComment (1)\n\nCheck this figure')
  })
})
