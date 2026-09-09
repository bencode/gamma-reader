import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from './markdown'

const { draw } = vi.hoisted(() => ({ draw: vi.fn() }))
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: draw } }))
beforeEach(() => {
  draw.mockReset()
  draw.mockResolvedValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Diagram</text></svg>',
  })
})

describe('shared Markdown', () => {
  it.each(['reader', 'chat'] as const)('renders four formula delimiters in %s', variant => {
    const { container } = render(
      <Markdown
        variant={variant}
        text={String.raw`Inline $E=mc^2$ and \(e^{i\pi}+1=0\).

$$\int_0^1 x\,dx = \frac12$$

\[\begin{pmatrix}a&b\\c&d\end{pmatrix}\]`}
      />,
    )
    expect(container.querySelectorAll('.katex')).toHaveLength(4)
    expect(container.querySelectorAll('.katex-display')).toHaveLength(2)
    expect(container.querySelectorAll('.katex-error')).toHaveLength(0)
    expect(container.querySelector('[data-math-source]')).toHaveAttribute(
      'data-math-source',
      'E=mc^2',
    )
  })

  it('preserves code and highlights only recognized language fences', () => {
    const text =
      'Inline ``f\\(x\\) `$a$` ``\n\n```typescript\nconst formula = "$$x$$"\n```\n\n~~~unknown-language\n\\[x\\]\n~~~\n\n```text\n$$unfinished code'
    const { container } = render(<Markdown variant="chat" text={text} />)
    expect(container.querySelector('.katex')).toBeNull()
    expect(container.querySelector('.hljs-keyword')).toHaveTextContent('const')
    expect(container.querySelector('code')).toHaveTextContent('f\\(x\\) `$a$`')
    expect(container.querySelector('.language-unknown-language')).toHaveTextContent('\\[x\\]')
    expect(container.querySelector('.language-text')).toHaveTextContent('$$unfinished code')
  })

  it('keeps incomplete formulas readable and renders completed streamed content', () => {
    const view = render(<Markdown variant="chat" text={'Before\n\n$$\n\\frac{1}'} />)
    expect(view.container.querySelector('.katex')).toBeNull()
    expect(view.container).toHaveTextContent('$$')
    view.rerender(<Markdown variant="chat" text={'Before\n\n$$\n\\frac{1}{2}\n$$\n\nAfter'} />)
    expect(view.container.querySelectorAll('.katex-display')).toHaveLength(1)
    expect(view.container).toHaveTextContent('After')
    view.rerender(<Markdown variant="chat" text={'$\\notACommand{a}$\n\nStill readable'} />)
    expect(view.container).toHaveTextContent('\\notACommand')
    expect(view.container).toHaveTextContent('Still readable')
  })

  it('renders a completed Mermaid fence, retains source on failure, and ignores incomplete fences', async () => {
    const view = render(<Markdown variant="reader" text={'```mermaid\nflowchart LR\nA --> B'} />)
    expect(draw).not.toHaveBeenCalled()
    expect(view.container.querySelector('pre')).toHaveTextContent('A --> B')
    view.rerender(<Markdown variant="reader" text={'```mermaid\nflowchart LR\nA --> B\n```'} />)
    expect(await screen.findByRole('img', { name: 'Mermaid diagram' })).toHaveAttribute(
      'src',
      expect.stringContaining('data:image/svg+xml'),
    )
    expect(draw).toHaveBeenCalledWith(
      expect.any(String),
      'flowchart LR\nA --> B',
      expect.any(HTMLElement),
    )
    expect(view.container.querySelector('[data-diagram-source]')).toHaveAttribute(
      'data-diagram-source',
      'flowchart LR\nA --> B',
    )
    const report = vi.spyOn(console, 'warn').mockImplementation(() => {})
    draw.mockRejectedValueOnce(new Error('Invalid diagram'))
    view.rerender(<Markdown variant="reader" text={'```mermaid\ninvalid diagram\n```'} />)
    await waitFor(() => expect(report).toHaveBeenCalled())
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(view.container.querySelector('code')).toHaveTextContent('invalid diagram')
    expect(document.querySelector('[style*="-10000px"]')).not.toBeInTheDocument()
  })

  it('preserves a completed diagram while the surrounding message streams', async () => {
    const text = '```mermaid\nflowchart LR\nA --> B\n```'
    const view = render(<Markdown variant="chat" text={text} />)
    const diagram = await screen.findByRole('img', { name: 'Mermaid diagram' })
    view.rerender(<Markdown variant="chat" text={`${text}\n\nMore explanation`} />)
    expect(screen.getByRole('img', { name: 'Mermaid diagram' })).toBe(diagram)
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('does not replace a new diagram with an older asynchronous result', async () => {
    let resolveOld: (value: { svg: string }) => void = () => {
      throw new Error('Render has not started')
    }
    draw.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve
        }),
    )
    const view = render(<Markdown variant="chat" text={'```mermaid\nflowchart LR\nA --> B\n```'} />)
    await waitFor(() => expect(draw).toHaveBeenCalledTimes(1))
    view.rerender(<Markdown variant="chat" text={'```mermaid\nflowchart LR\nC --> D\n```'} />)
    const diagram = await screen.findByRole('img', { name: 'Mermaid diagram' })
    const current = diagram.getAttribute('src')
    resolveOld({ svg: '<svg>Old</svg>' })
    await waitFor(() =>
      expect(document.querySelector('[style*="-10000px"]')).not.toBeInTheDocument(),
    )
    expect(diagram).toHaveAttribute('src', current)
  })

  it('keeps external content inert while preserving normal Markdown links', () => {
    const { container } = render(
      <Markdown
        variant="chat"
        text={
          '<script>alert(1)</script>\n\n[Link](https://example.test)\n\n![Photo](https://example.test/image.png)\n\n$\\href{javascript:alert(1)}{click}$'
        }
      />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(container.querySelector('[href^="javascript:"]')).toBeNull()
  })
})
