import { describe, it, expect } from 'vitest'
import { parseDanielChoyPage } from '../danielchoyParser'

// Mirrors the real Blogger markup: one <div> per visual line, Times font, columns
// aligned with alternating "&nbsp; " padding. Excerpts are from
// danielchoy.blogspot.com/2026/10/youre-worthy-of-my-praise-david-ruis.html
const line = (s) => `<div><span style="font-family: times;">${s}</span></div>`
const page = (...lines) => lines.join('')
const meta = { title: "You're Worthy Of My Praise", artist: 'David Ruis' }

const HEADER = [
  line(`<b><u><span style="font-size: large;">You're Worthy Of My Praise</span></u></b> - David Ruis @ 1991`),
  line('Original Key Signature: E (Male &amp; Female Singer)&nbsp; &nbsp;</span><span style="font-family: times;">Play in Key: G'),
  line('Sequence: Intro-V1-V2-C-Int-V3-V4-C-Int-C-C-Tag'),
  '<div><br /></div>',
]

const VERSE = [
  '<div><b><span style="font-family: times;">Verse 1</span></b></div>',
  line('| G -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; -&nbsp; &nbsp; | G -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; -&nbsp; &nbsp; &nbsp; -'),
  line('&nbsp; I&nbsp; &nbsp;will wor-ship, (I&nbsp; &nbsp;will wor-ship)'),
  line('&nbsp; &nbsp; &nbsp; &nbsp;| F&nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp; | F&nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;-'),
  line('With all of&nbsp; my&nbsp; heart, (with all of&nbsp; my&nbsp; heart)'),
  line('| C -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp; -&nbsp; &nbsp; | C -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; -&nbsp; &nbsp; &nbsp; &nbsp; -'),
  line('&nbsp; I&nbsp; &nbsp;will praise You,&nbsp; &nbsp;(I&nbsp; will praise You)'),
  line('&nbsp; &nbsp; &nbsp; &nbsp;| G&nbsp; &nbsp; &nbsp; -&nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; - | Am -&nbsp; D&nbsp; &nbsp; -&nbsp;&nbsp;'),
  line('With all of&nbsp; my&nbsp; strength,&nbsp; (all&nbsp; of my-ai strength)'),
  '<div><br /></div>',
]

// Non-blank rawText lines under the first `{c: label}` header, up to the next header
const lyricLines = (song, label) => {
  const lines = song.rawText.split('\n')
  const out = []
  for (let i = lines.indexOf(`{c: ${label}}`) + 1; i > 0 && i < lines.length && !lines[i].startsWith('{c:'); i++) {
    if (lines[i].trim()) out.push(lines[i])
  }
  return out
}

describe('parseDanielChoyPage — proportional-font chord placement', () => {
  it('places chords by rendered Times width, keeping leading &nbsp; indentation', () => {
    const song = parseDanielChoyPage(page(...HEADER, ...VERSE), meta)
    expect(lyricLines(song, 'Verse 1')).toEqual([
      '[G]I will wor-ship, ([G]I will wor-ship)',
      'With [F]all of my heart, (with [F]all of my heart)',
      '[C]I will praise You, ([C]I will praise You)',
      'With [G]all of my strength, ([Am]all of [D]my-ai strength)',
    ])
  })

  it('puts a chord that lands on an opening parenthesis inside it', () => {
    const song = parseDanielChoyPage(page(...HEADER, ...VERSE), meta)
    expect(song.rawText).toContain('([C]I will praise You)')
    expect(song.rawText).not.toContain('[C](')
  })
})

describe('parseDanielChoyPage — key handling', () => {
  it('does not transpose when the chart already starts on the declared play-in key', () => {
    // G song that borrows F and C — key detection alone mistakes it for another key
    const song = parseDanielChoyPage(page(...HEADER, ...VERSE), meta)
    expect(song.meta.key).toBe('G')
    expect(song.rawText).toContain('With [F]all of my heart')
  })
})

