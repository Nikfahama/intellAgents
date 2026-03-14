import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'app-theme-settings'
const DEFAULTS = { theme: 'orange', borderColor: '#cc7000', borderResolution: '110m', clusterRadius: 0.5 }

const THEMES = {
  dark: {
    '--bg-primary': '#000000',
    '--bg-secondary': '#0a0a0a',
    '--bg-tertiary': '#141414',
    '--bg-hover': '#1e1e1e',
    '--text-primary': '#8a8a8a',
    '--text-secondary': '#5a5a5a',
    '--text-muted': '#3a3a3a',
    '--accent': '#00bb30',
    '--accent-hover': '#009926',
    '--accent-dim': '#081808',
    '--accent-glow': 'rgba(0, 187, 48, 0.08)',
    '--border': '#1a1a1a',
    '--border-bright': '#2a2a2a',
    '--success': '#00bb30',
    '--warning': '#99aa00',
    '--danger': '#dd3333',
    '--scanline': 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.004) 2px, rgba(255, 255, 255, 0.004) 4px)',
  },
  orange: {
    '--bg-primary': '#000000',
    '--bg-secondary': '#0c0a08',
    '--bg-tertiary': '#161210',
    '--bg-hover': '#201a15',
    '--text-primary': '#9a8a7a',
    '--text-secondary': '#6a5a48',
    '--text-muted': '#4a3a2a',
    '--accent': '#cc7000',
    '--accent-hover': '#aa5c00',
    '--accent-dim': '#1a1000',
    '--accent-glow': 'rgba(204, 112, 0, 0.08)',
    '--border': '#1e1810',
    '--border-bright': '#302518',
    '--success': '#cc7000',
    '--warning': '#cc8800',
    '--danger': '#dd3333',
    '--scanline': 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 140, 0, 0.005) 2px, rgba(255, 140, 0, 0.005) 4px)',
  },
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch (_) {}
  return { ...DEFAULTS }
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch (_) {}
}

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings)

  const setTheme = useCallback((theme) => {
    const next = { ...settings, theme }
    saveSettings(next)
    setSettings(next)
  }, [settings])

  const setBorderColor = useCallback((borderColor) => {
    const next = { ...settings, borderColor }
    saveSettings(next)
    setSettings(next)
  }, [settings])

  const setBorderResolution = useCallback((borderResolution) => {
    const next = { ...settings, borderResolution }
    saveSettings(next)
    setSettings(next)
  }, [settings])

  const setClusterRadius = useCallback((clusterRadius) => {
    const next = { ...settings, clusterRadius }
    saveSettings(next)
    setSettings(next)
  }, [settings])

  useEffect(() => {
    const theme = THEMES[settings.theme] || THEMES.orange
    const root = document.documentElement
    for (const [prop, value] of Object.entries(theme)) {
      root.style.setProperty(prop, value)
    }
    // Globe border color as a CSS var
    root.style.setProperty('--globe-border', settings.borderColor || '#cc7000')
  }, [settings.theme, settings.borderColor])

  return (
    <ThemeContext.Provider value={{
      theme: settings.theme,
      setTheme,
      borderColor: settings.borderColor || '#cc7000',
      setBorderColor,
      borderResolution: settings.borderResolution || '110m',
      setBorderResolution,
      clusterRadius: settings.clusterRadius ?? 0.5,
      setClusterRadius,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
