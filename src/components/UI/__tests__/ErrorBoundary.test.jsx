import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

// A component that throws on render
function ThrowingChild({ message }) {
  throw new Error(message)
}

// A component that renders normally
function NormalChild() {
  return <div>All good</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React 19 surfaces uncaught errors through console.error; suppress them
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children normally when no error', () => {
    render(
      <ErrorBoundary>
        <NormalChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('shows error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="test failure" />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows the error message', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="disk is on fire" />
      </ErrorBoundary>
    )
    expect(screen.getByText('disk is on fire')).toBeInTheDocument()
  })

  it('Reload App button has type="button"', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="oops" />
      </ErrorBoundary>
    )
    const btn = screen.getByRole('button', { name: /reload app/i })
    expect(btn).toHaveAttribute('type', 'button')
  })
})
