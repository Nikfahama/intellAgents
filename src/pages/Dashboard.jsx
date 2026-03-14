import { useState, useRef } from 'react'
import { useIntel } from '../contexts/IntelContext'
import { Link } from 'react-router-dom'

const RANDOM_COLORS = ['#cc7000','#1a56db','#bb1100','#0077bb','#228833','#cc2200','#8844cc','#ff6633','#0055aa','#cc9900']

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length === 0) return []
  // Detect header
  const first = lines[0].toLowerCase()
  const hasHeader = first.includes('name') || first.includes('url') || first.includes('id')
  const dataLines = hasHeader ? lines.slice(1) : lines
  const sources = []
  for (const line of dataLines) {
    // Support: name,url  OR  id,name,color,url  OR  just url
    const parts = line.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
    if (parts.length === 1 && parts[0].startsWith('http')) {
      // Just a URL
      const url = parts[0]
      const name = new URL(url).hostname.replace('www.', '').split('.')[0]
      sources.push({ id: `custom-${name}-${Date.now()}`, name, color: RANDOM_COLORS[sources.length % RANDOM_COLORS.length], url })
    } else if (parts.length === 2) {
      // name, url
      sources.push({ id: `custom-${parts[0].toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`, name: parts[0], color: RANDOM_COLORS[sources.length % RANDOM_COLORS.length], url: parts[1] })
    } else if (parts.length >= 4) {
      // id, name, color, url
      sources.push({ id: parts[0] || `custom-${Date.now()}`, name: parts[1], color: parts[2] || RANDOM_COLORS[sources.length % RANDOM_COLORS.length], url: parts[3] })
    } else if (parts.length === 3) {
      // name, color, url
      sources.push({ id: `custom-${parts[0].toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`, name: parts[0], color: parts[1].startsWith('#') ? parts[1] : RANDOM_COLORS[sources.length % RANDOM_COLORS.length], url: parts[2] || parts[1] })
    }
  }
  return sources
}

