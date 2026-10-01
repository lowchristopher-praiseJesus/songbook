import { createContext, useContext, useEffect } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('songsheet_theme', 'light')
  // Christmas only: 'auto' follows the OS, 'light'/'dark' force a variant
  const [christmasMode, setChristmasMode] = useLocalStorage('songsheet_christmas_mode', 'auto')

  useEffect(() => {
    const root = document.documentElement
    const forced = theme === 'christmas' && (christmasMode === 'light' || christmasMode === 'dark') ? christmasMode : null
    const followsSystem = !forced && (theme === 'system' || theme === 'christmas')
    const mq = followsSystem ? window.matchMedia('(prefers-color-scheme: dark)') : null

    // Christmas has a light (snow) and dark (evergreen) variant, chosen by christmasMode or else the OS setting
    function apply() {
      const isDark = theme === 'dark' || forced === 'dark' || (mq ? mq.matches : false)
      root.classList.toggle('dark', isDark)
      if (theme === 'christmas') root.setAttribute('data-theme', 'christmas')
      else root.removeAttribute('data-theme')
    }

    apply()
    if (!mq) return undefined
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme, christmasMode])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, christmasMode, setChristmasMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
