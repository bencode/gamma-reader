import JSZip from 'jszip'
import { format, isDateFormat, isValidFormat } from 'numfmt'

export type SheetDetails = {
  // Cells the parser leaves blank or shows without their number format, by address.
  cells: readonly { reference: string; text: string }[]
  merges: readonly string[]
  // A chart sheet, which Excel's Insert > Chart Sheet writes: one chart and no cells.
  chart?: true
}

const relationshipsNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

// The built-in formats a number can carry without the workbook spelling them out. Dates are
// left out: the parser already reads those as dates.
const builtInFormats = new Map([
  ['1', '0'],
  ['2', '0.00'],
  ['3', '#,##0'],
  ['4', '#,##0.00'],
  ['9', '0%'],
  ['10', '0.00%'],
  ['11', '0.00E+00'],
  ['12', '# ?/?'],
  ['13', '# ??/??'],
  ['37', '#,##0 ;(#,##0)'],
  ['38', '#,##0 ;[Red](#,##0)'],
  ['39', '#,##0.00;(#,##0.00)'],
  ['40', '#,##0.00;[Red](#,##0.00)'],
  ['48', '##0.0E+0'],
])

const elements = (root: Document | Element, name: string) =>
  Array.from(root.getElementsByTagName(name))

const parse = async (zip: JSZip, path: string) => {
  const entry = zip.file(path)
  return entry && new DOMParser().parseFromString(await entry.async('string'), 'application/xml')
}

// A relationship target is relative to xl/ unless it starts at the package root. Its type ends in
// the kind of sheet: worksheet, chartsheet.
const sheetPaths = async (zip: JSZip) => {
  const [workbook, relationships] = await Promise.all([
    parse(zip, 'xl/workbook.xml'),
    parse(zip, 'xl/_rels/workbook.xml.rels'),
  ])
  if (!workbook || !relationships) return []
  const targets = new Map(
    elements(relationships, 'Relationship').map(relationship => {
      const target = relationship.getAttribute('Target') ?? ''
      return [
        relationship.getAttribute('Id'),
        {
          path: target.startsWith('/') ? target.slice(1) : `xl/${target}`,
          kind: relationship.getAttribute('Type')?.split('/').at(-1),
        },
      ]
    }),
  )
  return elements(workbook, 'sheet').flatMap(sheet => {
    const target = targets.get(sheet.getAttributeNS(relationshipsNamespace, 'id'))
    return target ? [{ name: sheet.getAttribute('name') ?? '', ...target }] : []
  })
}

// The number format of each cell style, by the style's position, which is what a cell names.
const styleFormats = async (zip: JSZip) => {
  const styles = await parse(zip, 'xl/styles.xml')
  if (!styles) return []
  const custom = new Map(
    elements(styles, 'numFmt').map(format => [
      format.getAttribute('numFmtId'),
      format.getAttribute('formatCode'),
    ]),
  )
  const cellStyles = elements(styles, 'cellXfs')[0]
  if (!cellStyles) return []
  return elements(cellStyles, 'xf').map(style => {
    const id = style.getAttribute('numFmtId') ?? '0'
    return custom.get(id) ?? builtInFormats.get(id)
  })
}

// Excel shows General numbers past eleven digits in scientific notation, which would cost an
// account or phone number its digits, so those keep the plain value the parser gives, as does
// a format the formatter cannot read. The padding that aligns a column is not part of the value.
const shownNumber = (value: string, code: string | null | undefined) =>
  code && code !== 'General' && isValidFormat(code) && !isDateFormat(code)
    ? format(code, Number(value)).trim()
    : null

// The parser leaves error cells and formulas without a saved result blank; this never
// recalculates, so it says what the file holds.
const cellDetail = (cell: Element, formats: readonly (string | null | undefined)[]) => {
  // Some writers leave an empty <v> where Excel writes none.
  const value = elements(cell, 'v')[0]?.textContent || undefined
  const type = cell.getAttribute('t')
  if (type === 'e') return value ?? null
  const formula = elements(cell, 'f')[0]
  if (formula && value === undefined)
    return formula.textContent ? `=${formula.textContent}` : '(formula not calculated)'
  if (value !== undefined && (type === null || type === 'n'))
    return shownNumber(value, formats[Number(cell.getAttribute('s') ?? 0)])
  return null
}

const readDetails = (sheet: Document, formats: readonly (string | null | undefined)[]) => ({
  cells: elements(sheet, 'c').flatMap(cell => {
    const text = cellDetail(cell, formats)
    const reference = cell.getAttribute('r')
    return text !== null && reference ? [{ reference, text }] : []
  }),
  merges: elements(sheet, 'mergeCell').flatMap(merge => merge.getAttribute('ref') ?? []),
})

/** What each sheet holds beyond the values the parser returns, by sheet name. */
export const readSheetDetails = async (blob: Blob): Promise<Map<string, SheetDetails>> => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const [sheets, formats] = await Promise.all([sheetPaths(zip), styleFormats(zip)])
  const details = await Promise.all(
    sheets.map(async ({ name, path, kind }): Promise<[string, SheetDetails]> => {
      if (kind === 'chartsheet') return [name, { cells: [], merges: [], chart: true }]
      const sheet = await parse(zip, path)
      return [name, sheet ? readDetails(sheet, formats) : { cells: [], merges: [] }]
    }),
  )
  return new Map(details)
}