export default function Dashboard() {
  const { articles, geoArticles, loading, error, lastUpdated, stats, refresh, customSources, addCustomSources, removeCustomSource, resetCache } = useIntel()
  const [csvText, setCsvText] = useState('')
  const [csvResult, setCsvResult] = useState(null)
  const fileInputRef = useRef(null)

  const topRegions = Object.entries(stats.byRegion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const topCategories = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])

  const recentArticles = articles.slice(0, 8)

  return (
    <div>
      <div className="page-header">
        <h1>// Dashboard</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {loading && <span className="badge badge-warning">FETCHING...</span>}
          {error && <span className="badge badge-danger">FEED ERROR</span>}
          {!loading && !error && <span className="badge badge-success">LIVE</span>}
          <button className="btn-primary" onClick={refresh} disabled={loading}>
            Refresh
          </button>
          <button className="btn-danger" style={{ fontSize: '0.6rem', padding: '0.3rem 0.5rem' }}
            onClick={() => { resetCache(); refresh() }}>
            Reset Cache
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="info-bar" style={{ marginBottom: '1.5rem' }}>
        <span className="info-item">Articles: <strong>{stats.total}</strong></span>
        <span className="info-item">Geolocated: <strong>{stats.geolocated}</strong></span>
        <span className="info-item">Sources: <strong>{Object.keys(stats.bySource).length}</strong></span>
        <span className="info-item">Regions: <strong>{Object.keys(stats.byRegion).length}</strong></span>
        {lastUpdated && (
          <span className="info-item">Updated: <strong>{lastUpdated.toLocaleTimeString()}</strong></span>
        )}
      </div>

      {/* Metric cards */}
      <div className="result-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="result-card active">
          <span className="result-label">Total Intel</span>
          <span className="result-value">{stats.total}</span>
          <span className="result-unit">articles collected</span>
        </div>
        <div className="result-card">
          <span className="result-label">Mapped</span>
          <span className="result-value">{stats.geolocated}</span>
          <span className="result-unit">geo-located</span>
        </div>
        <div className="result-card">
          <span className="result-label">Coverage</span>
          <span className="result-value">{stats.total > 0 ? Math.round((stats.geolocated / stats.total) * 100) : 0}%</span>
          <span className="result-unit">geo hit rate</span>
        </div>
      </div>

      <div className="page-layout">
        <div className="page-main">
          {/* Sources */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// SOURCES</span>
              <span className="toolbar-count">{Object.keys(stats.bySource).length} active</span>
            </div>
            <div>
              {Object.entries(stats.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <div key={name} className="list-item">
                    <div className="list-item-header">
                      <div className="list-item-left">
                        <span className="status-dot success"></span>
                        <span style={{ fontSize: '0.75rem' }}>{name}</span>
                      </div>
                      <div className="list-item-right">
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>{count}</span>
                        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>articles</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Add Sources via CSV */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// ADD SOURCES</span>
              <span className="toolbar-count">CSV / URL</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Paste CSV or RSS URLs below. Formats: <code style={{ color: 'var(--accent)' }}>name, url</code> or just one URL per line.
              </p>
              <textarea className="input-text" rows={3} placeholder={'BBC World, https://feeds.bbci.co.uk/news/rss.xml\nhttps://example.com/feed.xml'}
                value={csvText} onChange={e => setCsvText(e.target.value)}
                style={{ resize: 'vertical', fontSize: '0.65rem', lineHeight: 1.5 }} />
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button className="btn-accent" onClick={() => {
                  const sources = parseCSV(csvText)
                  if (sources.length > 0) {
                    addCustomSources(sources)
                    setCsvText('')
                    setCsvResult(`Added ${sources.length} source${sources.length > 1 ? 's' : ''}`)
                    setTimeout(() => setCsvResult(null), 3000)
                  } else {
                    setCsvResult('No valid sources found')
                    setTimeout(() => setCsvResult(null), 3000)
                  }
                }}>ADD</button>
                <span className="toolbar-sep">|</span>
                <button className="btn-small" onClick={() => fileInputRef.current?.click()}>UPLOAD CSV FILE</button>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      const sources = parseCSV(reader.result)
                      if (sources.length > 0) {
                        addCustomSources(sources)
                        setCsvResult(`Imported ${sources.length} source${sources.length > 1 ? 's' : ''} from ${file.name}`)
                      } else {
                        setCsvResult('No valid sources in file')
                      }
                      setTimeout(() => setCsvResult(null), 3000)
                    }
                    reader.readAsText(file)
                    e.target.value = ''
                  }} />
                <button className="btn-small" onClick={() => { refresh() }} disabled={loading}>REFETCH</button>
                {csvResult && <span style={{ fontSize: '0.6rem', color: 'var(--accent)' }}>{csvResult}</span>}
              </div>
            </div>
          </div>

          {/* Custom sources list */}
          {customSources.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">// CUSTOM SOURCES</span>
                <span className="toolbar-count">{customSources.length}</span>
              </div>
              <div>
                {customSources.map(s => (
                  <div key={s.id} className="list-item">
                    <div className="list-item-header">
                      <div className="list-item-left" style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, backgroundColor: s.color }} />
                        <span style={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      </div>
                      <div className="list-item-right" style={{ gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</span>
                        <button className="btn-small" style={{ color: 'var(--danger)' }} onClick={() => removeCustomSource(s.id)}>x</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Intel */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// LATEST INTEL</span>
              <Link to="/feed" className="btn-small">VIEW ALL</Link>
            </div>
            <div>
              {recentArticles.map(a => (
                <div key={a.id} className="list-item">
                  <div className="list-item-header">
                    <div className="list-item-left" style={{ flex: 1, minWidth: 0 }}>
                      <span className={`status-dot ${a.category.id === 'conflict' ? 'danger' : a.category.id === 'general' ? 'dim' : 'success'}`}></span>
                      <span style={{
                        fontSize: '0.7rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {a.title}
                      </span>
                    </div>
                    <div className="list-item-right" style={{ flexShrink: 0 }}>
                      {a.location && (
                        <span style={{ fontSize: '0.55rem', color: 'var(--accent)' }}>{a.location.name}</span>
                      )}
                      <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{a.timeAgo}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="page-sidebar-right">
          {/* Categories */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// CATEGORIES</span>
            </div>
            <div className="panel-body">
              {topCategories.map(([label, count]) => (
                <div key={label} className="info-row">
                  <span className="info-label">{label}</span>
                  <span className="info-value">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Regions */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// REGIONS</span>
            </div>
            <div className="panel-body">
              {topRegions.map(([region, count]) => (
                <div key={region} className="info-row">
                  <span className="info-label">{region}</span>
                  <span className="info-value">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick nav */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// QUICK ACCESS</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Link to="/map" className="btn-accent" style={{ textAlign: 'center', display: 'block' }}>
                Open Map View
              </Link>
              <Link to="/globe" className="btn-accent" style={{ textAlign: 'center', display: 'block' }}>
                Open Globe View
              </Link>
              <Link to="/feed" className="btn-primary" style={{ textAlign: 'center', display: 'block' }}>
                View Intel Feed
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
