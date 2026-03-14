import { useTheme } from '../contexts/ThemeContext'
import { useIntel } from '../contexts/IntelContext'

const BORDER_PRESETS = [
  { color: '#cc7000', label: 'Amber' },
  { color: '#00bb30', label: 'Green' },
  { color: '#0088cc', label: 'Cyan' },
  { color: '#cc2200', label: 'Red' },
  { color: '#8844cc', label: 'Violet' },
  { color: '#888888', label: 'Grey' },
]

const RESOLUTION_OPTIONS = [
  { value: '110m', label: '110m', desc: 'Standard' },
]

export default function SettingsModal({ open, onClose }) {
  const { theme, setTheme, borderColor, setBorderColor, borderResolution, setBorderResolution, clusterRadius, setClusterRadius } = useTheme()
  const { enabledSources, toggleSource, setAllSources, allSources, refresh, resetCache } = useIntel()

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '340px' }}>
        <div className="modal-header">
          <span className="modal-title">// SETTINGS</span>
          <button className="btn-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Theme */}
          <div>
            <span className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>Theme</span>
            <div className="toggle-group">
              <button className={`toggle-btn ${theme === 'orange' ? 'active' : ''}`}
                onClick={() => setTheme('orange')}>Amber</button>
              <button className={`toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}>Dark</button>
            </div>
          </div>

          {/* Globe Border Color */}
          <div>
            <span className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>
              Globe Border Color
            </span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {BORDER_PRESETS.map(p => (
                <button key={p.color}
                  style={{
                    width: '32px', height: '22px', border: borderColor === p.color ? '2px solid #fff' : '1px solid #333',
                    borderRadius: '2px', background: p.color, cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                  title={p.label}
                  onClick={() => setBorderColor(p.color)}
                />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Custom:</span>
              <input type="color" className="color-picker" value={borderColor}
                onChange={e => setBorderColor(e.target.value)} />
              <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                {borderColor}
              </span>
            </div>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.5 }}>
              Affects globe polygon borders and atmosphere glow.
            </p>
          </div>

          {/* Border Resolution */}
          <div>
            <span className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>
              Border Resolution
            </span>
            <div className="toggle-group">
              {RESOLUTION_OPTIONS.map(r => (
                <button key={r.value} className={`toggle-btn ${borderResolution === r.value ? 'active' : ''}`}
                  onClick={() => setBorderResolution(r.value)}
                  title={r.desc}>
                  {r.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.5 }}>
              Higher resolution = more detailed borders, slower to load.
            </p>
          </div>

          {/* Clustering */}
          <div>
            <span className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>
              Cluster Radius — {clusterRadius.toFixed(2)}x
            </span>
            <input type="range" className="slider" min="0" max="200" step="5"
              value={clusterRadius * 100}
              onChange={e => setClusterRadius(Number(e.target.value) / 100)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>TIGHT (0)</span>
              <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>WIDE (2.0)</span>
            </div>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.5 }}>
              Controls how close points must be to merge into a square cluster. Lower = only same-location clusters. Higher = wider grouping.
            </p>
          </div>

          {/* Sources */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span className="form-label">Sources ({enabledSources.size}/{allSources.length})</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn-small" onClick={() => setAllSources(true)}>ALL</button>
                <button className="btn-small" onClick={() => setAllSources(false)}>NONE</button>
                <button className="btn-small" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                  onClick={refresh}>REFETCH</button>
              </div>
            </div>
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '2px' }}>
              {allSources.map(s => (
                <div key={s.id}
                  className="source-toggle-item"
                  onClick={() => toggleSource(s.id)}>
                  <span className="source-toggle-dot" style={{ backgroundColor: s.color }} />
                  <span className="source-toggle-name">{s.name}</span>
                  <span className={`switch-track ${enabledSources.has(s.id) ? 'switch-on' : ''}`} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <span className="switch-thumb" />
                  </span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.5 }}>
              Disabled sources are hidden instantly. Click REFETCH to fetch only enabled sources.
            </p>
          </div>

          {/* Cache */}
          <div>
            <span className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>Cache</span>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
              Articles are cached for 30 minutes to avoid re-fetching and wasting API tokens. Reset to clear all cached data, custom sources, and re-fetch fresh.
            </p>
            <button className="btn-danger" onClick={() => { resetCache(); refresh(); onClose() }}>RESET CACHE &amp; REFETCH</button>
          </div>

        </div>
      </div>
    </div>
  )
}
