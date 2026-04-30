"""Tests for docx_to_sbp converter — written before implementation (TDD)."""
import io
import json
import zipfile
import pytest
from docx_to_sbp import (
    Song,
    is_chord_token,
    detect_chord_line,
    extract_key_from_title,
    is_section_header_text,
    format_chord_line,
    parse_markdown_to_songs,
    create_sbp_bytes,
)


class TestIsChordToken:
    def test_simple_majors(self):
        for chord in ('D', 'G', 'A', 'C', 'E', 'F', 'B'):
            assert is_chord_token(chord) is True, chord

    def test_minor(self):
        for chord in ('Bm', 'Em', 'Am', 'Dm', 'F#m'):
            assert is_chord_token(chord) is True, chord

    def test_seventh(self):
        for chord in ('A7', 'Bm7', 'G7', 'D7'):
            assert is_chord_token(chord) is True, chord

    def test_sharp(self):
        assert is_chord_token('F#m') is True
        assert is_chord_token('C#') is True
        assert is_chord_token('F#') is True

    def test_flat(self):
        assert is_chord_token('Bb') is True
        assert is_chord_token('Eb') is True
        assert is_chord_token('Ab') is True

    def test_lyric_words_rejected(self):
        for word in ('There', 'God', 'My', 'But', 'All', 'How', 'Every'):
            assert is_chord_token(word) is False, word

    def test_empty_rejected(self):
        assert is_chord_token('') is False


class TestDetectChordLine:
    def test_single_chord(self):
        assert detect_chord_line('D') is True
        assert detect_chord_line('A7') is True

    def test_multiple_chords(self):
        assert detect_chord_line('D A Bm G') is True
        assert detect_chord_line('G Em C D') is True
        assert detect_chord_line('A7 D') is True
        assert detect_chord_line('F#m D E') is True
        assert detect_chord_line('A F#m D E') is True

    def test_lyric_line_rejected(self):
        assert detect_chord_line('There is power, power,') is False
        assert detect_chord_line('How great is our God, sing with me') is False
        assert detect_chord_line('God so loved the world') is False

    def test_empty_rejected(self):
        assert detect_chord_line('') is False
        assert detect_chord_line('   ') is False

    def test_mixed_chord_and_word_rejected(self):
        assert detect_chord_line('D A singing') is False


class TestExtractKeyFromTitle:
    def test_double_dash_key(self):
        name, key = extract_key_from_title('Freely Forgiven -- D')
        assert name == 'Freely Forgiven'
        assert key == 2  # D

    def test_another_double_dash(self):
        name, key = extract_key_from_title('Shout To The Lord -- G')
        assert name == 'Shout To The Lord'
        assert key == 7  # G

    def test_no_key_returns_none(self):
        name, key = extract_key_from_title('There Is Power In The Blood')
        assert name == 'There Is Power In The Blood'
        assert key is None

    def test_flat_key(self):
        name, key = extract_key_from_title('Amazing Grace -- Bb')
        assert name == 'Amazing Grace'
        assert key == 10  # Bb

    def test_sharp_key(self):
        name, key = extract_key_from_title('Song Name -- F#')
        assert name == 'Song Name'
        assert key == 6  # F#

    def test_key_map_coverage(self):
        expected = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
                    'Eb': 3, 'Ab': 8, 'Bb': 10, 'F#': 6}
        for key_str, idx in expected.items():
            _, key = extract_key_from_title(f'Title -- {key_str}')
            assert key == idx, f'{key_str} should be {idx}'


class TestIsSectionHeaderText:
    def test_recognises_common_sections(self):
        for text in ('Chorus', 'Verse', 'Bridge', 'Pre-Chorus',
                     'Intro', 'Outro', 'Tag', 'English Chorus', 'Chinese Chorus'):
            assert is_section_header_text(text) is True, text

    def test_song_titles_not_sections(self):
        for text in ('There Is Power In The Blood', 'Amazing Grace', 'Blessed Be Your Name'):
            assert is_section_header_text(text) is False, text


class TestFormatChordLine:
    def test_single_chord(self):
        assert format_chord_line('D') == '[D]'

    def test_multiple_chords_spaced(self):
        assert format_chord_line('D A Bm G') == '[D]     [A]     [Bm]     [G]'

    def test_sharp_chord_preserved(self):
        assert format_chord_line('F#m') == '[F#m]'

    def test_seventh_chord_preserved(self):
        assert format_chord_line('A7 D') == '[A7]     [D]'


