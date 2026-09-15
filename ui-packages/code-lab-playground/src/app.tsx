import { CodeCell, createCodeLabSession } from '@gamma-reader/code-lab'
import { useEffect, useState, useSyncExternalStore } from 'react'
import styles from './app.module.scss'
import { exampleCells, exampleSections } from './examples'

export const App = () => {
  const [session] = useState(() => createCodeLabSession(exampleCells))
  const sessionSnapshot = useSyncExternalStore(
    session.subscribeSession,
    session.getSessionSnapshot,
    session.getSessionSnapshot,
  )

  useEffect(() => () => session.dispose(), [session])

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.packageMark}>
          <span aria-hidden="true">{'{ }'}</span>
          @gamma-reader/code-lab
        </div>
        <h1>
          Four languages.
          <br />
          One quiet page.
        </h1>
        <p>
          A standalone preview of editable, executable code cells designed to sit naturally inside a
          reading flow.
        </p>
        <div className={styles.hints}>
          <span className={sessionSnapshot.dirty ? styles.edited : undefined}>
            {sessionSnapshot.dirty ? 'Local edits' : 'Examples ready'}
          </span>
          <span>
            <kbd>⌘</kbd> Enter to run
          </span>
        </div>
      </header>

      <article className={styles.article}>
        {exampleSections.map(section => (
          <section className={styles.lesson} key={section.language}>
            <div className={styles.lessonCopy}>
              <span>{section.eyebrow}</span>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
            <div className={styles.cells}>
              {section.cells.map(cell => (
                <CodeCell key={cell.id} cellId={cell.id} session={session} />
              ))}
            </div>
          </section>
        ))}
      </article>

      <footer className={styles.footer}>
        Source-only React package · language runtimes load on first use
      </footer>
    </main>
  )
}
