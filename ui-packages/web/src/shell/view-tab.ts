import type { ReactNode } from 'react'
import { MemoryPage } from '../features/memory'

// A view of the app's own, open in a tab beside documents: it holds no file and no page. Tabs,
// addresses and restoring handle every view alike, so a new one is a line in this table.
export type ViewDefinition = { label: string; Pane: (props: { active: boolean }) => ReactNode }

export const views = {
  memory: { label: 'Memory', Pane: MemoryPage },
} satisfies Record<string, ViewDefinition>

export type ViewName = keyof typeof views

// File ids are nanoids and never contain ':', so this stands apart from them as 'page:' does.
const prefix = 'view:'

const isView = (name: string): name is ViewName => Object.hasOwn(views, name)

export const viewTabId = (name: ViewName) => `${prefix}${name}`

export const viewOfTab = (id: string): ViewName | null => {
  const name = id.startsWith(prefix) ? id.slice(prefix.length) : null
  return name !== null && isView(name) ? name : null
}

export const viewPath = (name: ViewName) => `/views/${name}`

// The tab a /views address names, if that view exists.
export const viewTabOfRoute = (name: string | undefined) =>
  name !== undefined && isView(name) ? viewTabId(name) : null
