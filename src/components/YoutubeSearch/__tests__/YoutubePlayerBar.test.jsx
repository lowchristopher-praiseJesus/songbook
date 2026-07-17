import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { YoutubePlayerBar } from '../YoutubePlayerBar'

function renderIt(props = {}) {
  return render(
    <YoutubePlayerBar
      videoId="abc12345678"
      label="El Shaddai — Amy Grant"
      minimized={false}
      hasResults={false}
      onMinimize={vi.fn()}
      onExpand={vi.fn()}
      onSearchAgain={vi.fn()}
      onBackToResults={vi.fn()}
      onRemove={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  )
}

describe('YoutubePlayerBar', () => {
  it('renders the iframe pointed at the given video in the full-modal variant', () => {
    renderIt()
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src', 'https://www.youtube.com/embed/abc12345678',
    )
  })

  it('shows dialog controls in the full-modal variant', () => {
    renderIt()
    expect(screen.getByRole('button', { name: /^Search again/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open on YouTube/i })).toHaveAttribute(
      'href', 'https://www.youtube.com/watch?v=abc12345678',
    )
    expect(screen.getByRole('button', { name: /minimize/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument()
  })

  it('hides "Back to results" in the full-modal variant when hasResults is false', () => {
    renderIt({ hasResults: false })
    expect(screen.queryByRole('button', { name: /Back to results/i })).not.toBeInTheDocument()
  })

  it('shows "Back to results" in the full-modal variant when hasResults is true', () => {
    renderIt({ hasResults: true })
    expect(screen.getByRole('button', { name: /Back to results/i })).toBeInTheDocument()
  })

  it('calls onMinimize when the minimize button is clicked', () => {
    const onMinimize = vi.fn()
    renderIt({ onMinimize })
    fireEvent.click(screen.getByRole('button', { name: /minimize/i }))
    expect(onMinimize).toHaveBeenCalledOnce()
  })

  it('calls onClose when the modal close button is clicked', () => {
    const onClose = vi.fn()
    renderIt({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onSearchAgain and onBackToResults from the full-modal variant', () => {
    const onSearchAgain = vi.fn()
    const onBackToResults = vi.fn()
    renderIt({ hasResults: true, onSearchAgain, onBackToResults })
    fireEvent.click(screen.getByRole('button', { name: /Back to results/i }))
    expect(onBackToResults).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /^Search again/i }))
    expect(onSearchAgain).toHaveBeenCalledOnce()
  })

  it('renders the label and Expand/Close controls in the minimized variant, without dialog controls', () => {
    renderIt({ minimized: true })
    expect(screen.getByText(/El Shaddai — Amy Grant/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Expand$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Search again/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open on YouTube/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /minimize/i })).not.toBeInTheDocument()
  })

  it('falls back to "YouTube" when label is empty', () => {
    renderIt({ minimized: true, label: '' })
    expect(screen.getByText(/YouTube/)).toBeInTheDocument()
  })

  it('calls onExpand when Expand is clicked in the minimized variant', () => {
    const onExpand = vi.fn()
    renderIt({ minimized: true, onExpand })
    fireEvent.click(screen.getByRole('button', { name: /^Expand$/i }))
    expect(onExpand).toHaveBeenCalledOnce()
  })

  it('calls onClose when Close is clicked in the minimized variant', () => {
    const onClose = vi.fn()
    renderIt({ minimized: true, onClose })
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps the exact same iframe DOM node mounted when toggling minimized', () => {
    const { rerender } = renderIt({ minimized: false })
    const iframeBefore = screen.getByTitle('YouTube video player')

    rerender(
      <YoutubePlayerBar
        videoId="abc12345678"
        label="El Shaddai — Amy Grant"
        minimized
        hasResults={false}
        onMinimize={vi.fn()}
        onExpand={vi.fn()}
        onSearchAgain={vi.fn()}
        onBackToResults={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const iframeAfterMinimize = screen.getByTitle('YouTube video player')
    expect(iframeAfterMinimize).toBe(iframeBefore)

    rerender(
      <YoutubePlayerBar
        videoId="abc12345678"
        label="El Shaddai — Amy Grant"
        minimized={false}
        hasResults={false}
        onMinimize={vi.fn()}
        onExpand={vi.fn()}
        onSearchAgain={vi.fn()}
        onBackToResults={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const iframeAfterExpand = screen.getByTitle('YouTube video player')
    expect(iframeAfterExpand).toBe(iframeBefore)
  })

  it('shows a Remove button in the full-modal variant and calls onRemove when clicked', () => {
    const onRemove = vi.fn()
    renderIt({ onRemove })
    fireEvent.click(screen.getByRole('button', { name: /Remove/i }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('hides the Remove button when onRemove is not provided', () => {
    renderIt({ onRemove: undefined })
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument()
  })

  it('hides the Remove button in the minimized variant', () => {
    renderIt({ minimized: true })
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument()
  })

  it('closes on Escape in the full-modal variant', () => {
    const onClose = vi.fn()
    renderIt({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close on Escape in the minimized variant', () => {
    const onClose = vi.fn()
    renderIt({ minimized: true, onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
