#!/usr/bin/env python3
"""Convert a DOCX file with lyrics and chords into SongBook Pro .sbp format."""
import hashlib
import io
import json
import re
import subprocess
import sys
import zipfile
from dataclasses import dataclass, field
from typing import Optional


# Matches a single chord token: root + optional accidental + quality + number + bass
CHORD_RE = re.compile(
    r'^[A-G][#b]?(m|M|maj|min|sus|aug|dim|add)?[0-9]?(sus[24]|add[29])?(/[A-G][#b]?)?$'
)

SECTION_WORDS = {
    'chorus', 'verse', 'pre-chorus', 'pre chorus', 'prechorus',
    'bridge', 'intro', 'outro', 'tag', 'interlude', 'refrain',
    'vamp', 'ending', 'coda', 'solo', 'instrumental',
}

KEY_MAP = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}


@dataclass
class Song:
    name: str
    key: int = 0
    content: str = ''


def is_chord_token(token: str) -> bool:
    return bool(token) and bool(CHORD_RE.match(token))


def detect_chord_line(text: str) -> bool:
    tokens = text.strip().split()
    return bool(tokens) and all(is_chord_token(t) for t in tokens)


def extract_key_from_title(title: str) -> tuple[str, Optional[int]]:
    match = re.search(r'\s+[-–—]+\s+([A-G][#b]?)\s*$', title)
    if match:
        clean = title[:match.start()].strip()
        return clean, KEY_MAP.get(match.group(1))
    return title, None


def is_section_header_text(text: str) -> bool:
    lower = text.lower()
    return any(word in lower for word in SECTION_WORDS)


def is_structure_hint(text: str) -> bool:
    return ',' in text


def _classify_bold(text: str) -> tuple[str, str]:
    """Return (kind, value) for a bold line's inner text."""
    clean = text.replace('\\[', '[').replace('\\]', ']')
    if clean.startswith('[') and clean.endswith(']'):
        return 'section', clean[1:-1]
    if detect_chord_line(clean):
        return 'chord', clean
    if is_section_header_text(clean):
        return 'section', clean
    if is_structure_hint(clean):
        return 'hint', clean
    return 'title', clean


def format_chord_line(chord_text: str) -> str:
    return '     '.join(f'[{t}]' for t in chord_text.strip().split())


def _extract_bold(line: str) -> Optional[str]:
    """Return combined inner text if the whole line is bold content, else None.

    Handles: single **A**, multiple **A** **B** **C**, and trailing backslash continuations.
    Uses [^*]+ so the match never spans across segment boundaries.
    """
    # Strip trailing backslash (pandoc line-continuation marker) and whitespace
    stripped = line.rstrip().rstrip('\\').rstrip()
    if not stripped:
        return None
    # Find every **non-asterisk-content** segment
    parts = re.findall(r'\*\*([^*]+)\*\*', stripped)
    if not parts:
        return None
    # Verify the rest of the line is only whitespace (no non-bold words mixed in)
    remainder = re.sub(r'\*\*[^*]+\*\*', '', stripped)
    if remainder.strip():
        return None
    return ' '.join(p.strip().rstrip('\\').strip() for p in parts)


def parse_markdown_to_songs(markdown: str) -> list[Song]:
    songs: list[Song] = []
    current: Optional[Song] = None
    current_section: Optional[str] = None
    pending: list[str] = []

    def flush():
        nonlocal pending
        if current is None:
            pending = []
            return
        if current_section is not None:
            current.content += f'{{c: {current_section}}}\n'
        if pending:
            current.content += '\n'.join(pending) + '\n'
        pending = []

    def finish():
        nonlocal current, current_section
        if current is not None:
            flush()
            songs.append(current)
        current = None
        current_section = None

    for line in markdown.splitlines():
        bold_inner = _extract_bold(line)
        if bold_inner is not None:
            kind, value = _classify_bold(bold_inner)
            if kind == 'title':
                finish()
                name, key_idx = extract_key_from_title(value)
                current = Song(name=name, key=key_idx if key_idx is not None else 0)
            elif kind == 'section':
                flush()
                current_section = value
            elif kind == 'chord' and current is not None:
                pending.append(format_chord_line(value))
            # 'hint' lines are discarded
        else:
            stripped = line.strip()
            if stripped and stripped != '\\' and current is not None:
                pending.append(stripped)

    finish()
    return songs


def create_sbp_bytes(songs: list[Song]) -> bytes:
    payload = json.dumps(
        {
            'songs': [
                {
                    'name': s.name,
                    'author': '',
                    'key': s.key,
                    'Capo': 0,
                    'TempoInt': 0,
                    'timeSig': '4/4',
                    'Copyright': '',
                    'KeyShift': 0,
                    'Deleted': False,
                    'content': s.content,
                }
                for s in songs
            ],
            'sets': [],
            'folders': [],
        },
        ensure_ascii=False,
    )
    file_content = f'1.0\n{payload}'
    md5 = hashlib.md5(file_content.encode()).hexdigest()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('dataFile.txt', file_content)
        zf.writestr('dataFile.hash', md5)
    return buf.getvalue()


def convert(docx_path: str, output_path: str) -> list[Song]:
    result = subprocess.run(
        ['pandoc', '--track-changes=all', docx_path, '-t', 'markdown'],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f'pandoc failed: {result.stderr}')
    songs = parse_markdown_to_songs(result.stdout)
    with open(output_path, 'wb') as f:
        f.write(create_sbp_bytes(songs))
    return songs


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <input.docx> <output.sbp>')
        sys.exit(1)
    songs = convert(sys.argv[1], sys.argv[2])
    print(f'Converted {len(songs)} songs → {sys.argv[2]}')
    for s in songs:
        print(f'  {s.name}  (key index: {s.key})')
