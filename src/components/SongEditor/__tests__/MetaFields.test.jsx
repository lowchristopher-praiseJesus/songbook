import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetaFields } from '../MetaFields'

const baseMeta = {
  title: 'Amazing Grace',
  artist: 'John Newton',
  key: 'G',
  capo: 0,
  tempo: '',
  timeSignature: '',
  annotation: '',
}

describe('MetaFields', () => {
  it('renders a Song Note input', () => {
    render(<MetaFields meta={baseMeta} onChange={() => {}} />)
    expect(screen.getByLabelText('Song Note')).toBeInTheDocument()
  })

  it('calls onChange with "annotation" key when Song Note is edited', () => {
    const onChange = vi.fn()
    render(<MetaFields meta={baseMeta} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Song Note'), { target: { value: 'sing joyfully' } })
    expect(onChange).toHaveBeenCalledWith('annotation', 'sing joyfully')
  })

  it('displays existing annotation value', () => {
    render(<MetaFields meta={{ ...baseMeta, annotation: 'existing note' }} onChange={() => {}} />)
    expect(screen.getByLabelText('Song Note')).toHaveValue('existing note')
  })
})

describe('MetaFields collapsible summary (mobile)', () => {
  const fieldsBox = () => document.getElementById('song-meta-fields')

  it('starts open by default', () => {
    render(<MetaFields meta={baseMeta} onChange={() => {}} />)
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
    expect(fieldsBox().className).not.toMatch(/(^|\s)hidden(\s|$)/)
  })

  it('starts collapsed with defaultCollapsed and summarises the song', () => {
    render(<MetaFields meta={{ ...baseMeta, capo: 2, tempo: 72 }} onChange={() => {}} defaultCollapsed />)
    const toggle = screen.getByRole('button', { expanded: false })
    expect(toggle).toHaveTextContent('Amazing Grace')
    expect(toggle).toHaveTextContent('John Newton')
    expect(toggle).toHaveTextContent('Key G · Capo 2 · 72 BPM')
    expect(fieldsBox().className).toMatch(/(^|\s)hidden(\s|$)/)
  })

  it('toggles open and closed when the summary is tapped', () => {
    render(<MetaFields meta={baseMeta} onChange={() => {}} defaultCollapsed />)
    const toggle = screen.getByRole('button', { expanded: false })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(fieldsBox().className).not.toMatch(/(^|\s)hidden(\s|$)/)
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('forces open when there is a title error', () => {
    render(<MetaFields meta={{ ...baseMeta, title: '' }} onChange={() => {}} defaultCollapsed titleError />)
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
    expect(screen.getByText('Title is required')).toBeInTheDocument()
  })
})
