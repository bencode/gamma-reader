import type { CodeLabExecutionResult, CodeLabOutput } from '../../types'
import type { LanguageRuntime, RuntimeProgress } from '../protocol'

const pyodideVersion = '314.0.7'
const pyodideBaseUrl = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`

type PyProxy = {
  toJs(options: { dict_converter: typeof Object.fromEntries }): unknown
  destroy(): void
}

type PythonExecutor = {
  (source: string): Promise<PyProxy>
  destroy(): void
}

type Pyodide = {
  loadPackagesFromImports(
    source: string,
    options: { messageCallback: (message: string) => void },
  ): Promise<void>
  runPython(source: string): unknown
  globals: {
    get(name: string): unknown
  }
}

type PyodideModule = {
  loadPyodide(options: { indexURL: string }): Promise<Pyodide>
}

type PythonResult = {
  stdout: string
  stderr: string
  valueText: string | null
  valueHtml: string | null
  imagePngBase64: string | null
  error: string | null
}

let pyodide: Pyodide | null = null
let initialization: Promise<Pyodide> | null = null

const pythonExecutor = `
import base64
import io
import sys
import traceback
from pyodide.code import eval_code_async

_gamma_lab_globals = {'__name__': '__main__'}

async def _gamma_lab_execute(source):
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    previous_stdout, previous_stderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = stdout_buffer, stderr_buffer
    result = {
        'stdout': '',
        'stderr': '',
        'valueText': None,
        'valueHtml': None,
        'imagePngBase64': None,
        'error': None,
    }

    try:
        value = await eval_code_async(source, globals=_gamma_lab_globals, filename='<cell>')
        if value is not None:
            if hasattr(value, 'to_html') and hasattr(value, 'columns'):
                try:
                    result['valueHtml'] = value.to_html(
                        max_rows=20,
                        max_cols=12,
                        classes='code-lab-dataframe',
                    )
                except Exception:
                    traceback.print_exc(file=sys.stderr)
                    result['valueText'] = repr(value)
            else:
                result['valueText'] = repr(value)

        try:
            import matplotlib.pyplot as plt
            import warnings
            from matplotlib import MatplotlibDeprecationWarning
            figures = [plt.figure(number) for number in plt.get_fignums()]
            try:
                if figures:
                    buffer = io.BytesIO()
                    with warnings.catch_warnings():
                        warnings.simplefilter('ignore', MatplotlibDeprecationWarning)
                        figures[-1].savefig(buffer, format='png', bbox_inches='tight', dpi=110)
                    result['imagePngBase64'] = base64.b64encode(buffer.getvalue()).decode()
            finally:
                plt.close('all')
        except ImportError:
            pass
    except Exception:
        result['error'] = traceback.format_exc()
    finally:
        sys.stdout, sys.stderr = previous_stdout, previous_stderr
        result['stdout'] = stdout_buffer.getvalue()
        result['stderr'] = stderr_buffer.getvalue()

    return result
`

const requireString = (value: unknown): string => (typeof value === 'string' ? value : '')

const optionalString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const normalizePythonResult = (value: unknown): PythonResult => {
  const record =
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    stdout: requireString(record.stdout),
    stderr: requireString(record.stderr),
    valueText: optionalString(record.valueText),
    valueHtml: optionalString(record.valueHtml),
    imagePngBase64: optionalString(record.imagePngBase64),
    error: optionalString(record.error),
  }
}

const executePython = async (runtime: Pyodide, source: string): Promise<PyProxy> => {
  const execute = runtime.globals.get('_gamma_lab_execute') as PythonExecutor
  try {
    return await execute(source)
  } finally {
    execute.destroy()
  }
}

const initialize = async (progress: RuntimeProgress): Promise<Pyodide> => {
  if (pyodide) return pyodide
  if (initialization) return initialization

  initialization = (async () => {
    progress('Downloading Python runtime…')
    const module = (await import(
      /* @vite-ignore */ `${pyodideBaseUrl}pyodide.mjs`
    )) as PyodideModule
    progress('Initializing Pyodide…')
    const runtime = await module.loadPyodide({ indexURL: pyodideBaseUrl })
    runtime.runPython("import os; os.environ['MPLBACKEND'] = 'AGG'")
    runtime.runPython(pythonExecutor)
    pyodide = runtime
    return runtime
  })()

  try {
    return await initialization
  } catch (error) {
    initialization = null
    throw error
  }
}

const runPython = async (
  source: string,
  progress: RuntimeProgress,
): Promise<CodeLabExecutionResult> => {
  const runtime = await initialize(progress)
  progress('Resolving Python packages…')
  try {
    await runtime.loadPackagesFromImports(source, { messageCallback: progress })
  } catch (error) {
    console.error('Pyodide could not preload one or more imported packages', error)
  }

  progress('Running Python…', 'running')
  const proxy = await executePython(runtime, source)
  let rawResult: unknown
  try {
    rawResult = proxy.toJs({ dict_converter: Object.fromEntries })
  } finally {
    proxy.destroy()
  }

  const result = normalizePythonResult(rawResult)
  const outputs: CodeLabOutput[] = []
  if (result.stdout) outputs.push({ kind: 'stdout', text: result.stdout })
  if (result.stderr) outputs.push({ kind: 'stderr', text: result.stderr })
  if (result.valueText) outputs.push({ kind: 'text', text: result.valueText })
  if (result.valueHtml) outputs.push({ kind: 'html', html: result.valueHtml })
  if (result.imagePngBase64) {
    outputs.push({ kind: 'image', mediaType: 'image/png', base64: result.imagePngBase64 })
  }
  return { outputs, error: result.error }
}

export const pythonRuntime: LanguageRuntime = { run: runPython }
