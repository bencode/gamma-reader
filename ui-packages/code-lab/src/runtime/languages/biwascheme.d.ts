declare module 'biwascheme' {
  export type InterpreterInstance = {
    evaluate(source: string): unknown
  }

  export type BiwaSchemeRuntime = {
    Interpreter: new (onError: (error: unknown) => void) => InterpreterInstance
    undef?: unknown
    nil?: unknown
    to_write?: (value: unknown) => string
  }

  const runtime: BiwaSchemeRuntime
  export default runtime
}
