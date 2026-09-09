import { createContext, type ReactNode, useContext } from 'react'
import { useLocalTools } from '../../shell/workspace-context'
import { useConversation } from './use-conversation'

const ConversationContext = createContext<ReturnType<typeof useConversation> | null>(null)

export const ConversationProvider = ({ children }: { children: ReactNode }) => {
  const conversation = useConversation(useLocalTools())
  return (
    <ConversationContext.Provider value={conversation}>{children}</ConversationContext.Provider>
  )
}

export const useReaderConversation = () => {
  const value = useContext(ConversationContext)
  if (!value) throw new Error('A ConversationProvider is required.')
  return value
}
