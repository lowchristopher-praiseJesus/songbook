import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import {
  validateLicenseWithServer,
  saveLicenseToken,
  loadLicenseToken,
  clearLicenseToken,
  isTokenExpired,
} from '../lib/licenseApi'

export const LicenseContext = createContext()

export function LicenseProvider({ children }) {
  const [licenseKey, setLicenseKeyRaw] = useLocalStorage('songsheet_conductor_license', null)

  const [licenseToken, setLicenseToken] = useState(() => {
    const stored = loadLicenseToken()
    return stored && !isTokenExpired(stored) ? stored : null
  })

  // 'missing' | 'invalid_format' | 'invalid' | 'expired' | 'pending' | 'valid'
  const [licenseStatus, setLicenseStatus] = useState(() =>
    licenseToken ? 'valid' : (licenseKey ? 'pending' : 'missing')
  )
  const [validating, setValidating] = useState(false)

  const validateKey = useCallback(async (key) => {
    if (!key) {
      setLicenseToken(null)
      clearLicenseToken()
      setLicenseStatus('missing')
      return
    }
    setValidating(true)
    setLicenseStatus('pending')
    try {
      const { token } = await validateLicenseWithServer(key)
      saveLicenseToken(token)
      setLicenseToken(token)
      setLicenseStatus('valid')
    } catch (err) {
      clearLicenseToken()
      setLicenseToken(null)
      setLicenseStatus(err.code === 'expired' ? 'expired' : 'invalid')
    } finally {
      setValidating(false)
    }
  }, [])

  // On mount: re-validate if we have a key but the stored token is missing or expired.
  useEffect(() => {
    if (licenseKey && isTokenExpired(licenseToken)) {
      validateKey(licenseKey)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setLicenseKey = useCallback((key) => {
    setLicenseKeyRaw(key)
    validateKey(key)
  }, [setLicenseKeyRaw, validateKey])

  const isLicensed = licenseStatus === 'valid'

  return (
    <LicenseContext.Provider
      value={{ licenseKey, setLicenseKey, licenseStatus, isLicensed, validating, licenseToken }}
    >
      {children}
    </LicenseContext.Provider>
  )
}

export const useLicense = () => useContext(LicenseContext)
