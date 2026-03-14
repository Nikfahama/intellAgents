import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useIntel } from '../contexts/IntelContext'
import { isAIEnabled } from '../utils/ai'
import SettingsModal from './SettingsModal'

export default function Sidebar() {
  const { stats, loading, loadingStatus, refresh, lastUpdated } = useIntel()
  const aiOn = isAIEnabled()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <div>
          <h1 className="sidebar-title">intellAgents</h1>
          <span className="sidebar-subtitle">open source intelligence</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <span className="nav-section-label">// intel</span>
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
            <span className="nav-prefix">&gt;</span> dashboard
          </NavLink>
          <NavLink to="/feed" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-prefix">&gt;</span> feed
          </NavLink>
          <NavLink to="/flow" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-prefix">&gt;</span> flow
          </NavLink>
        </div>
        <div className="nav-section">
          <span className="nav-section-label">// geo</span>
          <NavLink to="/map" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-prefix">&gt;</span> map view
          </NavLink>
          <NavLink to="/globe" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-prefix">&gt;</span> globe view
          </NavLink>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div style={{
          padding: '0.4rem 0.6rem',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          marginBottom: '0.35rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>ARTICLES</span>
            <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontWeight: 700 }}>
              {loading ? '...' : stats.total}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>MAPPED</span>
            <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontWeight: 700 }}>
              {loading ? '...' : stats.geolocated}
            </span>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.3rem 0.6rem',
          background: aiOn ? 'rgba(0, 187, 48, 0.06)' : 'var(--bg-tertiary)',
          border: `1px solid ${aiOn ? 'rgba(0, 187, 48, 0.2)' : 'var(--border)'}`,
          borderRadius: '4px', marginBottom: '0.35rem',
        }}>
          <span className={`status-dot ${aiOn ? 'success' : 'dim'}`}
            style={aiOn && loading ? { animation: 'pulse-dot 1.5s ease infinite' } : {}} />
          <span style={{ fontSize: '0.55rem', color: aiOn ? '#00bb30' : 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
            {aiOn ? (loading ? 'AI PROCESSING...' : 'AI AGENT ACTIVE') : 'AI AGENT OFF'}
          </span>
        </div>
        <button className="sidebar-settings-btn" onClick={() => { refresh() }}
          disabled={loading}
          style={loading ? { opacity: 0.5, cursor: 'wait' } : {}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={loading ? { animation: 'spin 1s linear infinite' } : {}}>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {loading ? 'refreshing...' : 'refresh articles'}
        </button>
        {loading && loadingStatus && (
          <span className="version-tag" style={{ fontSize: '0.5rem', color: 'var(--accent)', lineHeight: 1.4 }}>
            {loadingStatus}
          </span>
        )}
        {lastUpdated && (
          <span className="version-tag" style={{ fontSize: '0.5rem' }}>
            last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        <button className="sidebar-settings-btn" onClick={() => setSettingsOpen(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
          settings
        </button>
        <span className="version-tag">v0.1.0 // intellAgents</span>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  )
}
