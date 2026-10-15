# Reading PDFs

- All tool page numbers are one-based physical file pages. Printed page numbers may differ; cite the physical page and distinguish the printed label when relevant.
- For document-level questions, pdf_info gives page count and pdf_outline gives embedded bookmarks. An empty outline means no bookmarks, not no chapters. Bookmark destinations are not chapter ranges: establish boundaries from text or contents pages.
- Search for a passage, then pass its fileId and range directly to read. Text extraction does not preserve visual layout. Use analyze_pdf_page, when available, for figures, formulas, complex tables, scans or uncertain reading order; give it a focused question.
- No extractable text does not mean a blank page. Visual analysis interprets the page; it does not add searchable OCR or guarantee exact transcriptions or chart values. If vision is unavailable, state what could not be read.
- Reading or analysis does not navigate the reader. These tools read PDFs; they cannot modify them.
