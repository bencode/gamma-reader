import { createContext, type ReactNode, useContext, useMemo } from 'react'
import type { FileLibrary } from '../resources/use-file-library'
import { useLocalTools } from '../workspace/workspace-context'
import { useConversation } from './use-conversation'

type ConversationActions = { referenceFile: (path: string) => void }

const ConversationContext = createContext<ReturnType<typeof useConversation> | null>(null)
// Never changes, so a component that only acts on the conversation does not render with it.
const ConversationActionsContext = createContext<ConversationActions | null>(null)

export const ConversationProvider = ({
  children,
  addAttachments,
}: {
  children: ReactNode
  addAttachments: FileLibrary['addAttachments']
}) => {
  const conversation = useConversation(useLocalTools(), addAttachments)
  const { referenceFile } = conversation
  const actions = useMemo(() => ({ referenceFile }), [referenceFile])
  return (
    <ConversationActionsContext.Provider value={actions}>
      <ConversationContext.Provider value={conversation}>{children}</ConversationContext.Provider>
    </ConversationActionsContext.Provider>
  )
}

export const useReaderConversation = () => {
  const value = useContext(ConversationContext)
  if (!value) throw new Error('A ConversationProvider is required.')
  return value
}

export const useConversationActions = () => {
  const value = useContext(ConversationActionsContext)
  if (!value) throw new Error('A ConversationProvider is required.')
  return value
}
