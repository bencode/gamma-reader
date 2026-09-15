import type { CodeLabCell, CodeLabLanguage } from '@gamma-reader/code-lab'

export type ExampleSection = Readonly<{
  language: CodeLabLanguage
  eyebrow: string
  title: string
  description: string
  cells: readonly CodeLabCell[]
}>

export const exampleSections: readonly ExampleSection[] = [
  {
    language: 'scheme',
    eyebrow: '01 · Recursion',
    title: 'Shape a small Scheme procedure',
    description: 'Definitions live in the shared Scheme interpreter, ready for the next cell.',
    cells: [
      {
        id: 'scheme-define',
        language: 'scheme',
        source: `(define (factorial n)
  (if (= n 0)
      1
      (* n (factorial (- n 1)))))`,
      },
      { id: 'scheme-use', language: 'scheme', source: '(factorial 6)' },
    ],
  },
  {
    language: 'clojure',
    eyebrow: '02 · Data',
    title: 'Transform a Clojure sequence',
    description: 'Evaluate the definition first, then use it from the following cell.',
    cells: [
      {
        id: 'clojure-define',
        language: 'clojure',
        source: `(defn fahrenheit [celsius]
  (+ 32 (* celsius 9/5)))`,
      },
      {
        id: 'clojure-use',
        language: 'clojure',
        source: '(map fahrenheit [0 10 20 30])',
      },
    ],
  },
  {
    language: 'python',
    eyebrow: '03 · Signals',
    title: 'Plot a wave with Python',
    description: 'Pyodide detects imports on demand and returns the last matplotlib figure.',
    cells: [
      {
        id: 'python-define',
        language: 'python',
        source: `import numpy as np

def wave(x, frequency=2):
    return np.sin(frequency * x)`,
      },
      {
        id: 'python-use',
        language: 'python',
        source: `import matplotlib.pyplot as plt

x = np.linspace(0, 2 * np.pi, 240)
plt.plot(x, wave(x), color="#96346b", linewidth=2)
plt.title("A small wave")
plt.grid(alpha=0.18)`,
      },
    ],
  },
  {
    language: 'typescript',
    eyebrow: '04 · Types',
    title: 'Keep TypeScript state explicit',
    description:
      'Each run gets a fresh closure; globalThis is the deliberate shared notebook state.',
    cells: [
      {
        id: 'typescript-define',
        language: 'typescript',
        source: `type LessonState = {
  scale: (values: number[]) => number[]
}

const state = globalThis as typeof globalThis & { lesson?: LessonState }
state.lesson = { scale: values => values.map(value => value * 3) }`,
      },
      {
        id: 'typescript-use',
        language: 'typescript',
        source: `type LessonState = {
  scale: (values: number[]) => number[]
}

const state = globalThis as typeof globalThis & { lesson?: LessonState }
state.lesson?.scale([2, 4, 8])`,
      },
    ],
  },
]

export const exampleCells = exampleSections.flatMap(section => section.cells)
