import type { ConversationTokenUsage } from '../token-usage'
import styles from './style.module.scss'

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const exact = new Intl.NumberFormat('en-US')
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })

export const TokenUsageStatus = ({
  usage: { context, contextWindow, used, input, output },
}: {
  usage: ConversationTokenUsage
}) => {
  const size = contextWindow
    ? `${compact.format(context)} / ${compact.format(contextWindow)}`
    : compact.format(context)
  const details = [
    contextWindow
      ? `Context: ${exact.format(context)} of ${exact.format(contextWindow)} tokens (${percent.format(context / contextWindow)})`
      : `Context: ${exact.format(context)} tokens`,
    `Used in this conversation: ${exact.format(used)} tokens (${exact.format(input)} input, ${exact.format(output)} output)`,
  ].join('\n')
  return (
    <span className={styles.usage} title={details}>
      {size} · {compact.format(used)} used
    </span>
  )
}
