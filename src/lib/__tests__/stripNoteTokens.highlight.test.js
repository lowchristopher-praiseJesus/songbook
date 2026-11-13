import { describe, it, expect } from 'vitest'
import { stripNoteTokens } from '../exportSbp'

describe('stripNoteTokens — {highlight:} is private like {note:}', () => {
  it('removes {highlight:} lines without leaving a blank line', () => {
    expect(stripNoteTokens('{c: Verse}\n{highlight: key up}\nHello\n{note: soft}\nWorld'))
      .toBe('{c: Verse}\nHello\nWorld')
  })
})
