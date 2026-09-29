import type { MouseEvent, ReactNode, Ref } from 'react'
import { projectPath, projectWindowName } from '../../core/projects'

// A blank window has just been opened for this name; any other page is the project already.
const isBlank = (target: Window) => {
  try {
    return target.location.href === 'about:blank'
  } catch (error) {
    // The tab has left for another site, whose address this page may not read.
    if (error instanceof DOMException && error.name === 'SecurityError') return true
    throw error
  }
}

// Following the link itself would load the project again in a tab that already has it open,
// stopping whatever that tab was doing. Opening the named window with no address only finds it.
const openProjectWindow = (event: MouseEvent<HTMLAnchorElement>, projectId: string) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const name = projectWindowName(projectId)
  const target = window.open('', name)
  if (!target) {
    window.open(projectPath(projectId), name)
    return
  }
  if (isBlank(target)) target.location.replace(projectPath(projectId))
  target.focus()
}

export const ProjectLink = ({
  projectId,
  className,
  title,
  ref,
  children,
}: {
  projectId: string
  className?: string
  title?: string
  ref?: Ref<HTMLAnchorElement>
  children: ReactNode
}) => (
  <a
    ref={ref}
    className={className}
    href={projectPath(projectId)}
    target={projectWindowName(projectId)}
    title={title}
    onClick={event => openProjectWindow(event, projectId)}
  >
    {children}
  </a>
)
