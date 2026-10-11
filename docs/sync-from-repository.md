# Sync from a repository

A connected source keeps a project's browser copy in step with files on disk or in a remote repository.

## Local working tree

With Node 24 and git installed, run:

```sh
npx gamma-reader ~/notes --exclude tmp,output
```

The folder must belong to a git working tree. The reader opens a project named after it, syncs disk changes automatically, and can [save changes back](#saving-back-to-a-working-tree). npx serves only a local working tree; it does not clone a remote repository. For model keys and `.env` loading, see [Configuration](self-hosting.md#configuration).

## Remote repository

On a server with Node 24, pnpm 10.14.0 and git, run these commands from a Gamma Reader checkout:

```sh
pnpm install
pnpm build
GAMMA_SOURCE_NAME=notes GAMMA_SOURCE_REPO=https://github.com/you/notes.git pnpm start
```

The server clones the repository and pulls every 120 seconds by default. Set `GAMMA_SOURCE_PUSH=1` in the checkout's untracked `.env` to enable [commit and push on Save](#saving-back-to-a-repository). Private repositories need git credentials; SSH keys can be selected with `GIT_SSH_COMMAND`. Serve the source behind a sign-in: the server does not authenticate file requests itself.

For Docker, build the `runtime-git` target and pass the source variables into the container. The shipped [Compose file](../compose.production.yml) uses the git-free target and does not forward `GAMMA_SOURCE_*`; see [Self-hosting](self-hosting.md#production) for the deployment workflow.

## Source configuration

When starting the server directly, set `GAMMA_SOURCE_NAME` and exactly one source variable. npx sets the name and working tree for you.

| Variable | Serves |
| --- | --- |
| `GAMMA_SOURCE_WORKTREE` | Files on disk, including uncommitted files, subject to the filters below |
| `GAMMA_SOURCE_REPO` | Committed files of a clone the server keeps pulling |
| `GAMMA_SOURCE_URL` | A read-only listing endpoint: `GET <url>` returns `{ version, files: [{ path, version, size }] }`; `GET <url>/files/<path>` returns a file |

| Optional variable | Default | Purpose |
| --- | --- | --- |
| `GAMMA_SOURCE_EXCLUDE` | Unset | Folders to leave out, comma separated; also available as npx `--exclude` |
| `GAMMA_SOURCE_INCLUDE` | Unset (all) | Only these folders, comma separated; also available as npx `--include` |
| `GAMMA_SOURCE_DIR` | `$GAMMA_DATA_DIR/source` | Where a cloned repository lives |
| `GAMMA_SOURCE_PULL_SECONDS` | `120` | Seconds between pulls |
| `GAMMA_SOURCE_PUSH` | Unset | `1` enables commit and push to the cloned repository |

Use absolute paths in `.env`: it does not expand `~` or `$HOME`.

### What is synced

- **Local working tree:** tracked files and untracked files allowed by git's ignore rules. Already tracked files remain eligible even if they match `.gitignore`.
- **Remote clone:** committed files only; `.gitignore` does not remove files already committed.
- **Path filters:** hidden files and folders stay out. Include/exclude folders are relative to the selected local folder or the remote repository root; exclude wins. Explicitly including a hidden folder such as `.github` allows its non-hidden contents.
- **Repository boundaries:** symlinks and submodules stay out. Nested independent git repositories are not recursively synced as part of a local working tree.

A file outside the include/exclude or hidden-path rules is neither listed nor saved. These source rules differ from the browser's [one-time folder import filters](../tutorial/guide/Files%20and%20projects.md#what-a-folder-leaves-out).

### When updates arrive

| Source | Updates | Browser edits |
| --- | --- | --- |
| Read-only clone or URL | Checked when the project opens or its tab becomes visible, at most once a minute; choose **Update** | Replaced if the source changed the same file; the reader warns first |
| Local working tree or push-enabled clone | Also checked every minute; updates arrive automatically | Kept until you save back |

Both leave browser edits alone when the source did not change the file. Newly added browser files stay in the project.

## Saving back to a working tree

1. Choose **Save** in the document editor (⌘/Ctrl+S) to keep the draft in IndexedDB.
2. Choose **Save** above Files to write the project's edits, additions, moves and deletions to its source. Deletions are confirmed first.
3. Review, commit and push with git yourself; local Save does not commit or push.

Save compares each file with the version last synced:

- **Concurrent edits:** different lines merge automatically. Conflicting lines are written with markers; resolve them in your editor and the next sync brings the result in.
- **Deletion conflicts:** a file deleted on disk stays deleted, with your edit kept in the browser to save again. A file you deleted here is kept on disk if someone changed it meanwhile.

A project saves only to the folder it was synced from. Give another folder a different source name.

## Saving back to a repository

With `GAMMA_SOURCE_PUSH=1`, the two Save steps above also apply to a remote clone. The server pulls before saving, commits the changes and pushes to the branch it cloned. Its git credentials must allow push.

- **Conflicts:** conflicting text is returned to the reader without being committed. Resolve the markers, save the document, then save to the source again.
- **Push failure:** if the repository moved on, the server rebases and retries once. If commit or push still fails, the clone is restored and your browser changes remain available to save again.

The sign-in's `X-Forwarded-Email` and `X-Forwarded-User` headers name the commit author; without them it is Gamma Reader. Only the sign-in should be allowed to set these headers.
