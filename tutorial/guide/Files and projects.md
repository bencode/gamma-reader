# Files and projects

Everything you read lives in **Files**, the panel on the left. A project is one set of files, with its own conversations and open tabs.

## Add documents

Choose **+** at the top of Files:

- **Add files…** picks one or more files from your computer.
- **Add folder…** brings in a whole folder and keeps its structure. Desktop Chrome and Edge read the folder directly; other browsers use their folder upload. iPhone and iPad cannot choose a folder, so there the entry is missing; add the files instead.
- **Add from URL…** downloads a file or folder from an address and opens it.

On a computer, you can also drop files or folders onto Files.

**Add from URL…** understands a few kinds of address:

| Address | What arrives |
| --- | --- |
| An arXiv paper, `arxiv.org/abs/<id>` or `/pdf/<id>` | The paper's PDF |
| A GitHub file, `github.com/<owner>/<repo>/blob/<ref>/<path>` | That file |
| A GitHub repository or folder, `…/tree/<ref>/<folder>` | The folder, file by file |
| Any other `https` link | The file, if its site lets web pages download it |

Adding a GitHub URL imports a snapshot; it does not set up sync or push. GitHub allows 60 folder listings an hour from one network, and private repositories cannot be read. When a site refuses the download, save the file and drop it onto Files instead.

### What a folder leaves out

A folder is brought in for reading, not mirrored:

- Folders named `node_modules`, `dist`, `build`, `out`, `target`, `coverage`, `__pycache__` or `venv`, and any folder or file whose name starts with `.`, are skipped.
- Files over 1 MiB, and formats Gamma Reader cannot read, are skipped too. The status line says how many.
- A folder with more than 5,000 readable files is refused.

When a file with the same path is already there, you choose **Skip existing** or **Replace**. Adding a folder again with **Replace** brings in what changed.

## Find a file

Type in **Filter** above the tree. Only files whose path contains every word you typed stay visible, ignoring case: `wave lab` finds `examples/Explore a wave.lab.md`. **Enter** opens the first match; **Escape** clears the filter.

Opening a document unfolds the folders above it, so the tree always shows where you are.

## Keep copies and remove files

| Action | Saves to |
| --- | --- |
| **Save** in the document editor, or ⌘/Ctrl+S | This browser's saved copy |
| **Save as…** on a file row | A downloaded copy on your computer |
| **Save files to folder**, above Files without a writable source | A folder you choose; recreates the project tree, then exports only changes. Requires desktop Chrome or Edge |
| **Save … to [source name]**, above Files in a writable-source project | The connected folder or repository; see [[Files and projects#Keeping a project in step with a source]] |

**Remove from Files** deletes the browser copy; a folder row offers **Remove folder**. In a writable-source project, the next source Save also requests deletion of synced originals, with confirmation first.

## Projects

The name at the top of Files is the current project; this one is **Tutorial**. Its menu offers:

- **New project…** creates an empty project.
- **Rename project…** and **View storage**, which shows how much space the project takes.
- **Delete project…** removes the project's files, conversations and tabs from this browser. The dialog offers **Save to folder first**.

Each project opens in its own browser tab, so the assistant can work in two projects at once. The address names the project, so a bookmark returns to the same one.

## Keeping a project in step with a source

A project can follow a source. The line under **Files** shows sync progress and any changes waiting to be saved.

- **Read-only source** (Tutorial, a clone without push enabled, or a listing URL): choose **Update**. The reader warns before replacing edits to files the source changed; export a copy first to keep them.
- **Writable source** (a local working tree opened with npx, or a push-enabled clone): sync runs automatically every minute, keeping browser edits until source Save.

Files the source did not change stay as they are here. A source deletion removes an unchanged browser copy; an edited copy stays. Files you add remain in the project.

To save to a writable source:

1. Choose **Save** in the document editor to keep the draft in the browser.
2. Choose **Save … to [source name]** above Files to write changes back. Commit and push local changes with git; a push-enabled clone does both on Save.

If source Save reports conflicts, follow **Details**: resolve local working-tree markers in your editor, or remote-repository markers in the reader, then save again.

Deleting Tutorial is a way to start it afresh: it returns on your next visit, with every file as it ships.

## Try it

1. Type `csv` in **Filter** and press **Enter**.
2. Open the **Tutorial** menu and choose **New project…**. Name it, then drop a document from your computer onto its Files.
3. Edit a sentence in this note with **Source**, and choose **Save**. The line under Files now counts one file changed only in this browser.