describe('parseDanielChoyPage — song extent', () => {
  const body = page(
    ...HEADER,
    line('<b>Intro</b>: | G - - - | Gsus4 - - - | G - - - | Gsus4 - - - (Twice)'),
    '<div>Or&nbsp; &nbsp; &nbsp; &nbsp;| G - - - | G - - - | F - - - | G - - -&nbsp; (Twice)&nbsp;&nbsp;</div>',
    '<div><br /></div>',
    ...VERSE,
    line('<b>Interlude</b>: | G - - - | G - - - | F - G - | G - - -'),
    line('[Repeat Chorus]'),
    line('<b>Interlude</b>: | G - - - | G - - - | Dm - - - | Dm - - -&nbsp;'),
    line('&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; | C - - - | C - - - | D - - - | Am - D -'),
    line('<b>Tag</b>: | G - - - | D - - - |&nbsp;</span><span style="font-family: times;">Am&nbsp; -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;- -&nbsp; &nbsp; | C&nbsp; &nbsp; &nbsp; -&nbsp; &nbsp;D&nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp;^'),
    line('&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;You alone&nbsp; &nbsp; are wor-thy of my praise'),
    '<div><br /></div>',
    // Lyrics-only copy of the song that every post repeats underneath the chart
    ...HEADER,
    '<div><b><span style="font-family: times;">Verse 1</span></b></div>',
    line('I will worship, (I will worship)'),
  )

  it('keeps a section that legitimately repeats (second Interlude) and the Tag after it', () => {
    const song = parseDanielChoyPage(body, meta)
    const labels = song.sections.map(s => s.label)
    expect(labels).toEqual(['Intro', 'Verse 1', 'Interlude', 'Interlude', 'Tag'])
    expect(song.rawText).toContain('[Am]You alone are [C]wor-thy [D]of my praise')
  })

  it('stops at the lyrics-only copy that follows the chart', () => {
    const song = parseDanielChoyPage(body, meta)
    expect(song.rawText).not.toMatch(/I will worship, \(I will worship\)/)
  })

  it('keeps an "Or" alternative intro as its own chord line instead of merging it as lyrics', () => {
    const song = parseDanielChoyPage(body, meta)
    const intro = song.sections.find(s => s.label === 'Intro')
    expect(intro.lines.filter(l => l.type === 'chord').map(l => l.chords.map(c => c.chord))).toEqual([
      ['G', 'Gsus4', 'G', 'Gsus4'],
      ['G', 'G', 'F', 'G'],
    ])
    expect(lyricLines(song, 'Intro')[1]).toBe('Or')
  })

  it('ignores page chrome when given the full blog page rather than the feed post body', () => {
    const full = `<html><body><div class='sidebar'>${line('Verse 1')}${line('G D')}${line('Sidebar junk')}</div>`
      + `<div class='post-body entry-content' id='post-body-123' itemprop='description articleBody'>${body}`
      + `<div style='clear: both;'></div></div><div class='footer'>${line('Chorus')}</div></body></html>`
    const song = parseDanielChoyPage(full, meta)
    expect(song.sections.map(s => s.label)).toEqual(['Intro', 'Verse 1', 'Interlude', 'Interlude', 'Tag'])
    expect(song.rawText).not.toContain('Sidebar junk')
  })
})

describe('parseDanielChoyPage — pickup lyrics', () => {
  it('joins a far-right pickup lyric (written above the next chord line) onto the previous line', () => {
    const song = parseDanielChoyPage(page(
      ...HEADER,
      '<div><b><span style="font-family: times;">Verse 2</span></b></div>',
      line('| G -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; -&nbsp; &nbsp; &nbsp; &nbsp; -&nbsp; &nbsp;| G -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp;-'),
      line('&nbsp; I&nbsp; &nbsp;</span><span style="font-family: times;">will serve You, (I&nbsp; &nbsp; will serve You)'),
      line('&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Give You'),
      line('| G -&nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp; - | Am&nbsp; &nbsp; &nbsp;-&nbsp; &nbsp;D&nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; ^'),
      line("&nbsp; E - v'ry&nbsp; thing, (give You e-v'ry-thing)"),
    ), meta)
    expect(lyricLines(song, 'Verse 2')).toEqual([
      '[G]I will serve You, ([G]I will serve You) Give You',
      "[G]E - v'ry thing, ([Am]give You [D]e-v'ry-thing)",
    ])
  })
})

