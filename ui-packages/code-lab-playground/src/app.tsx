import { CodeCell, CodeLabProvider } from '@gamma-reader/code-lab'
import { useState } from 'react'
import styles from './app.module.scss'
import { BasicExample, ControlledExample } from './controlled-example'
import { exampleCells, exampleSections } from './examples'

export const App = () => {
  const [cells, setCells] = useState(exampleCells)
  const edited = cells.some((cell, index) => cell.source !== exampleCells[index]?.source)
  const updateCell = (id: string, source: string) =>
    setCells(current => current.map(cell => (cell.id === id ? { ...cell, source } : cell)))

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
          <span className={edited ? styles.edited : undefined}>
            {edited ? 'Local edits' : 'Examples ready'}
          </span>
          <span>
            <kbd>⌘</kbd> Enter to run
          </span>
        </div>
      </header>

      <BasicExample />
      <CodeLabProvider cells={cells} onCellChange={updateCell}>
        <article className={styles.article} aria-label="Four language examples">
          {exampleSections.map(section => (
            <section className={styles.lesson} key={section.language}>
              <div className={styles.lessonCopy}>
                <span>{section.eyebrow}</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </div>
              <div className={styles.cells}>
                {section.cells.map(cell => (
                  <CodeCell key={cell.id} cellId={cell.id} />
                ))}
              </div>
            </section>
          ))}
        </article>
      </CodeLabProvider>
      <ControlledExample />

      <footer className={styles.footer}>
        Source-only React package · language runtimes load on first use
      </footer>
    </main>
  )
}
