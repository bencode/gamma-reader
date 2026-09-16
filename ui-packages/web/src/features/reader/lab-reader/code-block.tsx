import { CodeCell } from '@gamma-reader/code-lab'
import type { Components } from 'react-markdown'
import { MarkdownCodeBlock } from '../../../components/markdown'
import { useLabDocument } from './document-scope'
import styles from './style.module.scss'

export const LabCodeBlock: NonNullable<Components['pre']> = ({ node, children, ...props }) => {
  const { model, editError } = useLabDocument()
  const code = node?.children.find(child => child.type === 'element' && child.tagName === 'code')
  const id = code?.type === 'element' ? code.properties.dataLabCellId : undefined
  const error = code?.type === 'element' ? code.properties.dataLabError : undefined
  if (typeof id === 'string' && model.cells.some(cell => cell.id === id)) {
    return (
      <div className={styles.cell} data-lab-cell={id}>
        <CodeCell key={id} cellId={id} />
        {editError?.cellId === id && (
          <p className={styles.error} role="alert">
            {editError.message}
          </p>
        )}
      </div>
    )
  }
  return (
    <>
      <MarkdownCodeBlock {...props}>{children}</MarkdownCodeBlock>
      {typeof error === 'string' && (
        <p className={styles.error} role="status">
          {error}
        </p>
      )}
    </>
  )
}
