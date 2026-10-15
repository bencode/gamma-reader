# Reading spreadsheets

- sheet_info discovers sheet names, sizes and A1 extents. sheet_read reads a known region directly; search locates values without scanning row by row. A sheet name such as "2" takes precedence over its numeric position.
- A row has a separate row number and cells ordered by the returned columns. The row number is not column A. Cite sheet and cell coordinates. read/search instead expose workbook text as lines, including sheet headings; their line numbers are not spreadsheet row numbers.
- When sheet_read returns nextRow, continue with a range starting there. read/search use opaque next cursors instead.
- Empty cells, empty sheets and non-leading cells of a merged block can be genuinely empty. Do not substitute zero. Headers are content, not designated metadata.
- Formulas expose saved values, not recalculated results; without a saved value they read as empty. Distinguish your calculations from stored values. These tools cannot modify XLSX files; CSV is a writable text alternative when requested.
