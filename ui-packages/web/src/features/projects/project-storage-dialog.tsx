import { useEffect, useState } from 'react'
import { ConfirmationDialog as Modal } from '../../components/confirmation-dialog'
import { formatBytes, maximumLibraryBytes } from '../../core/files'
import type { Project } from '../../core/projects'
import {
  type BrowserStorage,
  readStorageSummary,
  type StorageSummary,
} from '../../data/storage-summary'
import styles from './style.module.scss'

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
// A fresh library is a sliver of the quota; rounding it to 0% would read as nothing stored.
const share = (ratio: number) => (ratio < 0.001 ? 'under 0.1%' : percent.format(ratio))

const BrowserStorageNote = ({ usage, quota, persisted }: BrowserStorage) => (
  <p>
    This browser, all projects: {formatBytes(usage)} used
    {quota > 0 && `, ${share(usage / quota)} of what it allows`}.{' '}
    {persisted
      ? 'Storage is persistent.'
      : 'Storage is not persistent; the browser may clear it under disk pressure.'}
  </p>
)

export const ProjectStorageDialog = ({
  project,
  onClose,
}: {
  project: Project
  onClose: () => void
}) => {
  const [summary, setSummary] = useState<StorageSummary | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    readStorageSummary().then(
      result => {
        if (current) setSummary(result)
      },
      cause => {
        console.error('Unable to read project storage', cause)
        if (current) setFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [])
  return (
    <Modal label={`${project.name} storage`} onCancel={onClose}>
      <h2>{project.name} storage</h2>
      {failed && <p role="alert">Unable to read this project's storage.</p>}
      {summary && (
        <>
          <dl className={styles.storage}>
            <dt>Database</dt>
            <dd>{summary.databaseName}</dd>
            <dt>Library</dt>
            <dd>
              {formatBytes(summary.fileBytes)} of {maximumLibraryBytes / 1024 ** 3} GiB
            </dd>
          </dl>
          <table className={styles.stores}>
            <thead>
              <tr>
                <th scope="col">Table</th>
                <th scope="col">Records</th>
              </tr>
            </thead>
            <tbody>
              {summary.stores.map(store => (
                <tr key={store.name}>
                  <td>{store.name}</td>
                  <td>{store.records.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.browser && <BrowserStorageNote {...summary.browser} />}
        </>
      )}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
