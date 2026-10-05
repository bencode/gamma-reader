# Reading documents

Each document opens in a tab, and each format gets the controls that suit it. The examples here come from one small story: a week of counting birds on a morning walk.

## PDF

[[The art of noticing.pdf]] is a three-page essay. The toolbar has:

- **Show table of contents**, when the PDF has an outline.
- **Previous page** and **Next page**, a page box you can type into, and a slider.
- **Zoom out** and **Zoom in**, from 50% to 200%. Choose the percentage to return to 100%. Above 100%, **Pan document** lets you drag the page.
- **Reading appearance**, with the themes **Original**, **Paper** and **Dark**.

A link can open a PDF at a page: [[The art of noticing.pdf#page=2]] goes to the second page.

## Word and Excel

[[Field notes.docx]] is shown as text, with an outline and the same reading appearance as a Markdown note. Page layout, fonts, headers and tracked changes are left out. An equation or chart that cannot be converted is marked where it stood, such as *(Equation not converted)*, so nothing is skipped silently.

[[Observation log.xlsx]] opens as a grid with column letters, row numbers and a tab for each sheet. A formula shows the value it was saved with; colours, charts and images are not shown.

Only `.docx` and `.xlsx` are read. The older `.doc` and `.xls` are stored but cannot be opened.

## CSV

[[Observation log.csv]] holds the same week as the spreadsheet. A CSV opens as a grid, and the grid follows your edits when you open **Source** beside it. Fields may be separated by commas, semicolons or tabs, whichever the first line uses. A file with a single column is shown as text.

## Code and text

[[birds.py]] opens in a code view with highlighting, line numbers, folding and search. Code files are read-only here; plain text and Markdown can be edited, as [[Writing in Markdown]] shows.

## Images, SVG and web pages

[[How Gamma Reader works.svg]] opens in the image view: **Zoom out**, **Zoom in** from 25% to 400%, and **Fit**. An SVG also has **Source**, since it is text.

[[Quadratic.html]] runs in a sandbox. Its scripts work, but it cannot reach your files or this page. After you edit its **Source**, **Run changes** loads the new version. [[Interactive pages]] covers HTML pages and p5 sketches in detail.

## Tabs

- Right-click a tab, or press **Shift+F10**, for **Close**, **Close others**, **Close to the right** and **Close all**.
- **Show open documents**, at the end of the tab bar, lists every tab with a search box.
- When two open files share a name, their tabs add the folder: *Notes.md · drafts*.

Gamma Reader remembers your open tabs and where you stopped in each one: the page of a PDF, the passage in a note, the row of a sheet. Reload the page and you are back where you were.

## Limits

A file can be up to 200 MiB, and a project up to 1 GiB. Text over 5 MiB is not previewed, and the assistant reads it only if it is a PDF, Word or Excel file. Your browser's own storage quota may be lower.

## Try it

1. Open [[The art of noticing.pdf#page=2]], choose **Reading appearance**, and switch to **Dark**.
2. Open [[Observation log.xlsx]] and [[Field notes.docx]] side by side as tabs. Which morning does the note single out, and what does the log say about it?
3. Reload this page. Every tab comes back, at the place you left it.
