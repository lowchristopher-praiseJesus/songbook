import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
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

  const validateGenRef = useRef(0)
  const validateKey = useCallback(async (key) => {
    const gen = ++validateGenRef.current
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
      if (gen !== validateGenRef.current) return
      saveLicenseToken(token)
      setLicenseToken(token)
      setLicenseStatus('valid')
    } catch (err) {
      if (gen !== validateGenRef.current) return
      clearLicenseToken()
      setLicenseToken(null)
      setLicenseStatus(err.code === 'expired' ? 'expired' : 'invalid')
    } finally {
      if (gen === validateGenRef.current) setValidating(false)
    }
  }, [])

  const mountValidationRan = useRef(false)
  // On mount: re-validate if we have a key but the stored token is missing or expired.
  useEffect(() => {
    if (!mountValidationRan.current) {
      mountValidationRan.current = true
      if (licenseKey && isTokenExpired(licenseToken)) {
        validateKey(licenseKey)
      }
    }
  }, [licenseKey, licenseToken, validateKey])

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
