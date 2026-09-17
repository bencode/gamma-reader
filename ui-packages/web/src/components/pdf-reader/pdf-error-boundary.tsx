import { Component, type ErrorInfo, type ReactNode } from 'react'

type PdfErrorBoundaryProps = {
  source: string
  pageNumber?: number
  children: ReactNode
  fallback: ReactNode
  onError: () => void
}

type PdfErrorBoundaryState = {
  source: string
  pageNumber?: number
  failed: boolean
}

export class PdfErrorBoundary extends Component<PdfErrorBoundaryProps, PdfErrorBoundaryState> {
  override state: PdfErrorBoundaryState = {
    source: this.props.source,
    pageNumber: this.props.pageNumber,
    failed: false,
  }

  static getDerivedStateFromProps(props: PdfErrorBoundaryProps, state: PdfErrorBoundaryState) {
    return props.source !== state.source || props.pageNumber !== state.pageNumber
      ? { source: props.source, pageNumber: props.pageNumber, failed: false }
      : null
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unable to display PDF', error, info.componentStack)
    this.props.onError()
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
