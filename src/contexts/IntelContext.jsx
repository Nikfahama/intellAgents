import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { fetchAllFeeds } from '../utils/intel'
import { NEWS_SOURCES } from '../utils/sources'
import { isAIEnabled, processArticlesWithAI } from '../utils/ai'

const CACHE_KEY = 'osmap-article-cache'
const CACHE_TS_KEY = 'osmap-article-cache-ts'
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

function loadCache() {
  try {
    const ts = Number(localStorage.getItem(CACHE_TS_KEY) || '0')
    if (Date.now() - ts > CACHE_TTL) return null
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveCache(articles) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(articles))
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()))
  } catch {}
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem(CACHE_TS_KEY)
}

const IntelContext = createContext()

export function IntelProvider({ children }) {
  const [articles, setArticles] = useState(() => loadCache() || [])
  const [loading, setLoading] = useState(() => !loadCache())
  const [loadingStatus, setLoadingStatus] = useState('')
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [customSources, setCustomSources] = useState(() => {
    try { return JSON.parse(localStorage.getItem('osmap-custom-sources') || '[]') } catch { return [] }
  })
  const allSources = [...NEWS_SOURCES, ...customSources]
  const [enabledSources, setEnabledSources] = useState(() => new Set(NEWS_SOURCES.map(s => s.id)))
  const [flows, setFlows] = useState(() => {
    try { return JSON.parse(localStorage.getItem('osmap-flows') || '[]') } catch { return [] }
  })
  const fetchingRef = useRef(false)
  const enabledRef = useRef(enabledSources)
  enabledRef.current = enabledSources
  const customSourcesRef = useRef(customSources)
  customSourcesRef.current = customSources

  // Persist custom sources and flows
  useEffect(() => {
    localStorage.setItem('osmap-custom-sources', JSON.stringify(customSources))
  }, [customSources])

  useEffect(() => {
    localStorage.setItem('osmap-flows', JSON.stringify(flows))
  }, [flows])

  const saveFlow = useCallback((flow) => {
    setFlows(prev => {
      const idx = prev.findIndex(f => f.id === flow.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = flow; return next }
      return [...prev, flow]
    })
  }, [])

  const deleteFlow = useCallback((id) => {
    setFlows(prev => prev.filter(f => f.id !== id))
  }, [])

  const toggleFlow = useCallback((id) => {
    setFlows(prev => prev.map(f => f.id === id ? { ...f, active: !f.active } : f))
  }, [])

  // Auto-enable new custom sources
  const addCustomSources = useCallback((sources) => {
    setCustomSources(prev => {
      const existingIds = new Set(prev.map(s => s.id))
      const newOnes = sources.filter(s => !existingIds.has(s.id))
      return [...prev, ...newOnes]
    })
    setEnabledSources(prev => {
      const next = new Set(prev)
      sources.forEach(s => next.add(s.id))
      return next
    })
  }, [])

  const removeCustomSource = useCallback((id) => {
    setCustomSources(prev => prev.filter(s => s.id !== id))
    setEnabledSources(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const toggleSource = useCallback((id) => {
    setEnabledSources(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const setAllSources = useCallback((on) => {
    setEnabledSources(on ? new Set(allSources.map(s => s.id)) : new Set())
  }, [allSources])

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    setError(null)
    setLoadingStatus('Fetching RSS feeds...')
    try {
      const ids = [...enabledRef.current]
      const all = [...NEWS_SOURCES, ...customSourcesRef.current]
      const enabledCount = ids.length === all.length ? all.length : ids.length
      setLoadingStatus(`Fetching ${enabledCount} sources...`)
      let data = await fetchAllFeeds(ids.length === all.length ? null : ids, all)
      setLoadingStatus(`Fetched ${data.length} articles. Categorizing...`)
      if (isAIEnabled()) {
        const batches = Math.ceil(data.length / 10)
        setLoadingStatus(`AI processing: 0/${batches} batches (${data.length} articles)...`)
        try {
          data = await processArticlesWithAI(data, null, (done, total) => {
            setLoadingStatus(`AI processing: ${done}/${total} batches...`)
          })
          setLoadingStatus('AI processing complete.')
        } catch (aiErr) {
          setLoadingStatus('AI failed, using fallback.')
          console.warn('[AI] Processing failed, using fallback data:', aiErr.message)
        }
      }
      setLoadingStatus('Saving cache...')
      saveCache(data)
      setArticles(data)
      setLastUpdated(new Date())
      setLoadingStatus('')
    } catch (err) {
      setError(err.message)
      setLoadingStatus('')
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [])

  const resetCache = useCallback(() => {
    clearCache()
    localStorage.removeItem('osmap-custom-sources')
    setArticles([])
    setCustomSources([])
    setLastUpdated(null)
    setError(null)
  }, [])

  // Fetch on mount — skip if cache is fresh
  useEffect(() => {
    const cached = loadCache()
    if (!cached || cached.length === 0) refresh()
  }, [refresh])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [refresh])

  const activeArticles = articles.filter(a => enabledSources.has(a.sourceId))

  // Apply active flows — article must match at least one active flow's rules
  const activeFlows = flows.filter(f => f.active && f.rules?.length > 0)
  const flowFilteredArticles = activeFlows.length === 0 ? activeArticles : activeArticles.filter(a => {
    return activeFlows.some(flow => {
      return flow.rules.some(rule => {
        // Check location match
        const locMatch = !rule.locations?.length || rule.locations.some(loc => {
          const ll = loc.toLowerCase()
          return a.location?.name?.toLowerCase().includes(ll)
            || a.location?.country?.toLowerCase().includes(ll)
            || a.location?.region?.toLowerCase().includes(ll)
            || a.countries?.some(c => c.toLowerCase().includes(ll))
        })
        if (!locMatch) return false
        // Check category match
        const catMatch = !rule.categories?.length || rule.categories.some(cat => {
          if (a.category?.id === cat) return true
          const allCats = a.category?.allCategories || a.allCategories
          return allCats?.includes(cat)
        })
        return catMatch
      })
    })
  })

  const geoArticles = flowFilteredArticles.filter(a => a.location !== null)

  const stats = {
    total: flowFilteredArticles.length,
    geolocated: geoArticles.length,
    bySource: {},
    byCategory: {},
    byRegion: {},
  }
  for (const a of flowFilteredArticles) {
    stats.bySource[a.sourceName] = (stats.bySource[a.sourceName] || 0) + 1
    stats.byCategory[a.category.label] = (stats.byCategory[a.category.label] || 0) + 1
    if (a.location) {
      stats.byRegion[a.location.region] = (stats.byRegion[a.location.region] || 0) + 1
    }
  }

  return (
    <IntelContext.Provider value={{
      articles,
      geoArticles,
      loading,
      loadingStatus,
      error,
      lastUpdated,
      stats,
      refresh,
      enabledSources,
      toggleSource,
      setAllSources,
      customSources,
      allSources,
      addCustomSources,
      removeCustomSource,
      resetCache,
      flows,
      saveFlow,
      deleteFlow,
      toggleFlow,
    }}>
      {children}
    </IntelContext.Provider>
  )
}

export function useIntel() {
  const ctx = useContext(IntelContext)
  if (!ctx) throw new Error('useIntel must be used within IntelProvider')
  return ctx
}
