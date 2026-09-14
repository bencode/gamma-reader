import { javascript } from '@codemirror/lang-javascript'
import type { RefObject } from 'react'
import { CodeReader } from '../code-reader'

const javascriptExtensions = [javascript()] as const

export const P5SourceView = ({
  source,
  name,
  scrollPosition,
}: {
  source: string
  name: string
  scrollPosition: RefObject<number>
}) => {
  return (
    <CodeReader
      content={source}
      name={name}
      extensions={javascriptExtensions}
      scrollPosition={scrollPosition}
    />
  )
}
