# Files and projects

Everything you read lives in **Files**, the panel on the left. A project is one set of files, with its own conversations and open tabs.

## Add documents

Choose **+** at the top of Files:

- **Add files…** picks one or more files from your computer.
- **Add folder…** brings in a whole folder and keeps its structure. Desktop Chrome and Edge read the folder directly; other browsers use their folder upload.
- **Add from URL…** downloads a file or folder from an address and opens it.

You can also drop files or folders onto Files.

**Add from URL…** understands a few kinds of address:

| Address | What arrives |
| --- | --- |
| An arXiv paper, `arxiv.org/abs/<id>` or `/pdf/<id>` | The paper's PDF |
| A GitHub file, `github.com/<owner>/<repo>/blob/<ref>/<path>` | That file |
| A GitHub repository or folder, `…/tree/<ref>/<folder>` | The folder, file by file |
| Any other `https` link | The file, if its site lets web pages download it |

GitHub allows 60 folder listings an hour from one network, and private repositories cannot be read. When a site refuses the download, save the file and drop it onto Files instead.

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

Each file row has two actions: **Save as…** writes the saved copy to your computer, and **Remove from Files** deletes the copy in this browser. A folder row offers **Remove folder**. Removing never touches the original on your computer.

**Save files to folder**, at the top of Files, writes the whole project to a folder on your computer and recreates its tree. Afterwards it saves only what changed. It needs desktop Chrome or Edge.

## Projects

The name at the top of Files is the current project; this one is **Tutorial**. Its menu offers:

- **New project…** creates an empty project.
- **Rename project…** and **View storage**, which shows how much space the project takes.
- **Delete project…** removes the project's files, conversations and tabs from this browser. The dialog offers **Save to folder first**.

Each project opens in its own browser tab, so the assistant can work in two projects at once. The address names the project, so a bookmark returns to the same one.

## Keeping a project in step with a source

A project can follow a source: Tutorial follows the copy shipped with Gamma Reader, and a deployment can follow a git repository. The line under **Files** says whether the source has changed and offers **Update**.

An update changes only the files the source changed:

| The source… | Your copy… | After **Update** |
| --- | --- | --- |
| changed a file | unchanged | The new version |
| changed a file | edited here | The new version, replacing your edit |
| did not change a file | edited or deleted here | Left as it is |
| removed a file | unchanged | Removed |
| removed a file | edited here | Kept, as your own file |

Before an update replaces your edits, the line names the files: *Tutorial has updates. Updating replaces your edits to …*. Save a copy first if you want to keep one. Files you add yourself are never touched.

Deleting Tutorial is a way to start it afresh: it returns on your next visit, with every file as it ships.

## Try it

1. Type `csv` in **Filter** and press **Enter**.
2. Open the **Tutorial** menu and choose **New project…**. Name it, then drop a document from your computer onto its Files.
3. Edit a sentence in this note with **Source**, and choose **Save**. The line under Files now counts one file changed only in this browser.
