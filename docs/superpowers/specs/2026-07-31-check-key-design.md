# Check Key — Design Spec

## Purpose

Add a "Check key" button to Edit mode, next to "Fix headers" and "Fix chords", that:
1. Verifies whether the song's stated key (`meta.key`) matches what its chords actually imply, and offers to correct it if not.
2. Flags chords that don't belong to the stated key's diatonic set, so the user can catch typos or transcription errors.

This is a diagnostic aid, not an auto-fixer: flagged chords may be intentional (borrowed chords, secondary dominants, passing chords) and are reported, not auto-corrected.

## Scope (v1)

- Major keys only. `meta.key` is stored as a bare root-note string (`"C"`, `"F#"`, etc.) with no major/minor flag, and relative major/minor keys share identical diatonic chords, so v1 always analyzes against the major scale rooted at the candidate note. A song truly in A minor will show its detected key as "C" (its relative major) — not incorrect, just not labeled the way a musician might expect. Out of scope for v1.
- No classification of *why* a chord is an outlier (borrowed chord / secondary dominant / passing chord). Chords are flagged as "outside the stated key," full stop. Can be added later.
- No auto-apply/replace for flagged chords — informational only.
- Key mismatch *is* actionable: an "Update key" button reuses the existing key-change flow.

## Architecture

### New file: `src/lib/parser/keyChecker.js`

Exports `checkKey(rawText, statedKey)`:

```
checkKey(rawText, statedKey) -> {
  statedKey: string,
  detectedKey: string,
  keyMatches: boolean,
  outlierChords: [{ chord: string, count: number, exampleLine: number, exampleText: string }]
}
```

Algorithm:
1. Parse `rawText` with the existing `parseContent` (contentParser.js) to walk sections/lines and collect every chord token along with its line index.
2. For each chord, resolve its root by stripping any slash-chord bass note (`G/B` → root `G`), reusing the existing root-parsing regex convention (`^([A-G][b#]?)(.*)$`) already used in `chordUtils.js`.
3. Bucket each chord's quality into `major | minor | diminished | other`, treating extensions/sus/add/7ths as inheriting their base triad's bucket (e.g. `G7` and `Gsus4` both bucket as `major`-family for diatonic-fit purposes).
4. For each of the 12 possible major keys, build its 7 diatonic triads (scale degrees with expected quality: I maj, ii min, iii min, IV maj, V maj, vi min, vii° dim) using the existing `NOTE_TO_INDEX` / `MAJOR_SCALE` primitives in `chordUtils.js`.
5. Score every candidate key by the frequency-weighted percentage of the song's chords that fit its diatonic set. `detectedKey` = highest-scoring key.
6. Ambiguity guard: to avoid flip-flopping on short/sparse songs, only report `keyMatches: false` when the stated key's score is below a fixed threshold *and* trails the best-scoring key by a clear margin. (Exact threshold/margin tuned during implementation and covered by tests — see Testing.)
7. `outlierChords`: chords whose root+quality bucket doesn't fit the **stated** key's diatonic set (independent of `detectedKey`), grouped by unique chord string, each with an occurrence count and one example `{ line, text }` for context. This list is what the UI reports regardless of whether the key itself matches.

This module may extend or replace the currently-unused `detectKeyFromContent` in `chordUtils.js` (which already does an early version of diatonic-fit scoring but always returns `isMinor: false` as a placeholder) rather than duplicating its logic.

### New component: `src/components/SongEditor/KeyCheckModal.jsx`

Props: `{ isOpen, result, onUpdateKey, onCancel }`, mirroring `FixChordsModal`'s shape/styling.

- Header section: `Stated key: {statedKey}` / `Detected key: {detectedKey}`.
  - If `keyMatches`: show a "✓ Key matches" confirmation, no action button.
  - If not: show an "Update key" button that calls `onUpdateKey(result.detectedKey)`.
- Body section: read-only list of `outlierChords` — chord name, occurrence count, example line snippet. If empty, show "No out-of-key chords found."
- Cancel/close button.

### Edits: `src/components/SongEditor/SongEditor.jsx`

- New state: `pendingKeyCheck` (null | result object).
- New handler `handleCheckKey()`:
  - Runs `checkKey(rawText, meta.key)`.
  - If the song has no chords at all → toast "No chords found to analyze." (matches existing empty-state pattern used by Fix headers/Fix chords).
  - Else if `keyMatches && outlierChords.length === 0` → toast "Key looks correct — no issues found."
  - Else → `setPendingKeyCheck(result)` to open the modal.
- New button "Check key", same style as the existing two, placed after "Fix chords" (~line 154).
- Render `<KeyCheckModal>` wired to `pendingKeyCheck`.
  - `onUpdateKey(newKey)` calls the **existing** `handleMetaChange('key', newKey)` — this reuses the current `TransposeConfirmModal` flow unchanged (if `rawText` contains chords, the user is asked whether to transpose them, exactly like manually changing the Key dropdown in `MetaFields`). No new key-change logic is introduced.
  - `onCancel` clears `pendingKeyCheck`.

## Data flow

```
[Check key button click]
        |
        v
checkKey(rawText, meta.key)  --(parseContent, chordUtils diatonic helpers)-->  result
        |
   no chords?  --yes--> toast, done
        |no
   matches & no outliers?  --yes--> toast, done
        |no
        v
setPendingKeyCheck(result) --> <KeyCheckModal> renders
        |
   [Update key clicked] --> handleMetaChange('key', detectedKey) --> existing TransposeConfirmModal flow
   [Cancel clicked]     --> setPendingKeyCheck(null)
```

## Edge cases

- **No chords in song**: toast, no modal.
- **Slash chords**: root before the slash is used for matching; bass note ignored.
- **Short/sparse songs (few unique chords)**: ambiguity guard (see algorithm step 6) prevents noisy false-positive key mismatches when the evidence is thin.
- **Ties between candidate keys**: prefer the stated key if it's among the top-scoring keys, to avoid unnecessary "mismatch" flags on genuinely ambiguous short songs.

## Testing

- Unit tests for `keyChecker.js` in `src/lib/parser/__tests__/keyChecker.test.js`:
  - The B major / C-declared example from the original research write-up (B, E, F#, G#m chords → detects B major, flags mismatch).
  - A clean diatonic progression with one deliberately non-diatonic chord → correct single outlier flagged.
  - No-chord input → `outlierChords: []`, no crash.
  - Slash chords resolve correctly by root.
  - Short/ambiguous song does not trigger a false mismatch.
- Component tests for `KeyCheckModal` (open/closed rendering, matches vs. mismatch states, Update key/Cancel callbacks).
- Integration test in `SongEditor` test suite: button click → toast on no-issues case, modal opens on mismatch/outlier case, Update key routes through the existing transpose-confirm flow.

All tests follow the existing Vitest + Testing Library conventions already used across `src/lib/parser/__tests__/` and `src/components/SongEditor/`.
