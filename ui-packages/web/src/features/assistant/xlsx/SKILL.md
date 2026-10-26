# Reading spreadsheets

- sheet_info discovers sheet names, sizes and A1 extents. sheet_read reads a known region directly; search locates values without scanning row by row. A sheet name such as "2" takes precedence over its numeric position.
- A row has a separate row number and cells ordered by the returned columns. The row number is not column A. Cite sheet and cell coordinates. read/search instead expose workbook text as lines, including sheet headings; their line numbers are not spreadsheet row numbers.
- When sheet_read returns nextRow, continue with a range starting there. read/search use opaque next cursors instead.
- Empty cells and empty sheets can be genuinely empty. Do not substitute zero. Headers are content, not designated metadata.
- A merged block keeps its value in its top-left cell and the rest of the block empty; the value belongs to the whole block. sheet_info, sheet_read and each sheet heading in read list the merged blocks.
- Numbers read as the sheet displays them, such as 15.3% or ¥12,345.60. An error cell reads as its error, such as #DIV/0!. Formulas expose saved values, not recalculated results; one without a saved value reads as its formula, such as =SUM(A2:C2). Distinguish your calculations from stored values. These tools cannot modify XLSX files; CSV is a writable text alternative when requested.
