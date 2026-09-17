export type PdfInfoInput = { fileId: string }
export type PdfInfoResult = { fileId: string; pageCount: number; title?: string; author?: string }
export type PdfOutlineInput = { fileId: string; cursor?: string }
export type PdfOutlineEntry = { title: string; depth: number; pageNumber: number | null }
export type PdfOutlineResult = {
  fileId: string
  entries: PdfOutlineEntry[]
  next: PdfOutlineInput | null
}
export type AnalyzePdfPageInput = { fileId: string; pageNumber: number; question: string }
export type AnalyzePdfPageResult = { fileId: string; pageNumber: number; analysis: string }
