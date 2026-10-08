import { useEffect, useState } from 'react'
import { workspaceDatabaseName } from '../../data/workspace-database'
import { runBackgroundAgent, useBackgroundStatus } from '../agent/background'
import { curatorAgent } from './curator/agent'
import { pendingConversations } from './curator/pending'
import { abstractAgent, tidyAgent } from './dream/agents'
import styles from './style.module.scss'

const timeOf = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const lastRunText = (
  label: string,
  run: NonNullable<ReturnType<typeof useBackgroundStatus>['lastRun']>,
) =>
  [
    `${label} ${timeOf(run.at)}`,
    `${run.tokens.toLocaleString()} tokens`,
    run.stoppedBy === 'limit' && 'stopped at its step limit',
    run.stoppedBy === 'error' && `stopped: ${run.error ?? 'an error'}`,
  ]
    .filter(Boolean)
    .join(' · ')

// How much of this project's conversations is waiting to be organized, and a way to do it now.
export const CurationStatus = ({ active }: { active: boolean }) => {
  const { running, lastRun } = useBackgroundStatus(curatorAgent.name)
  const [waiting, setWaiting] = useState<number | null>(null)
  // Counted when the tab shows and when a run ends: counting reads every conversation, so it does
  // not follow each note a run files.
  useEffect(() => {
    if (!active || running) return
    let current = true
    const count = () =>
      pendingConversations(workspaceDatabaseName()).then(
        pending => {
          if (current) setWaiting(pending.length)
        },
        cause => console.error('Unable to count conversations to organize', cause),
      )
    void count()
    return () => {
      current = false
    }
  }, [active, running])
  return (
    <div className={styles.status}>
      <p className={styles.note} role="status">
        {running
          ? 'Organizing conversations into notes…'
          : waiting === 0
            ? 'Every conversation in this project is organized.'
            : waiting === null
              ? ''
              : `${waiting === 1 ? '1 conversation' : `${waiting} conversations`} in this project waiting to be organized.`}
        {lastRun && !running && ` ${lastRunText('Last organized', lastRun)}.`}
      </p>
      <button
        type="button"
        className="secondary-button"
        disabled={running || !waiting}
        onClick={() => void runBackgroundAgent(curatorAgent, { untilDone: true })}
      >
        Organize now
      </button>
    </div>
  )
}

const runText = (label: string, run: ReturnType<typeof useBackgroundStatus>['lastRun']) =>
  run ? lastRunText(label, run) : ''

// Tidying and abstracting work on the notes themselves, when enough has changed; this runs them
// now, one after the other.
export const ReorganizeStatus = () => {
  const tidy = useBackgroundStatus(tidyAgent.name)
  const abstract = useBackgroundStatus(abstractAgent.name)
  const running = tidy.running || abstract.running
  const done = [runText('Tidied', tidy.lastRun), runText('Abstracted', abstract.lastRun)]
    .filter(Boolean)
    .join('. ')
  return (
    <div className={styles.status}>
      <p className={styles.note} role="status">
        {running
          ? tidy.running
            ? 'Tidying notes…'
            : 'Drawing abstractions from notes…'
          : done
            ? `${done}.`
            : 'Notes are tidied and abstracted when enough of them have changed.'}
      </p>
      <button
        type="button"
        className="secondary-button"
        disabled={running}
        onClick={() =>
          void runBackgroundAgent(tidyAgent).then(() => runBackgroundAgent(abstractAgent))
        }
      >
        Reorganize now
      </button>
    </div>
  )
}
