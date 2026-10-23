import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Tabs from '@radix-ui/react-tabs'
import { X } from 'lucide-react'
import { type DragEvent, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { OpenDocuments } from './open-documents'
import styles from './style.module.scss'
import type { DocumentTabItem } from './types'

type DocumentTabBarProps = {
  items: readonly DocumentTabItem[]
  activeId: string | null
  activeTriggerRef: RefObject<HTMLButtonElement | null>
  onSelect: (id: string) => void
  onRequestClose: (ids: readonly string[]) => void
  onMove: (id: string, before: string | null) => void
}

// A dragged tab carries a type of its own, so nothing else on the page takes it as a drop.
const tabType = 'application/x-gamma-reader-tab'

type DropSide = 'before' | 'after'
type DropTarget = { id: string; side: DropSide }

const tabAt = (target: EventTarget) =>
  target instanceof Element ? target.closest<HTMLElement>('[data-tab-id]') : null

type DocumentTabProps = {
  item: DocumentTabItem
  index: number
  items: readonly DocumentTabItem[]
  active: boolean
  stripRef: RefObject<HTMLDivElement | null>
  activeTriggerRef: RefObject<HTMLButtonElement | null>
  dragged: boolean
  dropSide: DropSide | undefined
  onRequestClose: (ids: readonly string[]) => void
}

const DocumentTab = ({
  item,
  index,
  items,
  active,
  stripRef,
  activeTriggerRef,
  dragged,
  dropSide,
  onRequestClose,
}: DocumentTabProps) => {
  const tabRef = useRef<HTMLDivElement>(null)
  const menuOrigin = useRef<HTMLElement | null>(null)
  const menuAction = useRef(false)

  useLayoutEffect(() => {
    const strip = stripRef.current
    const tab = tabRef.current
    if (!active || !strip || !tab) return
    const viewport = strip.getBoundingClientRect()
    const bounds = tab.getBoundingClientRect()
    if (bounds.left < viewport.left) strip.scrollLeft += bounds.left - viewport.left
    else if (bounds.right > viewport.right) strip.scrollLeft += bounds.right - viewport.right
  }, [active, stripRef])

  const requestClose = (ids: readonly string[]) => {
    menuAction.current = true
    onRequestClose(ids)
  }

  return (
    <ContextMenu.Root
      onOpenChange={open => {
        if (!open) return
        menuOrigin.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        menuAction.current = false
      }}
    >
      <ContextMenu.Trigger
        asChild
        onKeyDown={event => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
          event.preventDefault()
          const { left, bottom } = event.currentTarget.getBoundingClientRect()
          event.currentTarget.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: left,
              clientY: bottom,
            }),
          )
        }}
      >
        <div
          ref={tabRef}
          className={styles.tab}
          data-tab-id={item.id}
          data-active={active}
          data-dragged={dragged}
          data-drop={dropSide}
          draggable
        >
          <Tabs.Trigger
            className={styles.trigger}
            value={item.id}
            title={item.title}
            ref={active ? activeTriggerRef : undefined}
          >
            <span className={styles.name}>{item.label}</span>
            {item.dirty && (
              <span className="source-dirty" role="img" aria-label="Unsaved changes">
                ●
              </span>
            )}
          </Tabs.Trigger>
          <button
            type="button"
            className={`${styles.close} icon-button`}
            aria-label={`Close ${item.title}`}
            onClick={() => onRequestClose([item.id])}
          >
            <X size={13} />
          </button>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={styles.menu}
          onCloseAutoFocus={event => {
            event.preventDefault()
            if (!menuAction.current && menuOrigin.current?.isConnected)
              menuOrigin.current.focus({ preventScroll: true })
          }}
        >
          <ContextMenu.Item className={styles.menuItem} onSelect={() => requestClose([item.id])}>
            Close
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.menuItem}
            disabled={items.length < 2}
            onSelect={() =>
              requestClose(items.filter(tab => tab.id !== item.id).map(tab => tab.id))
            }
          >
            Close others
          </ContextMenu.Item>
          <ContextMenu.Item
            className={styles.menuItem}
            disabled={index === items.length - 1}
            onSelect={() => requestClose(items.slice(index + 1).map(tab => tab.id))}
          >
            Close to the right
          </ContextMenu.Item>
          <ContextMenu.Separator className={styles.separator} />
          <ContextMenu.Item
            className={styles.menuItem}
            onSelect={() => requestClose(items.map(tab => tab.id))}
          >
            Close all
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

export const DocumentTabBar = ({
  items,
  activeId,
  activeTriggerRef,
  onSelect,
  onRequestClose,
  onMove,
}: DocumentTabBarProps) => {
  const stripRef = useRef<HTMLDivElement>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const [target, setTarget] = useState<DropTarget | null>(null)
  const endDrag = () => {
    setDragged(null)
    setTarget(null)
  }
  // Over a tab, the drop lands on the nearer side of it; past the last tab, it lands last.
  const dropTargetAt = (event: DragEvent<HTMLElement>): DropTarget | null => {
    const tab = tabAt(event.target)
    const id = tab?.dataset.tabId ?? items.at(-1)?.id
    if (!id || id === dragged) return null
    if (!tab) return { id, side: 'after' }
    const { left, width } = tab.getBoundingClientRect()
    return { id, side: event.clientX < left + width / 2 ? 'before' : 'after' }
  }

  return (
    <div className={styles.bar}>
      <Tabs.List
        ref={stripRef}
        className={styles.strip}
        aria-label="Open documents"
        onDragStart={event => {
          const id = tabAt(event.target)?.dataset.tabId
          if (!id) return
          event.dataTransfer.setData(tabType, id)
          event.dataTransfer.effectAllowed = 'move'
          setDragged(id)
        }}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes(tabType)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          const next = dropTargetAt(event)
          setTarget(current =>
            current && next && current.id === next.id && current.side === next.side
              ? current
              : next,
          )
        }}
        onDragLeave={event => {
          const next = event.relatedTarget
          if (!(next instanceof Node && event.currentTarget.contains(next))) setTarget(null)
        }}
        onDrop={event => {
          if (!event.dataTransfer.types.includes(tabType)) return
          event.preventDefault()
          const target = dropTargetAt(event)
          if (dragged && target) {
            const index =
              items.findIndex(item => item.id === target.id) + (target.side === 'after' ? 1 : 0)
            onMove(dragged, items[index]?.id ?? null)
          }
          endDrag()
        }}
        onDragEnd={endDrag}
      >
        {items.map((item, index) => (
          <DocumentTab
            key={item.id}
            item={item}
            index={index}
            items={items}
            active={activeId === item.id}
            stripRef={stripRef}
            activeTriggerRef={activeTriggerRef}
            dragged={dragged === item.id}
            dropSide={target?.id === item.id ? target.side : undefined}
            onRequestClose={onRequestClose}
          />
        ))}
      </Tabs.List>
      <OpenDocuments items={items} activeId={activeId} onSelect={onSelect} />
    </div>
  )
}
