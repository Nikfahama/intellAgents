import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTheme } from '../contexts/ThemeContext'
import { useIntel } from '../contexts/IntelContext'
import { CATEGORIES } from '../utils/sources'
import 'leaflet/dist/leaflet.css'

const TILE_LAYERS = [
  { id: 'dark', label: 'Dark', group: 'dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO' },
  { id: 'dark-nolabel', label: 'Dark Clean', group: 'dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO' },
  { id: 'esri-dark', label: 'ESRI Dark', group: 'dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attr: '&copy; Esri' },
  { id: 'satellite', label: 'Satellite', group: 'satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '&copy; Esri' },
  { id: 'topo', label: 'Topo', group: 'terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; OpenTopoMap' },
  { id: 'esri-topo', label: 'ESRI Topo', group: 'terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attr: '&copy; Esri' },
  { id: 'positron', label: 'Positron', group: 'light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO' },
  { id: 'voyager', label: 'Voyager', group: 'light',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO' },
  { id: 'osm', label: 'OSM', group: 'light',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OSM' },
  { id: 'amber', label: 'Amber', group: 'themed',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO',
    filter: 'brightness(0.85) sepia(1) hue-rotate(-10deg) saturate(2)' },
  { id: 'midnight', label: 'Midnight', group: 'themed',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO',
    filter: 'brightness(0.8) sepia(0.3) hue-rotate(200deg) saturate(2)' },
  { id: 'infrared', label: 'Infrared', group: 'themed',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO',
    filter: 'brightness(0.8) sepia(0.6) hue-rotate(-40deg) saturate(3) contrast(1.2)' },
  { id: 'ice', label: 'Ice', group: 'themed',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO',
    filter: 'brightness(1.1) sepia(0.2) hue-rotate(160deg) saturate(1.8)' },
]

const GROUPS = [
  { id: 'dark', label: 'DARK' }, { id: 'satellite', label: 'SAT' },
  { id: 'terrain', label: 'TERRAIN' }, { id: 'light', label: 'LIGHT' },
  { id: 'themed', label: 'THEMED' },
]

const THEME_AUTO_MAP = { dark: 'dark', orange: 'amber' }

const CATEGORY_COLORS = {
  conflict: '#ff3333', security: '#ff6644', politics: '#00ff41',
  economy: '#ccff00', disaster: '#ff8800', humanitarian: '#8888ff', general: '#666666',
  stocks: '#00cc88', terrorism: '#ff1111', defense: '#6688cc',
  antisemitism: '#cc44cc', maritime: '#2299dd', trade: '#ddaa22',
}

function TileFilter({ filter }) {
  const map = useMap()
  useEffect(() => {
    const pane = map.getPane('tilePane')
    if (pane) pane.style.filter = filter || 'none'
  }, [filter, map])
  return null
}

function MapController({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, zoom || 4, { duration: 1.5 })
  }, [center, zoom, map])
  return null
}

export default function MapView({ popout = false }) {
  const { theme } = useTheme()
  const { geoArticles, loading } = useIntel()
  const [tileId, setTileId] = useState('dark')
  const [activeGroup, setActiveGroup] = useState('dark')
  const [autoTheme, setAutoTheme] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [flyTarget, setFlyTarget] = useState(null)
  const [flyZoom, setFlyZoom] = useState(null)
  const [poppedOut, setPoppedOut] = useState(false)
  const popoutWindowRef = useRef(null)

  const handlePopout = useCallback(() => {
    const win = window.open('/map-popout', 'map-popout',
      'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no')
    if (!win) return
    popoutWindowRef.current = win
    setPoppedOut(true)
  }, [])

  const handleMerge = useCallback(() => {
    if (popoutWindowRef.current && !popoutWindowRef.current.closed) popoutWindowRef.current.close()
    popoutWindowRef.current = null
    setPoppedOut(false)
  }, [])

  useEffect(() => {
    if (!poppedOut || popout) return
    const check = setInterval(() => {
      if (popoutWindowRef.current?.closed) { popoutWindowRef.current = null; setPoppedOut(false) }
    }, 500)
    return () => clearInterval(check)
  }, [poppedOut, popout])

  // Broadcast state to popout
  useEffect(() => {
    if (popout || !poppedOut) return
    const ch = new BroadcastChannel('osmap-map')
    ch.postMessage({ tileId, activeGroup, autoTheme, categoryFilter })
    return () => ch.close()
  }, [popout, poppedOut, tileId, activeGroup, autoTheme, categoryFilter])

  // Receive state in popout
  useEffect(() => {
    if (!popout) return
    const ch = new BroadcastChannel('osmap-map')
    ch.onmessage = (e) => {
      const s = e.data
      if (s.tileId !== undefined) setTileId(s.tileId)
      if (s.activeGroup !== undefined) setActiveGroup(s.activeGroup)
      if (s.autoTheme !== undefined) setAutoTheme(s.autoTheme)
      if (s.categoryFilter !== undefined) setCategoryFilter(s.categoryFilter)
    }
    return () => ch.close()
  }, [popout])

  useEffect(() => {
    if (autoTheme) {
      const mapped = THEME_AUTO_MAP[theme]
      if (mapped) { setTileId(mapped); setActiveGroup('themed') }
    }
  }, [theme, autoTheme])

  const currentTile = useMemo(() => TILE_LAYERS.find(l => l.id === tileId) || TILE_LAYERS[0], [tileId])
  const groupTiles = useMemo(() => TILE_LAYERS.filter(l => l.group === activeGroup), [activeGroup])

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return geoArticles
    return geoArticles.filter(a => a.category.id === categoryFilter)
  }, [geoArticles, categoryFilter])

  return (
    <div className={popout ? 'popout-view' : ''}>
      {!popout && (
        <div className="page-header">
          <h1>// Map Intel</h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {loading && <span className="badge badge-warning">LOADING</span>}
            <span className="toolbar-count">{filtered.length} mapped articles</span>
          </div>
        </div>
      )}

      <div className={popout ? '' : 'page-layout'}>
        <div className={popout ? '' : 'page-main'}>
          {!popout && <>
          {/* Tile group bar */}
          <div className="toolbar">
            <div className="toolbar-group">
              {GROUPS.map(g => (
                <button key={g.id} className={`btn-toolbar ${activeGroup === g.id ? 'active' : ''}`}
                  onClick={() => { setActiveGroup(g.id); setAutoTheme(false) }}>{g.label}</button>
              ))}
              <span className="toolbar-sep">|</span>
              <button className={`btn-toolbar ${autoTheme ? 'active' : ''}`}
                onClick={() => setAutoTheme(!autoTheme)}>AUTO</button>
              <span className="toolbar-sep">|</span>
              <button className="btn-toolbar" onClick={() => { setFlyTarget([20, 0]); setFlyZoom(2) }}>RESET</button>
              <span className="toolbar-sep">|</span>
              {!poppedOut ? (
                <button className="btn-toolbar popout-btn" title="Pop out to dedicated window" onClick={handlePopout}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                  POP OUT
                </button>
              ) : (
                <button className="btn-toolbar" style={{ color: '#00ff88', borderColor: '#00ff8844' }} onClick={handleMerge}>MERGE</button>
              )}
            </div>
          </div>

          {/* Tile variant selector */}
          <div className="toggle-group">
            {groupTiles.map(t => (
              <button key={t.id} className={`toggle-btn ${tileId === t.id ? 'active' : ''}`}
                onClick={() => { setTileId(t.id); setAutoTheme(false) }}>{t.label}</button>
            ))}
          </div>

          {/* Category filter */}
          <div className="toolbar">
            <div className="toolbar-group">
              <button className={`btn-toolbar ${categoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('all')}>ALL</button>
              {Object.entries(CATEGORIES).map(([id, cat]) => (
                <button key={id} className={`btn-toolbar ${categoryFilter === id ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(id)}>{cat.label}</button>
              ))}
            </div>
          </div>
          </>}

          {/* Map */}
          {poppedOut && !popout && (
            <div className="popout-placeholder">
              <div className="popout-placeholder-inner">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent)', opacity: 0.5 }}>
                  <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
                <span className="popout-placeholder-text">Map displayed in external window</span>
                <button className="btn-toolbar" style={{ color: '#00ff88', borderColor: '#00ff8844', padding: '0.4rem 1rem' }} onClick={handleMerge}>MERGE BACK</button>
              </div>
            </div>
          )}
          <div className="panel" style={{ overflow: 'hidden', ...(poppedOut && !popout ? { display: 'none' } : {}) }}>
            <div style={{ height: popout ? 'calc(100vh - 10px)' : 'calc(100vh - 330px)', minHeight: '400px' }}>
              <MapContainer center={[20, 0]} zoom={2}
                style={{ height: '100%', width: '100%', background: '#000' }} zoomControl={false}>
                <TileFilter filter={currentTile.filter || null} />
                <TileLayer key={currentTile.url} url={currentTile.url} attribution={currentTile.attr} />
                <MapController center={flyTarget} zoom={flyZoom} />
                {filtered.map((a, i) => (
                  <CircleMarker
                    key={a.id}
                    center={[a.location.lat, a.location.lng]}
                    radius={6}
                    pathOptions={{
                      color: CATEGORY_COLORS[a.category.id] || '#666',
                      fillColor: CATEGORY_COLORS[a.category.id] || '#666',
                      fillOpacity: 0.7,
                      weight: 1,
                    }}
                    eventHandlers={{ click: () => setSelectedArticle(a) }}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', maxWidth: '250px' }}>
                        <strong style={{ fontSize: '0.75rem' }}>{a.title}</strong><br />
                        <span style={{ color: '#888' }}>{a.sourceName} &middot; {a.timeAgo}</span><br />
                        <span style={{ color: a.sourceColor }}>{a.location.name}</span>
                        {a.link && <><br /><a href={a.link} target="_blank" rel="noopener noreferrer">Open source</a></>}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        {!popout && <div className="page-sidebar-right">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// MAP INTEL</span>
            </div>
            <div className="panel-body">
              <div className="info-row">
                <span className="info-label">Plotted</span>
                <span className="info-value">{filtered.length}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Layer</span>
                <span className="info-value">{currentTile.label}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Filter</span>
                <span className="info-value">{categoryFilter === 'all' ? 'ALL' : categoryFilter.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// ARTICLES</span>
              <span className="toolbar-count">{filtered.length}</span>
            </div>
            <div style={{ maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
              {filtered.slice(0, 50).map(a => (
                <div key={a.id} className="list-item">
                  <div
                    className={`list-item-header ${selectedArticle?.id === a.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedArticle(a)
                      setFlyTarget([a.location.lat, a.location.lng])
                      setFlyZoom(5)
                    }}
                  >
                    <div className="list-item-left" style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: CATEGORY_COLORS[a.category.id] || '#666',
                        boxShadow: `0 0 4px ${CATEGORY_COLORS[a.category.id] || '#666'}44`,
                      }}></span>
                      <span style={{
                        fontSize: '0.65rem', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{a.title}</span>
                    </div>
                    <div className="list-item-right" style={{ flexShrink: 0 }}>
                      <span style={{ fontSize: '0.5rem', color: 'var(--accent)' }}>{a.location.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedArticle && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">// DETAILS</span>
                <button className="btn-close" onClick={() => setSelectedArticle(null)}>x</button>
              </div>
              <div className="panel-body">
                <p style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', lineHeight: 1.5 }}>
                  {selectedArticle.title}
                </p>
                <div className="info-row">
                  <span className="info-label">Source</span>
                  <span className="info-value">{selectedArticle.sourceName}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Category</span>
                  <span className={`badge ${selectedArticle.category.badge}`} style={{ fontSize: '0.5rem', padding: '0.1rem 0.3rem' }}>
                    {selectedArticle.category.label}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Location</span>
                  <span className="info-value">{selectedArticle.location.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Region</span>
                  <span className="info-value">{selectedArticle.location.region}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Time</span>
                  <span className="info-value">{selectedArticle.timeAgo}</span>
                </div>
                {selectedArticle.link && (
                  <a href={selectedArticle.link} target="_blank" rel="noopener noreferrer"
                    className="btn-accent" style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem' }}>
                    Open Source Article
                  </a>
                )}
              </div>
            </div>
          )}
        </div>}
      </div>
    </div>
  )
}
