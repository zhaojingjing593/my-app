import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './components/LoginPage'
import SearchPage from './components/SearchPage'
import OnboardingPage from './components/OnboardingPage'
import { getStore, setStore, applyTheme, applyFontSize, applyFontFamily } from './services/storageService'
import { isOnboardingDone, getFontSize, getFontFamily } from './services/recommendationService'
import { setTranslationConfig } from './services/translateService'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

const DEFAULT_THEME = '#E8D5F5'

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME)
  const [searchHistory, setSearchHistory] = useState([])
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fontSize, setFontSize] = useState('medium')
  const [fontFamily, setFontFamily] = useState('system')

  useEffect(() => {
    const init = async () => {
      const session = await getStore('session')
      if (session?.email) {
        const users = (await getStore('users')) || {}
        const prefs = users[session.email] || {}
        setCurrentUser(session.email)
        setSearchHistory(prefs.searchHistory || [])
        const color = prefs.themeColor || DEFAULT_THEME
        setThemeColor(color)
        applyTheme(color)

        // Load font preferences
        const fs = await getFontSize(session.email)
        const ff = await getFontFamily(session.email)
        setFontSize(fs)
        setFontFamily(ff)
        applyFontSize(fs)
        applyFontFamily(ff)

        // Set translation config
        if (prefs.deepseekApiKey) {
          setTranslationConfig({ provider: 'deepseek', apiKey: prefs.deepseekApiKey })
        }

        // Check onboarding
        const done = await isOnboardingDone(session.email)
        setNeedsOnboarding(!done)
      } else {
        applyTheme(DEFAULT_THEME)
        applyFontSize('medium')
        applyFontFamily('system')
      }
      setLoading(false)
    }
    init()
  }, [])

  const login = useCallback(async (email) => {
    setCurrentUser(email)
    await setStore('session', { email })
    const users = (await getStore('users')) || {}
    const prefs = users[email] || {}
    setSearchHistory(prefs.searchHistory || [])
    const color = prefs.themeColor || DEFAULT_THEME
    setThemeColor(color)
    applyTheme(color)

    // Set translation config
    if (prefs.deepseekApiKey) {
      setTranslationConfig({ provider: 'deepseek', apiKey: prefs.deepseekApiKey })
    }

    // Load font preferences
    const fs = await getFontSize(email)
    const ff = await getFontFamily(email)
    setFontSize(fs)
    setFontFamily(ff)
    applyFontSize(fs)
    applyFontFamily(ff)

    const done = await isOnboardingDone(email)
    setNeedsOnboarding(!done)
  }, [])

  const logout = useCallback(async () => {
    setCurrentUser(null)
    setSearchHistory([])
    setNeedsOnboarding(false)
    await setStore('session', null)
  }, [])

  const updateTheme = useCallback(async (color) => {
    setThemeColor(color)
    applyTheme(color)
    if (currentUser) {
      const users = (await getStore('users')) || {}
      users[currentUser] = { ...(users[currentUser] || {}), themeColor: color }
      await setStore('users', users)
    }
  }, [currentUser])

  const updateFontSize = useCallback(async (size) => {
    setFontSize(size)
    applyFontSize(size)
    if (currentUser) {
      const users = (await getStore('users')) || {}
      users[currentUser] = { ...(users[currentUser] || {}), fontSize: size }
      await setStore('users', users)
    }
  }, [currentUser])

  const updateFontFamily = useCallback(async (family) => {
    setFontFamily(family)
    applyFontFamily(family)
    if (currentUser) {
      const users = (await getStore('users')) || {}
      users[currentUser] = { ...(users[currentUser] || {}), fontFamily: family }
      await setStore('users', users)
    }
  }, [currentUser])

  const addToHistory = useCallback(async (keyword) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(k => k !== keyword)
      const next = [keyword, ...filtered].slice(0, 10)
      if (currentUser) {
        getStore('users').then(users => {
          const u = users || {}
          u[currentUser] = { ...(u[currentUser] || {}), searchHistory: next }
          setStore('users', u)
        })
      }
      return next
    })
  }, [currentUser])

  const removeFromHistory = useCallback(async (keyword) => {
    setSearchHistory(prev => {
      const next = prev.filter(k => k !== keyword)
      if (currentUser) {
        getStore('users').then(users => {
          const u = users || {}
          u[currentUser] = { ...(u[currentUser] || {}), searchHistory: next }
          setStore('users', u)
        })
      }
      return next
    })
  }, [currentUser])

  if (loading) return <div className="app-loading">加载中...</div>

  return (
    <AppContext.Provider value={{
      currentUser, login, logout,
      themeColor, updateTheme,
      fontSize, updateFontSize,
      fontFamily, updateFontFamily,
      searchHistory, addToHistory, removeFromHistory,
    }}>
      <HashRouter>
        <Routes>
          <Route path="/" element={currentUser ? <Navigate to={needsOnboarding ? '/onboarding' : '/search'} replace /> : <LoginPage />} />
          <Route path="/search" element={currentUser ? <SearchPage /> : <Navigate to="/" replace />} />
          <Route path="/onboarding" element={currentUser ? <OnboardingPage /> : <Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppContext.Provider>
  )
}
