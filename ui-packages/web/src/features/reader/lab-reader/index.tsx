import type { MarkdownExtensions } from '../../../components/markdown'
import { MarkdownReader } from '../markdown-reader'
import type { TextReaderProps } from '../text-file-reader'
import { LabCodeBlock } from './code-block'
import { useLabDocument } from './document-scope'
import { remarkLabCells } from './remark-lab-cells'

const markdownOptions: MarkdownExtensions = {
  components: { pre: LabCodeBlock },
  remarkPlugins: [remarkLabCells],
}

export const LabReader = (props: TextReaderProps) => {
  const { model } = useLabDocument()
  return <MarkdownReader {...props} content={model.source} markdownOptions={markdownOptions} />
}
