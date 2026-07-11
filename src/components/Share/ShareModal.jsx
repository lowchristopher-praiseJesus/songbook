import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { uploadShare, updateShare, checkShareVersion, setShareLocked } from '../../lib/shareApi';
import { exportSongsAsSbp, computeExportId } from '../../lib/exportSbp';
import { createConductorSession } from '../../lib/conductorApi';
import { useLibraryStore } from '../../store/libraryStore';
import { loadSong, getTransposeState } from '../../lib/storage';
import { transposeChord } from '../../lib/parser/chordUtils';
import { useLicense } from '../../contexts/LicenseContext';
import useTurnstile from '../../hooks/useTurnstile';

export function ShareModal({ isOpen, songs, collectionName, collectionId, onClose }) {
  const { isLicensed, licenseStatus, licenseToken } = useLicense();
  const { getToken } = useTurnstile();
  const [step, setStep] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [nameValue, setNameValue] = useState(collectionName ?? '');
  const [shareLyricsOnly, setShareLyricsOnly] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [lockStatus, setLockStatus] = useState('idle'); // 'idle' | 'checking' | 'saving' | 'error'
  const [pinInputMode, setPinInputMode] = useState('none'); // 'none' | 'set' | 'enter'
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);
  const [conductorEnabled, setConductorEnabled] = useState(false)
  const maxCap = Number(import.meta.env.VITE_CONDUCTOR_MAX_FOLLOWERS ?? 20)
  const [maxFollowers, setMaxFollowers] = useState(maxCap)
  const [broadcastTime, setBroadcastTime] = useState('')

  // Sync nameValue from prop each time the modal opens (useState initial value
  // is only evaluated once on mount, so prop changes after mount are ignored).
  useEffect(() => {
    if (isOpen) setNameValue(collectionName ?? '')
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [shareUrl, setShareUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef(null);
  const [conductorData, setConductorData] = useState(null) // { conductorCode, directorToken, directorUrl, memberUrl, selfDirect }
  const [selfDirect, setSelfDirect] = useState(true)
  const directorQrRef = useRef(null)
  const updateCollection = useLibraryStore(s => s.updateCollection)
  const backfillSongSbpId = useLibraryStore(s => s.backfillSongSbpId)
  const stampSharedBaseline = useLibraryStore(s => s.stampSharedBaseline)
  const collections = useLibraryStore(s => s.collections)
  const collection = collectionId ? collections.find(c => c.id === collectionId) : null
  const isUpdateMode = !!collection?.shareCode
  const existingShareUrl = isUpdateMode
    ? `${window.location.origin}/?share=${collection.shareCode}`
    : ''

  // Live-check lock state on open — another holder of the link may have
  // changed it since we last saw this collection, so we never trust a stale cache.
  useEffect(() => {
    if (!isOpen || !isUpdateMode) return;
    let cancelled = false;
    setLockStatus('checking');
    checkShareVersion(collection.shareCode)
      .then(({ locked: serverLocked, hasPin: serverHasPin }) => {
        if (cancelled) return;
        setLocked(serverLocked);
        setHasPin(serverHasPin);
        setLockStatus('idle');
      })
      .catch(() => {
        if (cancelled) return;
        setLockStatus('idle');
      });
    return () => { cancelled = true };
  }, [isOpen, isUpdateMode, collection?.shareCode]);

  // Render QR code once the done step is visible and canvas is in the DOM
  useEffect(() => {
    if (step === 'done' && shareUrl && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, shareUrl, { width: 220, margin: 2 })
    }
    if (step === 'done' && conductorData?.directorUrl && directorQrRef.current) {
      QRCode.toCanvas(directorQrRef.current, conductorData.directorUrl, { width: 220, margin: 2 })
    }
  }, [step, shareUrl, conductorData]);

  async function handleCreateLink() {
    setStep('uploading')
    setErrorMessage('')
    try {
      let conductorCode = null
      let directorToken = null

      if (conductorEnabled) {
        try {
          const conductorToken = await getToken();
          const conductorResult = await createConductorSession({ maxFollowers, licenseToken, turnstileToken: conductorToken })
          conductorCode = conductorResult.conductorCode
          directorToken = conductorResult.directorToken
        } catch (err) {
          console.error('[ShareModal] conductor session creation failed:', err)
          setErrorMessage('Conductor session could not be created. The share link was not saved.')
          setStep('error')
          return
        }
      }

      const blob = await exportSongsAsSbp(songs, nameValue.trim() || null, shareLyricsOnly, conductorCode)

      let result
      try {
        const shareToken = await getToken();
        result = await uploadShare(blob, expiresInDays, shareToken, locked, locked ? pinValue : null)
      } catch (err) {
        console.error('[ShareModal] upload failed:', err)
        setErrorMessage('Upload failed. Please check your connection and try again.')
        setStep('error')
        return
      }

      // Backfill sbpId on in-app-created songs so conductor sync can track them
      songs.forEach(song => {
        if (song.meta.sbpId == null) {
          backfillSongSbpId(song.id, computeExportId(song))
        }
      })
      // Stamp sharedBaseline so the sharer receives updates pushed by recipients
      songs.forEach(song => stampSharedBaseline(song.id))

      // Save shareCode on the sharer's collection so Push Update / Check for updates work next time
      if (collectionId) {
        const shareCode = result.shareCode ?? new URL(result.shareUrl).searchParams.get('share')
        updateCollection(collectionId, { shareCode, lastVersion: 1 })
      }

      if (conductorEnabled) {
        const memberUrl = broadcastTime
          ? `${result.shareUrl}&bt=${encodeURIComponent(new Date(broadcastTime).toISOString())}`
          : result.shareUrl
        const directorUrl = `${result.shareUrl}&conductor_token=${directorToken}`
        // Self-direct: wire the conductor token into the existing local collection
        if (selfDirect && collectionId) {
          const shareCode = result.shareCode ?? new URL(result.shareUrl).searchParams.get('share')
          updateCollection(collectionId, {
            conductorCode,
            conductorDirectorToken: directorToken,
            conductorRole: 'conductor',
            conductorShareCode: shareCode,
            conductorCreatedAt: new Date().toISOString(),
            conductorExpiresAt: result.expiresAt,
          })
        }
        setConductorData({ conductorCode, directorToken, directorUrl, memberUrl, selfDirect })
        setShareUrl(memberUrl)
      } else {
        setShareUrl(result.shareUrl)
      }
      setExpiresAt(result.expiresAt)
      setStep('done')
    } catch (err) {
      console.error('[ShareModal] unexpected error:', err)
      setErrorMessage('An unexpected error occurred. Please try again.')
      setStep('error')
    }
  }

  async function handlePushUpdate() {
    if (!collection) return
    setStep('uploading')
    setErrorMessage('')
    try {
      // Always derive songs from the collection's current songIds so that
      // additions and removals since the modal opened are reflected in the ZIP.
      const collectionSongs = collection.songIds.map(id => {
        const song = loadSong(id)
        if (!song) return null
        const ts = getTransposeState(id)
        const delta = ts?.delta ?? 0
        const capo = ts?.capo ?? song.meta.capo ?? 0
        const usesFlats = song.meta.usesFlats ?? false
        const newKeyIndex = (((song.meta.keyIndex ?? 0) + delta) % 12 + 12) % 12
        const rawText = delta === 0
          ? (song.rawText ?? '')
          : (song.rawText ?? '').replace(/\[([^\]]+)\]/g, (_, chord) =>
              '[' + transposeChord(chord, delta, usesFlats) + ']'
            )
        return { ...song, rawText, meta: { ...song.meta, keyIndex: newKeyIndex, capo } }
      }).filter(Boolean)

      const blob = await exportSongsAsSbp(collectionSongs, nameValue.trim() || null, shareLyricsOnly, null)
      const result = await updateShare(collection.shareCode, blob)
      if (collectionId) updateCollection(collectionId, { lastVersion: result.version })
      // Update baseline so the sharer's songs look "in sync" after pushing;
      // prevents false merge conflicts when recipients push further changes.
      collection.songIds.forEach(id => stampSharedBaseline(id))
      setExpiresAt(result.updatedAt ?? new Date().toISOString())
      setStep('update-done')
    } catch (err) {
      console.error('[ShareModal] push update failed:', err)
      if (err.code === 'locked') {
        setLocked(true)
        setErrorMessage('This link is locked. Unlock it before pushing updates.')
      } else {
        setErrorMessage('Update failed. Please check your connection and try again.')
      }
      setStep('error')
    }
  }

  function handleToggleLocked() {
    setPinError('');
    if (!isUpdateMode) {
      // Create mode: nothing is persisted server-side yet, so toggling is purely local.
      if (locked) {
        setLocked(false);
        setPinValue('');
        setPinInputMode('none');
      } else {
        setPinInputMode('set');
      }
      return;
    }
    if (locked) {
      setPinInputMode('enter');
      return;
    }
    if (hasPin) {
      relockSilently();
    } else {
      setPinInputMode('set');
    }
  }

  async function relockSilently() {
    setLocked(true);
    setLockStatus('saving');
    try {
      await setShareLocked(collection.shareCode, true);
      setLockStatus('idle');
    } catch (err) {
      console.error('[ShareModal] silent re-lock failed:', err);
      setLocked(false);
      setLockStatus('error');
    }
  }

  async function handleSetPinSubmit() {
    if (!/^\d{4}$/.test(pinValue)) {
      setPinError('Enter a 4-digit PIN.');
      return;
    }
    if (!isUpdateMode) {
      // Create mode: no network call yet — applied when Create link is clicked.
      setLocked(true);
      setPinInputMode('none');
      setPinError('');
      return;
    }
    setLockStatus('saving');
    try {
      await setShareLocked(collection.shareCode, true, pinValue);
      setLocked(true);
      setHasPin(true);
      setPinInputMode('none');
      setPinValue('');
      setPinError('');
      setLockStatus('idle');
    } catch (err) {
      console.error('[ShareModal] lock with pin failed:', err);
      setPinError("Couldn't lock — check your connection.");
      setLockStatus('idle');
    }
  }

  async function handleUnlockPinSubmit() {
    if (!/^\d{4}$/.test(pinValue)) {
      setPinError('Enter a 4-digit PIN.');
      return;
    }
    setLockStatus('saving');
    try {
      await setShareLocked(collection.shareCode, false, pinValue);
      setLocked(false);
      setPinInputMode('none');
      setPinValue('');
      setPinError('');
      setPinAttempts(0);
      setLockStatus('idle');
    } catch (err) {
      if (err.code === 'invalid_pin') {
        setPinAttempts(a => a + 1);
        setPinError('Incorrect PIN.');
        setPinValue('');
        setLockStatus('idle');
      } else {
        console.error('[ShareModal] unlock failed:', err);
        setPinInputMode('none');
        setPinValue('');
        setLockStatus('error');
      }
    }
  }

  function handlePinCancel() {
    setPinInputMode('none');
    setPinValue('');
    setPinError('');
    setPinAttempts(0);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — user can manually copy the URL
    }
  }

  function handleDownloadQr(ref, filename = 'share-qr.png') {
    const qr = ref.current
    if (!qr) return

    const name = nameValue.trim()
    const expiry = `Expires ${new Date(expiresAt).toLocaleDateString()}`
    const padding = 16
    const lineHeight = 20
    const textLines = name ? [name, expiry] : [expiry]

    const offscreen = document.createElement('canvas')
    offscreen.width = qr.width + padding * 2
    offscreen.height = qr.height + padding * 2 + textLines.length * lineHeight + padding

    const ctx = offscreen.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, offscreen.width, offscreen.height)
    ctx.drawImage(qr, padding, padding)

    let y = qr.height + padding * 2 + lineHeight / 2
    textLines.forEach((line, i) => {
      ctx.font = i === 0 && name ? 'bold 14px sans-serif' : '12px sans-serif'
      ctx.fillStyle = i === 0 && name ? '#1f2937' : '#6b7280'
      ctx.textAlign = 'center'
      ctx.fillText(line, offscreen.width / 2, y)
      y += lineHeight
    })

    const a = document.createElement('a')
    a.href = offscreen.toDataURL('image/png')
    a.download = filename
    a.click()
  }

  function handleClose() {
    setStep('idle');
    setErrorMessage('');
    setNameValue(collectionName ?? '');
    setExpiresInDays(7);
    setShareUrl('');
    setCopied(false);
    setShareLyricsOnly(false);
    setLocked(false);
    setLockStatus('idle');
    setConductorEnabled(false);
    setMaxFollowers(maxCap);
    setBroadcastTime('');
    setConductorData(null);
    setSelfDirect(true);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} title="Share via link" onClose={handleClose}>
      {step === 'idle' && (
        <div className="space-y-4">
          {isUpdateMode && (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2 mb-3">
              <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">🔗 Live link exists</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                Created {Math.round((Date.now() - new Date(collection.createdAt).getTime()) / 86_400_000)} days ago · v{collection.lastVersion ?? 1}
              </p>
            </div>
          )}
          {isUpdateMode && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current share URL</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={existingShareUrl}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                />
                <Button variant="secondary" onClick={() => {
                  navigator.clipboard.writeText(existingShareUrl).catch(() => {})
                }}>Copy</Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">New link creates a separate URL and does not update this one</p>
            </div>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {songs.length} song{songs.length !== 1 ? 's' : ''} will be shared.
          </p>
          <div>
            <label className={`block text-sm font-medium mb-1 ${isUpdateMode ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
              Collection name <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="e.g. Easter Set"
              disabled={isUpdateMode}
              className={`w-full rounded-lg border px-3 py-2 text-sm placeholder-gray-400 dark:placeholder-gray-500
                ${isUpdateMode
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1 ${isUpdateMode ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
              Link expires in
            </label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              disabled={isUpdateMode}
              className={`w-full rounded-lg border px-3 py-2 text-sm
                ${isUpdateMode
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
            >
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} day{d !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="button"
              role="switch"
              aria-checked={shareLyricsOnly}
              aria-label="Share lyrics only"
              onClick={() => !isUpdateMode && setShareLyricsOnly(v => !v)}
              disabled={isUpdateMode}
              className={`flex items-center gap-3 w-full text-left ${isUpdateMode ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200
                ${shareLyricsOnly ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                  ${shareLyricsOnly ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className={`text-sm ${isUpdateMode ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>Share lyrics only</span>
            </button>
          </div>
          <div>
            <button
              type="button"
              role="switch"
              aria-checked={locked}
              aria-label="Lock link"
              onClick={handleToggleLocked}
              disabled={lockStatus === 'checking' || lockStatus === 'saving'}
              className={`flex items-center gap-3 w-full text-left ${lockStatus === 'checking' || lockStatus === 'saving' ? 'opacity-50 cursor-wait' : ''}`}
            >
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200
                ${locked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                  ${locked ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Lock link</span>
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-14">
              When locked, no one — including you — can push new content until you unlock it.
            </p>
            {pinInputMode !== 'none' && (
              <div className="mt-2 ml-14 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4-digit PIN"
                  aria-label="PIN"
                  className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                />
                <Button variant="primary" onClick={pinInputMode === 'set' ? handleSetPinSubmit : handleUnlockPinSubmit}>
                  {pinInputMode === 'set' ? 'Lock' : 'Unlock'}
                </Button>
                <Button variant="ghost" onClick={handlePinCancel}>Cancel</Button>
              </div>
            )}
            {pinError && <p className="text-xs text-red-500 mt-1 ml-14">{pinError}</p>}
            {pinAttempts >= 3 && (
              <p className="text-xs text-gray-400 mt-1 ml-14">Forgot your PIN? Use "New Link" to start over.</p>
            )}
            {lockStatus === 'error' && !pinError && (
              <p className="text-xs text-red-500 mt-1 ml-14">Couldn't update lock — check your connection.</p>
            )}
          </div>
          {/* Conductor broadcast section */}
          {isLicensed ? (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <button
              type="button"
              role="switch"
              aria-checked={conductorEnabled}
              aria-label="Enable Conductor Broadcast"
              onClick={() => !isUpdateMode && setConductorEnabled(v => !v)}
              disabled={isUpdateMode}
              className={`flex items-center gap-3 w-full text-left ${isUpdateMode ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200
                ${conductorEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                  ${conductorEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className={`text-sm ${isUpdateMode ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>Enable Conductor Broadcast</span>
            </button>
            {conductorEnabled && collectionId && (
              <div className="mt-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={selfDirect}
                  aria-label="I'll be conducting this myself"
                  onClick={() => setSelfDirect(v => !v)}
                  className="flex items-center gap-3 w-full text-left"
                >
                  <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                    transition-colors duration-200
                    ${selfDirect ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                      ${selfDirect ? 'translate-x-5' : 'translate-x-0'}`} />
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">I'll be conducting this myself</span>
                </button>
              </div>
            )}
            {conductorEnabled && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 dark:text-gray-400 shrink-0" htmlFor="maxFollowers">
                    Max followers
                  </label>
                  <input
                    id="maxFollowers"
                    type="number"
                    min={1}
                    max={maxCap}
                    value={maxFollowers}
                    onChange={e => setMaxFollowers(Math.min(Number(e.target.value), maxCap))}
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                    aria-label="Max followers"
                  />
                  <span className="text-xs text-gray-400">(max: {maxCap})</span>
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1" htmlFor="broadcastTime">
                    Scheduled broadcast time <span className="text-gray-400 dark:text-gray-500">(optional)</span>
                  </label>
                  <input
                    id="broadcastTime"
                    type="datetime-local"
                    value={broadcastTime}
                    onChange={e => setBroadcastTime(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                    aria-label="Scheduled broadcast time"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Followers won't probe the server until 30 min before this time.
                  </p>
                </div>
              </div>
            )}
          </div>
          ) : null}
          {isUpdateMode && locked && (
            <p className="text-xs text-gray-400 text-right">Push Update is disabled — this link is locked.</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            {isUpdateMode ? (
              <>
                <Button variant="secondary" onClick={handleCreateLink} aria-label="New link">
                  New link
                </Button>
                <Button variant="primary" onClick={handlePushUpdate} aria-label="Push Update" disabled={locked || lockStatus === 'checking'}>
                  Push Update
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={handleCreateLink}>Create link</Button>
            )}
          </div>
        </div>
      )}

      {step === 'uploading' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Uploading…</p>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Link expires {new Date(expiresAt).toLocaleDateString()}.
          </p>

          {/* Member link */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Member link</p>
            <div className="flex gap-2">
              <input readOnly value={shareUrl}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm" />
              <Button variant="secondary" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
            <div className="flex flex-col items-center gap-2 mt-2">
              <canvas ref={qrCanvasRef} className="rounded-lg border border-gray-200 dark:border-gray-700" />
              <Button variant="secondary" onClick={() => handleDownloadQr(qrCanvasRef, 'member-qr.png')}>Save Member QR</Button>
            </div>
          </div>

          {/* Conductor link — only when conductor enabled AND not self-directing */}
          {conductorData && !conductorData.selfDirect && (
            <div className="border-t border-orange-200 dark:border-orange-800 pt-3">
              <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
                Conductor link &nbsp;⚠ Keep private — gives broadcast control
              </p>
              <div className="flex gap-2">
                <input readOnly value={conductorData.directorUrl}
                  className="flex-1 rounded-lg border border-orange-300 dark:border-orange-700 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm" />
                <Button variant="secondary" onClick={() => {
                  navigator.clipboard.writeText(conductorData.directorUrl).catch(() => {})
                }}>Copy</Button>
              </div>
              <div className="flex flex-col items-center gap-2 mt-2">
                <canvas ref={directorQrRef} className="rounded-lg border border-orange-200 dark:border-orange-700" />
                <Button variant="secondary" onClick={() => handleDownloadQr(directorQrRef, 'director-qr.png')}>Save Conductor QR</Button>
              </div>
            </div>
          )}
          {/* Self-directing: reassure user they're set up */}
          {conductorData?.selfDirect && (
            <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-3">
              ✓ You're set up as the Conductor. Open the Broadcasts panel to start when ready.
            </p>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}

      {step === 'update-done' && (
        <div className="space-y-4">
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ Link updated. Recipients can now tap "Check for updates" to see your changes.
          </p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            {errorMessage || 'An unexpected error occurred. Please try again.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={() => setStep('idle')}>Retry</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
