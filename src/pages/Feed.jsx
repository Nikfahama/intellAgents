import { useState, useMemo } from 'react'
import { useIntel } from '../contexts/IntelContext'
import { NEWS_SOURCES, CATEGORIES } from '../utils/sources'

export default function Feed() {
  const { articles, loading, refresh } = useIntel()
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  const filtered = useMemo(() => {
    return articles.filter(a => {
      if (sourceFilter !== 'all' && a.sourceId !== sourceFilter) return false
      if (categoryFilter !== 'all' && a.category.id !== categoryFilter) return false
      if (regionFilter !== 'all') {
        if (!a.location || a.location.region !== regionFilter) return false
      }
      if (search) {
        const q = search.toLowerCase()
        return a.title.toLowerCase().includes(q) ||
               a.description.toLowerCase().includes(q) ||
               (a.location?.name || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [articles, search, sourceFilter, categoryFilter, regionFilter])

  const regions = useMemo(() => {
    const set = new Set()
    for (const a of articles) {
      if (a.location) set.add(a.location.region)
    }
    return [...set].sort()
  }, [articles])

  return (
    <div>
      <div className="page-header">
        <h1>// Intel Feed</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="toolbar-count">{filtered.length} / {articles.length}</span>
          <button className="btn-primary" onClick={refresh} disabled={loading}>
            {loading ? 'Fetching...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        className="input-text"
        placeholder="Search articles, locations, keywords..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: '0.75rem' }}
      />

      {/* Filters */}
      <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
        <div className="toolbar-group" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <select className="select" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            <option value="all">All Sources</option>
            {NEWS_SOURCES.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {Object.entries(CATEGORIES).map(([id, cat]) => (
              <option key={id} value={id}>{cat.label}</option>
            ))}
            <option value="general">GENERAL</option>
          </select>
          <select className="select" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
            <option value="all">All Regions</option>
            {regions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {(sourceFilter !== 'all' || categoryFilter !== 'all' || regionFilter !== 'all' || search) && (
            <button className="btn-small" onClick={() => {
              setSourceFilter('all')
              setCategoryFilter('all')
              setRegionFilter('all')
              setSearch('')
            }}>
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Articles */}
      <div className="panel">
        {loading && articles.length === 0 && (
          <div className="panel-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Fetching intelligence feeds...
            </span>
          </div>
        )}
        {filtered.length === 0 && !loading && (
          <div className="panel-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No articles match current filters.
            </span>
          </div>
        )}
        {filtered.map(a => (
          <div key={a.id} className="list-item">
            <div
              className={`list-item-header ${expandedId === a.id ? 'selected' : ''}`}
              onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
            >
              <div className="list-item-left" style={{ flex: 1, minWidth: 0, gap: '0.4rem' }}>
                <span className={`status-dot ${
                  a.category.id === 'conflict' || a.category.id === 'security' ? 'danger' :
                  a.category.id === 'disaster' || a.category.id === 'economy' ? 'muted' :
                  a.category.id === 'general' ? 'dim' : 'success'
                }`}></span>
                <span style={{
                  fontSize: '0.55rem',
                  color: a.sourceColor,
                  fontWeight: 700,
                  flexShrink: 0,
                  minWidth: '55px',
                }}>
                  {a.sourceName}
                </span>
                <span style={{
                  fontSize: '0.73rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {a.title}
                </span>
              </div>
              <div className="list-item-right" style={{ flexShrink: 0, gap: '0.3rem' }}>
                <span className={`badge ${a.category.badge}`} style={{ fontSize: '0.5rem', padding: '0.1rem 0.3rem' }}>
                  {a.category.label}
                </span>
                {a.location && (
                  <span style={{ fontSize: '0.5rem', color: 'var(--accent)', fontWeight: 600 }}>
                    {a.location.name}
                  </span>
                )}
                <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', minWidth: '35px', textAlign: 'right' }}>
                  {a.timeAgo}
                </span>
              </div>
            </div>
            {expandedId === a.id && (
              <div className="list-item-body">
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.7 }}>
                  {a.description || 'No description available.'}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${a.category.badge}`}>{a.category.label}</span>
                  {a.location && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      Location: <span style={{ color: 'var(--accent)' }}>{a.location.name}</span>
                      {' '}({a.location.region})
                    </span>
                  )}
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{a.sourceName}</span>
                  {a.link && (
                    <a href={a.link} target="_blank" rel="noopener noreferrer" className="btn-small">
                      SOURCE
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