describe('parseDanielChoyPage — lead-in chords and footer', () => {
  // danielchoy.blogspot.com — The More I Seek You (Gateway Worship)
  const verse = [
    '<div><b><span style="font-family: times;">Verse</span></b></div>',
    line('| G - -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp;| D&nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp;- - | Em - -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp;| C&nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp;- -'),
    line('&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;The more I&nbsp; seek&nbsp; You&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;The more I&nbsp; &nbsp;find&nbsp; You&nbsp;'),
  ]

  it('keeps a single downbeat chord on an indented lyric line rather than splitting it off', () => {
    const song = parseDanielChoyPage(page(...HEADER, ...verse), meta)
    expect(lyricLines(song, 'Verse')[0]).toMatch(/^\[G\]The more I \[D\]seek You \[Em\]The more I/)
  })

  it('stops at the blog navigation footer when there is no lyrics-only copy', () => {
    const song = parseDanielChoyPage(page(
      ...HEADER, ...verse, '<div><br /></div>',
      line('Praise &amp; Worship Songs Content Page'),
      line('Christmas Carols Content Page'),
      line('Download Word Format'),
    ), meta)
    expect(song.rawText).not.toMatch(/Content Page|Download/)
  })
})

describe('parseDanielChoyPage — play-in key vs original key', () => {
  const chart = [
    '<div><b><span style="font-family: times;">Verse</span></b></div>',
    line('| A -&nbsp; &nbsp; &nbsp; &nbsp; | E -&nbsp; &nbsp; &nbsp; &nbsp; | F#m'),
    line('Hello there my friend'),
  ]

  it('uses "Play in Key" on its own line even after an unparseable original key list', () => {
    const song = parseDanielChoyPage(page(
      line('Original key Signature: D#/Eb-F-F#/Gb (D# Male Singer &amp; F: Male &amp; Female Singer)'),
      line('Play in Key: A [Entire Song]'),
      ...chart,
    ), meta)
    expect(song.meta.key).toBe('A')
    expect(song.rawText).toContain('[A]')
  })

  it('treats a second "Key Signature:" after the original key as the chart key', () => {
    const song = parseDanielChoyPage(page(
      line('Original Key Signature: E (Male Singer)&nbsp; &nbsp; Key Signature: A (Female Singer)'),
      ...chart,
    ), meta)
    expect(song.meta.key).toBe('A')
    expect(song.rawText).toContain('[A]') // not transposed down to the original key
  })
})

describe('parseDanielChoyPage — repeated chart', () => {
  it('stops when the header block repeats, even if the title line has no "@ year" credit', () => {
    // danielchoy.blogspot.com — I Could Sing Of Your Love Forever (Sonicflood) prints
    // the whole chart twice before the lyrics-only copy
    const header = [
      line('<b>I Could Sing Of Your Love Forever</b> - Sonicflood'),
      line('Original Key Signature: D (Darlene - Female Singer)&nbsp; Play in Key: G (Male Singer)'),
      line('Sequence: V-Int-V-C-V-C-C-B-C-C-Flourish'),
    ]
    const chart = [
      '<div><b><span style="font-family: times;">Verse</span></b></div>',
      line('| G -&nbsp; &nbsp; &nbsp; &nbsp; | C -'),
      line('Over the mountains and the sea'),
    ]
    const song = parseDanielChoyPage(page(...header, ...chart, ...header, ...chart), meta)
    expect(song.sections.map(s => s.label)).toEqual(['Verse'])
  })
})

describe('parseDanielChoyPage — title chart key', () => {
  // danielchoy.blogspot.com — What A God (SEU Worship), "D Chord" post whose header
  // says "Play in Key: A" while every chord on the page is in D
  const body = page(
    line('Original Key Signature: D (Female Singer)&nbsp; &nbsp; Play in Key: A (Male &amp; Female Singer)'),
    '<div><b><span style="font-family: times;">Verse 1</span></b></div>',
    line('| Bm - G - | D - - -'),
    line("Who thought I'd find You in the low-est place"),
  )

  it('labels the song with the key from the post title over a contradicting header, leaving chords as written', () => {
    const song = parseDanielChoyPage(body, { ...meta, chartKey: 'D' })
    expect(song.meta.key).toBe('D')
    expect(song.rawText).toMatch(/^\[Bm\]Who /m) // not transposed to C#m
  })

  it('reads the title key from the page <title> when the search result did not carry it', () => {
    const full = `<html><head><title>Daniel Choy: What A God - SEU Worship @ June 2024. D Chord. (Lyrics and Chords)</title></head>`
      + `<body><div class='post-body entry-content' id='post-body-1'>${body}<div style='clear: both;'></div></div></body></html>`
    expect(parseDanielChoyPage(full, meta).meta.key).toBe('D')
  })
})

