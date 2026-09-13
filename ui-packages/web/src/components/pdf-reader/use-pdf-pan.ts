import type { PointerEventHandler } from 'react'
import { useEffect, useRef, useState } from 'react'

type DragOrigin = {
  pointerId: number
  clientX: number
  clientY: number
  scrollLeft: number
  scrollTop: number
}

export const usePdfPan = (enabled: boolean) => {
  const originRef = useRef<DragOrigin | undefined>(undefined)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (enabled) return
    originRef.current = undefined
    setDragging(false)
  }, [enabled])

  const onPointerDown: PointerEventHandler<HTMLDivElement> = event => {
    if (!enabled || event.pointerType !== 'mouse' || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    originRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    }
    setDragging(true)
  }

  const onPointerMove: PointerEventHandler<HTMLDivElement> = event => {
    const origin = originRef.current
    if (!origin || event.pointerId !== origin.pointerId) return
    event.preventDefault()
    event.currentTarget.scrollLeft = origin.scrollLeft + origin.clientX - event.clientX
    event.currentTarget.scrollTop = origin.scrollTop + origin.clientY - event.clientY
  }

  const endDrag: PointerEventHandler<HTMLDivElement> = event => {
    const origin = originRef.current
    if (!origin || event.pointerId !== origin.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    originRef.current = undefined
    setDragging(false)
  }

  return {
    dragging,
    bindings: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
