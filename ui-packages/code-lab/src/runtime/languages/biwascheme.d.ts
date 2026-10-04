declare module 'biwascheme' {
  export type InterpreterInstance = {
    evaluate(source: string): unknown
  }

  export type BiwaSchemeRuntime = {
    Interpreter: new (onError: (error: unknown) => void) => InterpreterInstance
    undef?: unknown
    nil?: unknown
    to_write?: (value: unknown) => string
    define_libfunc(
      name: string,
      min: number,
      max: number,
      fn: (args: readonly unknown[]) => unknown,
    ): void
    assert_string(value: unknown): asserts value is string
    Port: {
      CustomOutput: new (write: (text: string) => void) => unknown
      current_output: unknown
    }
  }

  const runtime: BiwaSchemeRuntime
  export default runtime
}
