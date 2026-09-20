import { Type } from '@earendil-works/pi-ai'
import { documentPagePixels, prepareImage } from '../../../core/image-input'
import { bind } from '../tool'
import { LocalToolError } from '../tool-types'
import type { VisionAnalyzer } from '../vision'
import type { PdfRuntime } from './runtime'
import type { AnalyzePdfPageResult } from './types'

export const createPdfTools = (pdf: PdfRuntime, analyze?: VisionAnalyzer) => {
  const tools = [
    bind(
      'pdf_info',
      'Get PDF page count and available title and author without reading page text. Page numbers are physical file pages, starting at 1.',
      Type.Object({ fileId: Type.String() }),
      (input, signal) => pdf.info(input.fileId, signal),
    ),
    bind(
      'pdf_outline',
      'Read embedded PDF bookmarks with depth and physical destination page numbers. A null pageNumber has no internal page destination. An empty list means no embedded outline. Follow next unchanged.',
      Type.Object({ fileId: Type.String(), cursor: Type.Optional(Type.String()) }),
      pdf.outline,
    ),
  ]
  return analyze
    ? [
        ...tools,
        bind(
          'analyze_pdf_page',
          'Analyze the full visual appearance of one PDF page using a vision model. Use for figures, formulas, tables or scanned pages. Returns model interpretation, not guaranteed exact text extraction. Does not navigate the reader.',
          Type.Object({
            fileId: Type.String(),
            pageNumber: Type.Integer({ minimum: 1 }),
            question: Type.String({ minLength: 1, maxLength: 2000 }),
          }),
          async (input, signal): Promise<AnalyzePdfPageResult> => {
            if (!input.question.trim())
              throw new LocalToolError('Provide a focused question for the PDF page.')
            const blob = await pdf.renderPage(input.fileId, input.pageNumber, signal)
            const image = await prepareImage(blob, blob.type, documentPagePixels, signal)
            const analysis = await analyze(image, input.question, signal)
            return { fileId: input.fileId, pageNumber: input.pageNumber, analysis }
          },
        ),
      ]
    : tools
}
