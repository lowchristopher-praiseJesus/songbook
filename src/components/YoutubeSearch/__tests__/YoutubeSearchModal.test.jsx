import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/storage', () => ({ getFirecrawlKey: () => 'KEY' }))
vi.mock('../../../lib/youtubeImport/youtubeClient', async () => {
  const actual = await vi.importActual('../../../lib/youtubeImport/youtubeClient')
  return { ...actual, searchYoutube: vi.fn() }
})

import { searchYoutube } from '../../../lib/youtubeImport/youtubeClient'
import { YoutubeSearchModal } from '../YoutubeSearchModal'

function renderIt(props = {}) {
  return render(
    <YoutubeSearchModal
      isOpen
      onClose={vi.fn()}
      title="El Shaddai"
      artist="Amy Grant"
      initialVideoId={undefined}
      onVideoPicked={vi.fn()}
      {...props}
    />,
  )
}

describe('YoutubeSearchModal', () => {
  beforeEach(() => {
    searchYoutube.mockReset()
  })

  it('pre-fills the search box with title and artist when there is no prior pick', () => {
    renderIt()
    expect(screen.getByPlaceholderText(/paste a YouTube link/i)).toHaveValue('El Shaddai Amy Grant')
  })

  it('opens directly to playback when initialVideoId is already set', () => {
    renderIt({ initialVideoId: 'abc12345678' })
    const iframe = screen.getByTitle('YouTube video player')
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/abc12345678')
    expect(screen.queryByPlaceholderText(/paste a YouTube link/i)).not.toBeInTheDocument()
  })

  it('shows results after searching', async () => {
    searchYoutube.mockResolvedValue([
      { videoId: 'abc12345678', title: 'El Shaddai (Live)', url: 'https://www.youtube.com/watch?v=abc12345678' },
    ])
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText('El Shaddai (Live)')
    expect(searchYoutube).toHaveBeenCalledWith('El Shaddai Amy Grant', 'KEY')
  })

  it('clicking a result embeds it and calls onVideoPicked', async () => {
    searchYoutube.mockResolvedValue([
      { videoId: 'abc12345678', title: 'El Shaddai (Live)', url: 'https://www.youtube.com/watch?v=abc12345678' },
    ])
    const onVideoPicked = vi.fn()
    renderIt({ onVideoPicked })
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    const row = await screen.findByText('El Shaddai (Live)')
    fireEvent.click(row)
    expect(onVideoPicked).toHaveBeenCalledWith('abc12345678')
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src', 'https://www.youtube.com/embed/abc12345678',
    )
  })

  it('plays a pasted YouTube watch link directly without searching', async () => {
    const onVideoPicked = vi.fn()
    searchYoutube.mockResolvedValue([])
    renderIt({ onVideoPicked })
    const input = screen.getByPlaceholderText(/paste a YouTube link/i)
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=direct12345' } })
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))

    expect(searchYoutube).not.toHaveBeenCalled()
    expect(onVideoPicked).toHaveBeenCalledWith('direct12345')
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src', 'https://www.youtube.com/embed/direct12345',
    )
  })

  it('plays a youtu.be short link directly without searching', async () => {
    const onVideoPicked = vi.fn()
    searchYoutube.mockResolvedValue([])
    renderIt({ onVideoPicked })
    const input = screen.getByPlaceholderText(/paste a YouTube link/i)
    fireEvent.change(input, { target: { value: 'https://youtu.be/short123456' } })
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))

    expect(searchYoutube).not.toHaveBeenCalled()
    expect(onVideoPicked).toHaveBeenCalledWith('short123456')
  })

  it('falls back to search when the input is not a YouTube link', async () => {
    searchYoutube.mockResolvedValue([
      { videoId: 'abc12345678', title: 'El Shaddai (Live)', url: 'https://www.youtube.com/watch?v=abc12345678' },
    ])
    renderIt()
    const input = screen.getByPlaceholderText(/paste a YouTube link/i)
    fireEvent.change(input, { target: { value: 'El Shaddai Amy Grant' } })
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText('El Shaddai (Live)')
    expect(searchYoutube).toHaveBeenCalledWith('El Shaddai Amy Grant', 'KEY')
  })

  it('shows "No videos found" for an empty result set', async () => {
    searchYoutube.mockResolvedValue([])
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText(/No videos found/i)
  })

  it('shows an error message on search failure', async () => {
    searchYoutube.mockRejectedValue(new Error('UNAUTHORIZED'))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText(/Invalid API key/i)
  })

  it('"Search again" from playback returns to the search box', () => {
    renderIt({ initialVideoId: 'abc12345678' })
    fireEvent.click(screen.getByRole('button', { name: /Search again/i }))
    expect(screen.getByPlaceholderText(/paste a YouTube link/i)).toBeInTheDocument()
  })

  it('includes an "Open on YouTube" fallback link while playing', () => {
    renderIt({ initialVideoId: 'abc12345678' })
    expect(screen.getByRole('link', { name: /Open on YouTube/i })).toHaveAttribute(
      'href', 'https://www.youtube.com/watch?v=abc12345678',
    )
  })

  it('has no "Back to results" link when playback was opened directly from a saved pick', () => {
    renderIt({ initialVideoId: 'abc12345678' })
    expect(screen.queryByRole('button', { name: /Back to results/i })).not.toBeInTheDocument()
  })

  it('"Back to results" returns to the same results list without searching again', async () => {
    searchYoutube.mockResolvedValue([
      { videoId: 'abc12345678', title: 'El Shaddai (Live)', url: 'https://www.youtube.com/watch?v=abc12345678' },
      { videoId: 'def12345678', title: 'El Shaddai (Studio)', url: 'https://www.youtube.com/watch?v=def12345678' },
    ])
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    const row = await screen.findByText('El Shaddai (Live)')
    fireEvent.click(row)
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src', 'https://www.youtube.com/embed/abc12345678',
    )

    fireEvent.click(screen.getByRole('button', { name: /Back to results/i }))

    expect(screen.getByText('El Shaddai (Live)')).toBeInTheDocument()
    expect(screen.getByText('El Shaddai (Studio)')).toBeInTheDocument()
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument()
    expect(searchYoutube).toHaveBeenCalledTimes(1)
  })

  it('ignores an initialVideoId prop change while open if local state has since diverged (regression guard for the isOpen-only effect)', async () => {
    const { rerender } = renderIt({ initialVideoId: 'video1existing' })
    // Mounts directly into playing state showing the existing pick.
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src', 'https://www.youtube.com/embed/video1existing',
    )

    // User navigates away from playback locally (e.g. to search for a
    // different video), diverging local state from what initialVideoId says.
    fireEvent.click(screen.getByRole('button', { name: /Search again/i }))
    expect(screen.getByPlaceholderText(/paste a YouTube link/i)).toBeInTheDocument()

    // Parent re-renders with a DIFFERENT initialVideoId while isOpen stays
    // true (isOpen itself does not change here). If the effect incorrectly
    // depended on initialVideoId, it would re-fire here and snap the modal
    // back to "playing" with the new prop value -- it must not: the effect
    // is keyed only on isOpen, so this render should leave the user's local
    // "Search again" navigation untouched.
    rerender(
      <YoutubeSearchModal
        isOpen
        onClose={vi.fn()}
        title="El Shaddai"
        artist="Amy Grant"
        initialVideoId="video2different"
        onVideoPicked={vi.fn()}
      />,
    )

    expect(screen.getByPlaceholderText(/paste a YouTube link/i)).toBeInTheDocument()
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument()
  })

  describe('minimize / expand', () => {
    it('shows a minimize button while playing', () => {
      renderIt({ initialVideoId: 'abc12345678' })
      expect(screen.getByRole('button', { name: /minimize/i })).toBeInTheDocument()
    })

    it('does not show a minimize button while idle', () => {
      renderIt()
      expect(screen.queryByRole('button', { name: /minimize/i })).not.toBeInTheDocument()
    })

    it('calls onMinimize when the minimize button is clicked', () => {
      const onMinimize = vi.fn()
      renderIt({ initialVideoId: 'abc12345678', onMinimize })
      fireEvent.click(screen.getByRole('button', { name: /minimize/i }))
      expect(onMinimize).toHaveBeenCalledOnce()
    })

    it('renders the minimized bar with the title/artist label when minimized is true', () => {
      renderIt({ initialVideoId: 'abc12345678', minimized: true, title: 'El Shaddai', artist: 'Amy Grant' })
      expect(screen.getByText(/El Shaddai — Amy Grant/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Search again/i })).not.toBeInTheDocument()
    })

    it('calls onExpand when Expand is clicked in the minimized bar', () => {
      const onExpand = vi.fn()
      renderIt({ initialVideoId: 'abc12345678', minimized: true, onExpand })
      fireEvent.click(screen.getByRole('button', { name: /^Expand$/i }))
      expect(onExpand).toHaveBeenCalledOnce()
    })

    it('calls onClose when Close is clicked in the minimized bar', () => {
      const onClose = vi.fn()
      renderIt({ initialVideoId: 'abc12345678', minimized: true, onClose })
      fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('keeps the same iframe DOM node mounted when the minimized prop toggles', () => {
      const { rerender } = renderIt({ initialVideoId: 'abc12345678', minimized: false })
      const iframeBefore = screen.getByTitle('YouTube video player')

      rerender(
        <YoutubeSearchModal
          isOpen
          onClose={vi.fn()}
          title="El Shaddai"
          artist="Amy Grant"
          initialVideoId="abc12345678"
          onVideoPicked={vi.fn()}
          minimized
        />,
      )
      expect(screen.getByTitle('YouTube video player')).toBe(iframeBefore)
    })

    it('un-minimizes when a newly picked video starts playing', async () => {
      searchYoutube.mockResolvedValue([
        { videoId: 'newvideo1234', title: 'New Pick', url: 'https://www.youtube.com/watch?v=newvideo1234' },
      ])
      const onExpand = vi.fn()
      renderIt({ minimized: true, onExpand })
      // Starts idle (no initialVideoId), so the minimized bar shouldn't render yet.
      expect(screen.queryByText(/▶/)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
      const row = await screen.findByText('New Pick')
      fireEvent.click(row)

      expect(onExpand).toHaveBeenCalledOnce()
    })
  })
})
