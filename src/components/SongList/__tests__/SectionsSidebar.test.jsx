import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SectionsSidebar } from '../SectionsSidebar'

const sections = [
  { label: 'Intro', lines: [] },
  { label: 'Verse 1', lines: [] },
  { label: null, lines: [] },
  { label: 'Chorus', lines: [] },
]

describe('SectionsSidebar — closed', () => {
  it('renders a toggle button when closed', () => {
    render(
      <SectionsSidebar
        sections={sections}
        activeIndex={0}
        open={false}
        onToggle={vi.fn()}
        onSectionClick={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /show sections panel/i })).toBeInTheDocument()
  })

  it('calls onToggle when the tab is clicked', () => {
    const onToggle = vi.fn()
    render(
      <SectionsSidebar
        sections={sections}
        activeIndex={0}
        open={false}
        onToggle={onToggle}
        onSectionClick={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show sections panel/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('SectionsSidebar — open', () => {
  it('renders only labelled section names', () => {
    render(
      <SectionsSidebar
        sections={sections}
        activeIndex={0}
        open={true}
        onToggle={vi.fn()}
        onSectionClick={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Intro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verse 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chorus' })).toBeInTheDocument()
    // null label must not appear as text
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  it('applies active style to the current section', () => {
    render(
      <SectionsSidebar
        sections={sections}
        activeIndex={0}
        open={true}
        onToggle={vi.fn()}
        onSectionClick={vi.fn()}
      />
    )
    const introBtn = screen.getByRole('button', { name: 'Intro' })
    expect(introBtn.className).toContain('bg-indigo-500')
  })

  it('calls onSectionClick with the original sections-array index', () => {
    const onSectionClick = vi.fn()
    render(
      <SectionsSidebar
        sections={sections}
        activeIndex={0}
        open={true}
        onToggle={vi.fn()}
        onSectionClick={onSectionClick}
      />
    )
    // Chorus is at original index 3 (after the null-label section)
    fireEvent.click(screen.getByRole('button', { name: 'Chorus' }))
    expect(onSectionClick).toHaveBeenCalledWith(3)
  })

  it('calls onToggle when the hide button is clicked', () => {
    const onToggle = vi.fn()
    render(
      <SectionsSidebar
        sections={sections}
        activeIndex={0}
        open={true}
        onToggle={onToggle}
        onSectionClick={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /hide sections panel/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
