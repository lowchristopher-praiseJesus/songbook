import { createContext, useContext, useMemo } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { getLicenseStatus } from '../lib/licenseValidation'

export const LicenseContext = createContext()

export function LicenseProvider({ children }) {
  const [licenseKey, setLicenseKey] = useLocalStorage('songsheet_conductor_license', null)

  const licenseStatus = useMemo(() => getLicenseStatus(licenseKey), [licenseKey])
  const isLicensed = licenseStatus === 'valid'

  return (
    <LicenseContext.Provider value={{ licenseKey, setLicenseKey, licenseStatus, isLicensed }}>
      {children}
    </LicenseContext.Provider>
  )
}

export const useLicense = () => useContext(LicenseContext)
