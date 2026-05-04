import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { uploadShare } from '../../lib/shareApi';
import { exportSongsAsSbp } from '../../lib/exportSbp';
import { createConductorSession } from '../../lib/conductorApi';
import { v4 as uuidv4 } from 'uuid';
import { useLibraryStore } from '../../store/libraryStore';

export function ShareModal({ isOpen, songs, collectionName, collectionId, onClose }) {
  const [step, setStep] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [nameValue, setNameValue] = useState(collectionName ?? '');
  const [shareLyricsOnly, setShareLyricsOnly] = useState(false);
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
        conductorCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
        directorToken = uuidv4()
      }

      const blob = await exportSongsAsSbp(songs, nameValue.trim() || null, shareLyricsOnly, conductorCode)

      let result
      try {
        result = await uploadShare(blob, expiresInDays)
      } catch (err) {
        console.error('[ShareModal] upload failed:', err)
        setErrorMessage('Upload failed. Please check your connection and try again.')
        setStep('error')
        return
      }

      if (conductorEnabled) {
        try {
          await createConductorSession({ conductorCode, directorToken, maxFollowers })
        } catch (err) {
          console.error('[ShareModal] conductor session creation failed:', err)
          setErrorMessage('Conductor session could not be created. The share link was not saved.')
          setStep('error')
          return
        }
        const memberUrl = broadcastTime
          ? `${result.shareUrl}&bt=${encodeURIComponent(new Date(broadcastTime).toISOString())}`
          : result.shareUrl
        const directorUrl = `${result.shareUrl}&director=${directorToken}`
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
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {songs.length} song{songs.length !== 1 ? 's' : ''} will be shared.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Collection name <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="e.g. Easter Set"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Link expires in
            </label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
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
              onClick={() => setShareLyricsOnly(v => !v)}
              className="flex items-center gap-3 w-full text-left"
            >
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200
                ${shareLyricsOnly ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                  ${shareLyricsOnly ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Share lyrics only</span>
            </button>
          </div>
          {/* Conductor broadcast section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <button
              type="button"
              role="switch"
              aria-checked={conductorEnabled}
              aria-label="Enable Conductor Broadcast"
              onClick={() => setConductorEnabled(v => !v)}
              className="flex items-center gap-3 w-full text-left"
            >
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200
                ${conductorEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                  ${conductorEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Enable Conductor Broadcast</span>
            </button>
            {conductorEnabled && (
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
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateLink}>Create link</Button>
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

          {/* Director link — only when conductor enabled AND not self-directing */}
          {conductorData && !conductorData.selfDirect && (
            <div className="border-t border-orange-200 dark:border-orange-800 pt-3">
              <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
                Director link &nbsp;⚠ Keep private — gives broadcast control
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
                <Button variant="secondary" onClick={() => handleDownloadQr(directorQrRef, 'director-qr.png')}>Save Director QR</Button>
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