describe('chartKeyFromTitle', () => {
  it.each([
    ["You're Worthy Of My Praise - David Ruis @ 1991. G Chord. (Lyrics and Chords)", 'G'],
    ['Joy In My Soul - New Creation Church NCC @ July 2026. A Chords. (Lyrics and Chords)', 'A'],
    ['Some Song - Someone. Bb-C Chord. (Lyrics and Chords)', 'Bb'],
    ['Xinjiang 新疆 15 Sep to 27 Sep 2026', null],
  ])('%s → %s', async (title, key) => {
    const { chartKeyFromTitle } = await import('../danielchoyClient')
    expect(chartKeyFromTitle(title)).toBe(key)
  })
})

describe('parseDanielChoyPage — syllable snapping and 6/8 bars', () => {
  it('moves a chord that lands a letter into a syllable back to its start', () => {
    // danielchoy.blogspot.com — Come Alive (NCC): in the rendered page F sits over the
    // "t" of "heart" and Bb over the "l" of "val"
    const song = parseDanielChoyPage(page(
      ...HEADER,
      '<div><b><span style="font-family: times;">Verse 1</span></b></div>',
      line('| Dm&nbsp; -&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Bb&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;-&nbsp; &nbsp; &nbsp; &nbsp;| F - - -'),
      line('&nbsp; &nbsp; &nbsp; &nbsp;You sur-round my&nbsp; &nbsp;heart'),
    ), meta)
    expect(lyricLines(song, 'Verse 1')).toEqual(['[Dm]You sur-[Bb]round my [F]heart'])
  })

  it('leaves CJK lyrics on the character the chord sits over', () => {
    const song = parseDanielChoyPage(page(
      ...HEADER,
      '<div><b><span style="font-family: times;">Verse 1</span></b></div>',
      line('| C&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;G'),
      line('约定在一起'),
    ), meta)
    expect(lyricLines(song, 'Verse 1')).toEqual(['[C]约定在一[G]起']) // not pulled back to 约
  })

  it('reads "=" half-bar markers in 6/8 chord lines as beats', () => {
    // danielchoy.blogspot.com — Gratitude (Brandon Lake)
    const song = parseDanielChoyPage(page(
      ...HEADER,
      line('<b>Intro</b>: | D - - = - - | D - - = - - | C - - = - - | C - - ='),
    ), meta)
    expect(song.sections[0].lines[0].type).toBe('chord')
    expect(song.sections[0].lines[0].chords.map(c => c.chord)).toEqual(['D', 'D', 'C', 'C'])
  })
})

describe('parseDanielChoyPage — Word-pasted posts (2017 era)', () => {
  // danielchoy.blogspot.com/2017/04/agnus-dei-michael-w-smith-chord-lyrics.html —
  // MsoNormal markup wraps long lines with raw newlines inside the text, which the
  // browser renders as a single space, not a line break
  const mso = (s) => `<div class="MsoNormal" style="margin-bottom: .0001pt; margin-bottom: 0cm;">\n`
    + `<span lang="EN-US" style="font-family: &quot;times new roman&quot; , serif; font-size: 11.0pt;">${s}<o:p></o:p></span></div>\n`
  const body = [
    mso('Key: A'),
    '<div class="MsoNormal" style="margin-bottom: .0001pt; margin-bottom: 0cm;">\n<br /></div>\n',
    mso('A&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\nD&nbsp; A&nbsp;&nbsp;&nbsp; F#m&nbsp;\nE&nbsp;&nbsp; D '),
    mso('Al-le-lu-jah,&nbsp;\nal-le-lu-jah'),
    mso('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\nE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; D&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; A '),
    mso('For our Lord, God Almighty reigns&nbsp; (Repeat)'),
    mso('D E&nbsp; A'),
    mso('A -&nbsp; men'),
    '<div class="MsoNormal">\n<span style="font-family: &quot;times new roman&quot;, serif;">'
      + '<a href="#">Back to Praise And Worship Songs Content Page For More Other Songs With Chords</a></span></div>\n',
    mso('Lyrics for Agnus Dei - Michael W Smith'),
  ].join('')

  it('treats raw newlines inside the HTML as spaces, keeping each chord line whole and merged, and stops at the footer', () => {
    const song = parseDanielChoyPage(body, { title: 'Agnus Dei', artist: 'Michael W Smith', chartKey: 'A' })
    expect(song.rawText.split('\n').filter(Boolean)).toEqual([
      '[A]Al-le-[D]lu-[A]jah, [F#m]al-le-[E]lu-[D]jah',
      'For our [E]Lord, God Al[D]mighty [A]reigns (Repeat)',
      '[D]A [E]- [A]men',
    ])
  })
})
