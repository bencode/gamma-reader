import { useMemo } from 'react'
import { P5Reader } from '../../components/p5-reader'
import { useReaderBinding } from '../../shell/workspace-context'
import type { TextReaderProps } from './text-file-reader'

export const P5FileReader = ({ document, content, active }: TextReaderProps) => {
  const binding = useMemo(
    () => ({
      fileId: document.id,
      getViewport: () => null,
    }),
    [document.id],
  )
  useReaderBinding(binding, active)
  return <P5Reader name={document.name} source={content} active={active} />
}