class TestParseMarkdownToSongs:
    SIMPLE_MD = """\
**Song One**

**\\[Chorus\\]**

**D A**

There is power

**G D**

Wonder working

**Song Two -- G**

**\\[Verse\\]**

**G D Em**

My Jesus my Saviour
"""

    def test_parses_two_songs(self):
        songs = parse_markdown_to_songs(self.SIMPLE_MD)
        assert len(songs) == 2

    def test_song_names(self):
        songs = parse_markdown_to_songs(self.SIMPLE_MD)
        assert songs[0].name == 'Song One'
        assert songs[1].name == 'Song Two'

    def test_key_extracted_from_title(self):
        songs = parse_markdown_to_songs(self.SIMPLE_MD)
        assert songs[0].key == 0  # no key → default 0 (C)
        assert songs[1].key == 7  # G

    def test_content_has_section_header(self):
        songs = parse_markdown_to_songs(self.SIMPLE_MD)
        assert '{c: Chorus}' in songs[0].content
        assert '{c: Verse}' in songs[1].content

    def test_content_has_chord_lines(self):
        songs = parse_markdown_to_songs(self.SIMPLE_MD)
        assert '[D]' in songs[0].content
        assert '[A]' in songs[0].content

    def test_content_has_lyrics(self):
        songs = parse_markdown_to_songs(self.SIMPLE_MD)
        assert 'There is power' in songs[0].content
        assert 'My Jesus my Saviour' in songs[1].content

    def test_structure_hints_ignored(self):
        md = "**Song Three**\n\n**V, PC, C, V, C**\n\n**\\[Chorus\\]**\n\n**D**\n\nLyrics\n"
        songs = parse_markdown_to_songs(md)
        assert len(songs) == 1
        assert 'V, PC, C' not in songs[0].content

    def test_subsection_labels_as_sections(self):
        md = "**How Great Is Our God**\n\n**English Chorus**\n\n**D**\n\nLyrics en\n\n**Chinese Chorus**\n\n**D**\n\n歌词\n"
        songs = parse_markdown_to_songs(md)
        assert len(songs) == 1
        assert '{c: English Chorus}' in songs[0].content
        assert '{c: Chinese Chorus}' in songs[0].content


class TestCreateSbpBytes:
    def test_output_is_valid_zip(self):
        songs = [Song(name='Test Song', key=2, content='{c: Chorus}\n[D]     [G]\nTest lyrics\n')]
        data = create_sbp_bytes(songs)
        assert zipfile.is_zipfile(io.BytesIO(data))

    def test_zip_contains_required_files(self):
        songs = [Song(name='Test Song', key=2, content='')]
        data = create_sbp_bytes(songs)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            assert 'dataFile.txt' in zf.namelist()
            assert 'dataFile.hash' in zf.namelist()

    def test_data_file_starts_with_version(self):
        songs = [Song(name='Test Song', key=2, content='')]
        data = create_sbp_bytes(songs)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            content = zf.read('dataFile.txt').decode()
            assert content.startswith('1.0\n')

    def test_json_has_correct_song_fields(self):
        songs = [Song(name='Amazing Grace', key=9, content='test content')]
        data = create_sbp_bytes(songs)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            raw = zf.read('dataFile.txt').decode()
            obj = json.loads(raw[4:])  # skip '1.0\n'
            assert len(obj['songs']) == 1
            s = obj['songs'][0]
            assert s['name'] == 'Amazing Grace'
            assert s['key'] == 9
            assert s['content'] == 'test content'

    def test_json_has_songs_sets_folders(self):
        songs = [Song(name='T', key=0, content='')]
        data = create_sbp_bytes(songs)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            raw = zf.read('dataFile.txt').decode()
            obj = json.loads(raw[4:])
            assert 'songs' in obj
            assert 'sets' in obj
            assert 'folders' in obj

    def test_hash_file_is_md5_of_data(self):
        import hashlib
        songs = [Song(name='T', key=0, content='')]
        data = create_sbp_bytes(songs)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            file_content = zf.read('dataFile.txt').decode()
            stored_hash = zf.read('dataFile.hash').decode()
            expected_hash = hashlib.md5(file_content.encode()).hexdigest()
            assert stored_hash == expected_hash

    def test_multiple_songs(self):
        songs = [
            Song(name='Song A', key=0, content='a'),
            Song(name='Song B', key=7, content='b'),
        ]
        data = create_sbp_bytes(songs)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            raw = zf.read('dataFile.txt').decode()
            obj = json.loads(raw[4:])
            assert len(obj['songs']) == 2
            assert obj['songs'][0]['name'] == 'Song A'
            assert obj['songs'][1]['name'] == 'Song B'
