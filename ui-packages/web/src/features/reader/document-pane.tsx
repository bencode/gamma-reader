import * as Tabs from '@radix-ui/react-tabs'
import { Activity, type ComponentProps, Suspense, useEffect, useState } from 'react'
import { FilePreview } from './file-preview'

export const DocumentPane = (props: ComponentProps<typeof FilePreview>) => {
  const { active, document, textReader } = props
  const [visited, setVisited] = useState(active)
  useEffect(() => {
    if (active) setVisited(true)
  }, [active])

  const Scope = textReader?.Scope
  if (Scope && !active && !visited) return null
  const content = (
    <Activity mode={active ? 'visible' : 'hidden'}>
      <Tabs.Content value={document.id} className="document-pane" forceMount>
        <FilePreview {...props} />
      </Tabs.Content>
    </Activity>
  )
  if (!Scope) return content
  return (
    <Suspense fallback={active ? <div className="preview-state">Opening lab…</div> : null}>
      <Scope fileId={document.id}>{content}</Scope>
    </Suspense>
  )
}
