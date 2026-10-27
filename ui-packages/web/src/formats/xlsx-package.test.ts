import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { readSpreadsheet, sheetText } from './xlsx'

const relationship = (id: string, type: string, target: string) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`

// A minimal workbook: one sheet, its styles, and inline strings for text, and when asked a chart
// sheet after it, as Excel's Insert > Chart Sheet writes one.
const workbook = async (sheetData: string, mergeCells: string, withChartSheet = false) => {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship('rId1', 'officeDocument', 'xl/workbook.xml')}</Relationships>`,
  )
  zip.file(
    'xl/workbook.xml',
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Q3" sheetId="1" r:id="rId1"/>${withChartSheet ? '<sheet name="Chart1" sheetId="2" r:id="rId3"/>' : ''}</sheets></workbook>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship('rId1', 'worksheet', 'worksheets/sheet1.xml')}${relationship('rId2', 'styles', 'styles.xml')}${withChartSheet ? relationship('rId3', 'chartsheet', 'chartsheets/sheet1.xml') : ''}</Relationships>`,
  )
  zip.file(
    'xl/styles.xml',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="5"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="[$¥-804]#,##0.00"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/><numFmt numFmtId="167" formatCode="0.0.0%%[["/><numFmt numFmtId="168" formatCode="_(* #,##0.00_);_(* \\(#,##0.00\\);_(* &quot;-&quot;??_);_(@_)"/></numFmts><cellXfs count="8"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="4"/><xf numFmtId="2"/><xf numFmtId="166"/><xf numFmtId="167"/><xf numFmtId="168"/></cellXfs></styleSheet>',
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData>${mergeCells}</worksheet>`,
  )
  if (withChartSheet)
    zip.file(
      'xl/chartsheets/sheet1.xml',
      '<chartsheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><drawing r:id="rId1"/></chartsheet>',
    )
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })])
}

const text = (reference: string, value: string) =>
  `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`
const number = (reference: string, value: number, style = 0) =>
  `<c r="${reference}" s="${style}"><v>${value}</v></c>`

it('reads cells as the sheet shows them, with errors, unsolved formulas and merges', async () => {
  const blob = await workbook(
    `<row r="1">${text('A1', 'Quarter')}${text('D1', 'Check')}${text('E1', 'Sum')}</row>` +
      `<row r="2">${number('A2', 0.153, 1)}${number('B2', 12345.6, 2)}${number('C2', 1234567.891, 3)}` +
      '<c r="D2" t="e"><f>1/0</f><v>#DIV/0!</v></c><c r="E2" s="1"><f>SUM(A2:C2)</f><v></v></c></row>' +
      `<row r="3">${number('A3', 2.3456, 4)}${number('B3', 123456789012)}${number('C3', 46085, 5)}` +
      '<c r="F3" t="e"><v>#REF!</v></c></row>' +
      `<row r="4">${number('A4', 7, 6)}${number('B4', 1234.5, 7)}</row>`,
    '<mergeCells count="2"><mergeCell ref="A1:C1"/><mergeCell ref="D2:D3"/></mergeCells>',
  )

  expect(await readSpreadsheet(blob)).toEqual([
    {
      name: 'Q3',
      rows: [
        ['Quarter', null, null, 'Check', 'Sum'],
        ['15.3%', '¥12,345.60', '1,234,567.89', '#DIV/0!', '=SUM(A2:C2)'],
        // A plain number keeps every digit, a date stays a date, and an error past the last
        // column the parser kept still lands in its own.
        ['2.35', 123456789012, new Date('2026-03-04T00:00:00Z'), null, null, '#REF!'],
        // A format the formatter cannot read keeps the number; one that pads to align its
        // column comes without the padding.
        [7, '1,234.50', null, null, null],
      ],
      merges: [
        { startRow: 1, endRow: 1, startColumn: 1, endColumn: 3 },
        { startRow: 2, endRow: 3, startColumn: 4, endColumn: 4 },
      ],
    },
  ])
})

it('opens a workbook holding a chart sheet, and names that sheet a chart', async () => {
  const sheets = await readSpreadsheet(
    await workbook(`<row r="1">${text('A1', 'Quarter')}</row>`, '', true),
  )
  expect(sheets).toEqual([
    { name: 'Q3', rows: [['Quarter']] },
    { name: 'Chart1', rows: [], chart: true },
  ])
  expect(sheetText({ name: 'Chart1', rows: [], chart: true })).toBe(
    '# Chart1 (0 rows × 0 columns)\n\n(chart sheet; its chart is not read)',
  )
})
