import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Tabs from '@radix-ui/react-tabs'
import { X } from 'lucide-react'
import { type RefObject, useLayoutEffect, useRef } from 'react'
import { OpenDocuments } from './open-documents'
import styles from './style.module.scss'

export type DocumentTabItem = { id: string; name: string; dirty: boolean }

type DocumentTabBarProps = {
  items: readonly DocumentTabItem[]
  activeId: string | null
  activeTriggerRef: RefObject<HTMLButtonElement | null>
  onSelect: (id: string) => void
  onRequestClose: (ids: readonly string[]) => void
}

type DocumentTabProps = {
  item: DocumentTabItem
  index: number
  items: readonly DocumentTabItem[]
  active: boolean
  stripRef: RefObject<HTMLDivElement | null>
  activeTriggerRef: RefObject<HTMLButtonElement | null>
  onRequestClose: (ids: readonly string[]) => void
}

const DocumentTab = ({
  item,
  index,
  items,
  active,
  stripRef,
  activeTriggerRef,
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
        <div ref={tabRef} className={styles.tab} data-active={active}>
          <Tabs.Trigger
            className={styles.trigger}
            value={item.id}
            title={item.name}
            ref={active ? activeTriggerRef : undefined}
          >
            <span className={styles.name}>{item.name}</span>
            {item.dirty && (
              <span className="source-dirty" role="img" aria-label="Unsaved changes">
                ●
              </span>
            )}
          </Tabs.Trigger>
          <button
            type="button"
            className={`${styles.close} icon-button`}
            aria-label={`Close ${item.name}`}
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
}: DocumentTabBarProps) => {
  const stripRef = useRef<HTMLDivElement>(null)

  return (
    <div className={styles.bar}>
      <Tabs.List ref={stripRef} className={styles.strip} aria-label="Open documents">
        {items.map((item, index) => (
          <DocumentTab
            key={item.id}
            item={item}
            index={index}
            items={items}
            active={activeId === item.id}
            stripRef={stripRef}
            activeTriggerRef={activeTriggerRef}
            onRequestClose={onRequestClose}
          />
        ))}
      </Tabs.List>
      <OpenDocuments items={items} activeId={activeId} onSelect={onSelect} />
    </div>
  )
}
