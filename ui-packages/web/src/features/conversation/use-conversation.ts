import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createReaderAgent, loadAgentConfig } from '../../core/agent/runtime'
import type { LocalTools } from '../../core/local-tools'

type ToolStatus = 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Stopped'
export type ConversationMessage = {
  id: number
  role: 'user' | 'assistant'
  text: string
  tools: { id: string; name: string; status: ToolStatus }[]
  notice?: string
  failed?: boolean
}
type Phase = 'connecting' | 'ready' | 'unavailable' | 'error' | 'running' | 'stopping'

const snapshot = (
  message: AgentMessage,
  id: number,
  statuses: Map<string, ToolStatus>,
): ConversationMessage[] => {
  if (message.role !== 'user' && message.role !== 'assistant') return []
  const blocks =
    typeof message.content === 'string'
      ? [{ type: 'text' as const, text: message.content }]
      : message.content
  const text = blocks.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
  const tools = blocks.flatMap(block =>
    block.type === 'toolCall'
      ? [
          {
            id: block.id,
            name: block.name,
            status: statuses.get(block.id) ?? 'Pending',
          },
        ]
      : [],
  )
  if (message.role === 'user') return [{ id, role: 'user', text, tools }]
  const notice =
    message.stopReason === 'aborted'
      ? 'Generation stopped.'
      : message.stopReason === 'error'
        ? message.errorMessage || 'Could not generate a reply. Send a message to try again.'
        : message.stopReason === 'length'
          ? 'The response reached its output limit.'
          : undefined
  return [{ id, role: 'assistant', text, tools, notice, failed: message.stopReason === 'error' }]
}

export const useConversation = (tools: LocalTools) => {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [phase, setPhase] = useState<Phase>('connecting')
  const [error, setError] = useState<string>()
  const agentRef = useRef<Agent | null>(null)
  const busy = useRef(false)
  const statuses = useRef(new Map<string, ToolStatus>())

  const refresh = useCallback((agent: Agent) => {
    const all = agent.state.streamingMessage
      ? [...agent.state.messages, agent.state.streamingMessage]
      : agent.state.messages
    setMessages(all.flatMap((message, index) => snapshot(message, index, statuses.current)))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let agent: Agent | undefined
    let unsubscribe: (() => void) | undefined
    void (async () => {
      try {
        const config = await loadAgentConfig(controller.signal)
        if (controller.signal.aborted) return
        if (!config.enabled) {
          setPhase('unavailable')
          return
        }
        agent = createReaderAgent(config, tools)
        agentRef.current = agent
        const currentAgent = agent
        unsubscribe = agent.subscribe((event, signal) => {
          if (event.type === 'tool_execution_start')
            statuses.current.set(event.toolCallId, 'Running')
          if (event.type === 'tool_execution_end')
            statuses.current.set(
              event.toolCallId,
              signal.aborted ? 'Stopped' : event.isError ? 'Failed' : 'Completed',
            )
          refresh(currentAgent)
        })
        setPhase('ready')
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Could not connect to chat.')
        setPhase('error')
      }
    })()
    return () => {
      controller.abort()
      unsubscribe?.()
      agent?.abort()
      agentRef.current = null
      busy.current = false
    }
  }, [tools, refresh])

  const send = async () => {
    const agent = agentRef.current
    const text = draft.trim()
    if (!agent || busy.current || !text) return
    busy.current = true
    setPhase('running')
    setError(undefined)
    setDraft('')
    try {
      await agent.prompt(text)
    } catch (cause) {
      if (agentRef.current === agent)
        setError(cause instanceof Error ? cause.message : 'Could not send the message.')
    } finally {
      if (agentRef.current === agent) {
        busy.current = false
        statuses.current.forEach((status, id) => {
          if (status === 'Running') statuses.current.set(id, 'Stopped')
        })
        refresh(agent)
        setPhase('ready')
      }
    }
  }

  const stop = () => {
    if (!busy.current) return
    setPhase('stopping')
    agentRef.current?.abort()
  }
  return { draft, setDraft, messages, phase, error, send, stop }
}
