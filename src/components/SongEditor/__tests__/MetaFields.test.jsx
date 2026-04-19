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
