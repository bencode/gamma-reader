import * as Tabs from '@radix-ui/react-tabs'
import { Activity } from 'react'
import { pageName } from '../../shell/page-tab'
import { useLinkGraph, useOpenFile } from '../../shell/workspace-context'
import { Backlinks } from './markdown-reader/backlinks'
import styles from './markdown-reader/style.module.scss'

// A page no note holds, open in a tab: its name and the notes that link to it. Should a note of
// that name appear, the page says so and offers it, rather than turning into it under the reader.
export const PagePane = ({ id, page, active }: { id: string; page: string; active: boolean }) => {
  const graph = useLinkGraph()
  const openFile = useOpenFile()
  const view = graph?.node({ page })
  const name = pageName(graph, page)
  const notes = view?.kind === 'page' ? view.files : []
  return (
    <Activity mode={active ? 'visible' : 'hidden'}>
      <Tabs.Content value={id} className="document-pane" forceMount>
        <div className="reader-content">
          <div className="document-scroll">
            <article className={`markdown-body ${styles.page}`}>
              {/* Set as a note's text is, so the page reads like the notes it stands among. */}
              <div className="markdown-content markdown-reader">
                <h1>{name}</h1>
                {notes.length ? (
                  <p className={styles.pageNote}>
                    A note named {name} now exists:{' '}
                    {notes.map(note => (
                      <button
                        key={note.id}
                        type="button"
                        className={styles.backlinkPath}
                        onClick={() => openFile(note.id, null)}
                      >
                        {note.path}
                      </button>
                    ))}
                  </p>
                ) : (
                  <p className={styles.pageNote}>No note named {name} yet.</p>
                )}
              </div>
              <Backlinks page={name} />
            </article>
          </div>
        </div>
      </Tabs.Content>
    </Activity>
  )
}
