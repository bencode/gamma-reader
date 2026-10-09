# Sync from a repository

A project can follow a git repository instead of files added by hand. Name the source and point at the repository:

```sh
GAMMA_SOURCE_NAME=notes GAMMA_SOURCE_WORKTREE=$HOME/notes pnpm dev
```

The reader opens a project named after the source and offers **Update** whenever the repository has changed; it checks when the library opens and when its tab comes back into view, at most once a minute. Sync from a clone or an address only brings files in, and the source has the last word on what it changes: an update replaces a browser edit to a file the source changed, and says so first, while files the source did not change stay as they are in the browser. A working tree can also take changes back — see [Saving back to a working tree](#saving-back-to-a-working-tree) — and so can a clone the server pushes to — see [Saving back to a repository](#saving-back-to-a-repository).

Set exactly one of these with `GAMMA_SOURCE_NAME`:

| Variable | Serves | Changes show |
| --- | --- | --- |
| `GAMMA_SOURCE_WORKTREE` | The files on disk, committed or not, leaving out what git ignores | As soon as they are saved |
| `GAMMA_SOURCE_REPO` | The committed files of a clone the server keeps under `GAMMA_SOURCE_DIR` | After the next pull, every `GAMMA_SOURCE_PULL_SECONDS` |
| `GAMMA_SOURCE_URL` | Whatever that address serves: `GET <url>` lists `{ version, files: [{ path, version, size }] }`, and `GET <url>/files/<path>` returns a file | When that address says so |

The rest are optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GAMMA_SOURCE_EXCLUDE` | Unset | Folders of the repository to leave out, comma separated |
| `GAMMA_SOURCE_INCLUDE` | Unset (all) | Folders of the repository to list, comma separated, when only some are wanted |
| `GAMMA_SOURCE_DIR` | `$GAMMA_DATA_DIR/source` | Where a cloned repository lives |
| `GAMMA_SOURCE_PULL_SECONDS` | `120` | How often a cloned repository is pulled |
| `GAMMA_SOURCE_PUSH` | Unset | `1` commits Save to a cloned repository and pushes it; see [Saving back to a repository](#saving-back-to-a-repository) |

Give paths in full: `.env` does not expand `~` or `$HOME`. A source holds the whole repository but what git ignores and hidden files and folders, such as `.github/`. `GAMMA_SOURCE_EXCLUDE=meta,tmp` also leaves those folders out, and `GAMMA_SOURCE_INCLUDE=knowledge,journal` limits it to those folders instead; a hidden folder named there, such as `.github`, is held too, though nothing hidden inside it is. A file outside the source is neither listed nor saved, and the reader says which rule left it out. For a private repository, give git its key with `GIT_SSH_COMMAND`. The default container image has no git; build one that serves a repository with `docker build --target runtime-git`. The server does not check who asks for the files, so a deployment that serves a repository must sit behind a sign-in.

## Saving back to a working tree

A working tree also takes changes back. Its project checks for updates every minute and brings them in without asking, and the **Save** button above Files writes what changed in the browser since the last update to the folder: edits, new files, moves, and deletions. Deleting files on disk is confirmed first. Nothing is committed; review and commit the changes with git as usual.

Save compares the library with what it last brought in, so any change made here counts, however it was made. Each file is sent with the version it started from:

- A file nobody else changed is written as it is.
- A file someone changed on disk meanwhile — in an editor, or by an agent — is merged with `git merge-file`. Edits to different lines combine on their own; edits to the same line leave conflict markers in the file, and the reader names it so you can resolve it in your editor. The resolved file comes back with the next update.
- A file you edited that was deleted on disk meanwhile stays deleted; your copy remains here as a new file, and saving again writes it back. A file you deleted that was changed on disk meanwhile is kept, and the next update brings it back here. The reader says which files these are.

A project saves only to the folder it was synced from. Pointing the same source name at another folder blocks Save for that project; give the new folder its own name.

## Saving back to a repository

With `GAMMA_SOURCE_PUSH=1`, a clone takes changes back too: Save works as it does for a working tree, and the server commits what it wrote and pushes it to the branch it cloned at once, so the repository's history records every save. The clone's key must be allowed to push.

- Each save starts from the repository's latest commit, and saves take turns with the pulls. A file someone changed meanwhile is merged as it is in a working tree.
- A clash on the same lines is never committed. The reader gets the file back with both sides marked in it, resolves it there, and saves again; a file that still holds the markers is not saved.
- A push the repository refuses because it moved on is replayed on its newer commit once. If that fails too, the clone goes back to the repository's commit and the changes stay in the browser to save again.

A commit's author is the reader the sign-in in front of the server names in `X-Forwarded-Email` and `X-Forwarded-User`, as oauth2-proxy passes them; without them it is Gamma Reader. The server believes these headers as given, so serve it only through that sign-in.
