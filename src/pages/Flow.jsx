import { useState } from 'react'
import { useIntel } from '../contexts/IntelContext'
import { CATEGORIES } from '../utils/sources'

const CATEGORY_ENTRIES = Object.entries(CATEGORIES)
const CATEGORY_COLORS = {
  conflict: '#ff3333', security: '#ff6644', politics: '#cc7000',
  economy: '#ccff00', disaster: '#ff8800', humanitarian: '#8888ff', general: '#666666',
  stocks: '#00cc88', terrorism: '#ff1111', defense: '#6688cc',
  antisemitism: '#cc44cc', maritime: '#2299dd', trade: '#ddaa22',
}

function FlowEditor({ flow, onSave, onCancel, geoArticles }) {
  const [name, setName] = useState(flow?.name || '')
  const [rules, setRules] = useState(flow?.rules || [])
  const [ruleLocInput, setRuleLocInput] = useState('')

  // Available locations from articles
  const locations = [...new Set(geoArticles.map(a => a.location?.name).filter(Boolean))].sort()

  const addRule = () => {
    setRules(prev => [...prev, { locations: [], categories: [] }])
  }

  const updateRule = (idx, field, value) => {
    setRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const removeRule = (idx) => {
    setRules(prev => prev.filter((_, i) => i !== idx))
  }

  const addLocationToRule = (idx, loc) => {
    if (!loc) return
    setRules(prev => prev.map((r, i) => {
      if (i !== idx || r.locations.includes(loc)) return r
      return { ...r, locations: [...r.locations, loc] }
    }))
  }

  const removeLocationFromRule = (idx, loc) => {
    setRules(prev => prev.map((r, i) => {
      if (i !== idx) return r
      return { ...r, locations: r.locations.filter(l => l !== loc) }
    }))
  }

  const toggleCategoryInRule = (idx, catId) => {
    setRules(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const cats = r.categories.includes(catId)
        ? r.categories.filter(c => c !== catId)
        : [...r.categories, catId]
      return { ...r, categories: cats }
    }))
  }

  const handleSave = () => {
    if (!name.trim() || rules.length === 0) return
    onSave({
      id: flow?.id || `flow-${Date.now()}`,
      name: name.trim(),
      active: flow?.active ?? true,
      rules: rules.filter(r => r.locations.length > 0 || r.categories.length > 0),
    })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">// {flow ? 'EDIT FLOW' : 'NEW FLOW'}</span>
        <button className="btn-close" onClick={onCancel}>x</button>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="form-group">
          <span className="form-label">Flow Name</span>
          <input type="text" className="input-text" placeholder="e.g. Middle East Watch"
            value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="form-label" style={{ margin: 0 }}>Rules ({rules.length})</span>
          <button className="btn-accent" onClick={addRule} style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem' }}>+ ADD RULE</button>
        </div>

        {rules.length === 0 && (
          <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No rules yet. Add a rule to define location + category filters.
          </p>
        )}

        {rules.map((rule, idx) => (
          <div key={idx} className="flow-rule">
            <div className="flow-rule-header">
              <span className="flow-rule-label">RULE {idx + 1}</span>
              <button className="btn-close" style={{ width: 16, height: 16, fontSize: '0.5rem' }} onClick={() => removeRule(idx)}>x</button>
            </div>

            <div className="flow-rule-section">
              <span className="flow-rule-sublabel">LOCATIONS</span>
              <div className="flow-rule-tags">
                {rule.locations.map(loc => (
                  <span key={loc} className="flow-tag">
                    {loc}
                    <span className="flow-tag-x" onClick={() => removeLocationFromRule(idx, loc)}>x</span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="text" className="input-text" placeholder="Type location..."
                  value={ruleLocInput}
                  onChange={e => setRuleLocInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && ruleLocInput.trim()) {
                      addLocationToRule(idx, ruleLocInput.trim())
                      setRuleLocInput('')
                    }
                  }}
                  list={`loc-list-${idx}`}
                  style={{ flex: 1, fontSize: '0.6rem', padding: '2px 6px', height: 22 }} />
                <datalist id={`loc-list-${idx}`}>
                  {locations.filter(l => !rule.locations.includes(l)).map(l => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
                <button className="btn-small" onClick={() => {
                  if (ruleLocInput.trim()) { addLocationToRule(idx, ruleLocInput.trim()); setRuleLocInput('') }
                }}>ADD</button>
              </div>
            </div>

            <div className="flow-rule-section">
              <span className="flow-rule-sublabel">CATEGORIES</span>
              <div className="flow-cat-grid">
                {CATEGORY_ENTRIES.map(([id, cat]) => (
                  <div key={id}
                    className={`flow-cat-chip ${rule.categories.includes(id) ? 'flow-cat-active' : ''}`}
                    style={rule.categories.includes(id) ? { borderColor: CATEGORY_COLORS[id], color: CATEGORY_COLORS[id] } : {}}
                    onClick={() => toggleCategoryInRule(idx, id)}>
                    <span className="flow-cat-dot" style={{ backgroundColor: CATEGORY_COLORS[id] }} />
                    {cat.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Rule preview */}
            <div className="flow-rule-preview">
              {rule.locations.length > 0 ? rule.locations.join(', ') : 'Any location'}
              {' + '}
              {rule.categories.length > 0 ? rule.categories.map(c => CATEGORIES[c]?.label || c).join(', ') : 'Any category'}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn-primary" onClick={onCancel}>CANCEL</button>
          <button className="btn-accent" onClick={handleSave}
            disabled={!name.trim() || rules.length === 0}
            style={{ opacity: (!name.trim() || rules.length === 0) ? 0.4 : 1 }}>
            SAVE FLOW
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Flow() {
  const { flows, saveFlow, deleteFlow, toggleFlow, geoArticles, stats } = useIntel()
  const [editing, setEditing] = useState(null) // null | 'new' | flow object

  const activeCount = flows.filter(f => f.active).length

  return (
    <div>
      <div className="page-header">
        <h1>// Flow</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {activeCount > 0 && <span className="badge badge-success">{activeCount} ACTIVE</span>}
          <span className="toolbar-count">{flows.length} flows</span>
        </div>
      </div>

      <div className="info-bar" style={{ marginBottom: '1.5rem' }}>
        <span className="info-item">Flows create compound filters with per-location category rules.</span>
      </div>

      <div className="page-layout">
        <div className="page-main">
          {/* Flow Editor */}
          {editing && (
            <FlowEditor
              flow={editing === 'new' ? null : editing}
              geoArticles={geoArticles}
              onSave={(flow) => { saveFlow(flow); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          )}

          {/* Flow List */}
          {!editing && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">// FLOWS</span>
                <button className="btn-accent" onClick={() => setEditing('new')}
                  style={{ fontSize: '0.6rem', padding: '0.2rem 0.6rem' }}>+ NEW FLOW</button>
              </div>
              {flows.length === 0 ? (
                <div className="panel-body">
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                    No flows created yet. Create a flow to set up compound location + category filters.
                  </p>
                </div>
              ) : (
                <div>
                  {flows.map(flow => (
                    <div key={flow.id} className="list-item">
                      <div className="list-item-header" style={{ gap: '0.5rem' }}>
                        <div className="list-item-left" style={{ flex: 1, minWidth: 0, gap: '0.5rem' }}>
                          <label className="toolbar-switch" onClick={(e) => { e.stopPropagation(); toggleFlow(flow.id) }}>
                            <span className={`switch-track ${flow.active ? 'switch-on' : ''}`}>
                              <span className="switch-thumb" />
                            </span>
                          </label>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: flow.active ? 'var(--accent)' : 'var(--text-secondary)' }}>
                              {flow.name}
                            </div>
                            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {flow.rules?.length || 0} rule{flow.rules?.length !== 1 ? 's' : ''} —{' '}
                              {flow.rules?.map(r => {
                                const locs = r.locations?.join(', ') || 'any'
                                const cats = r.categories?.map(c => CATEGORIES[c]?.label || c).join('+') || 'any'
                                return `${locs}: ${cats}`
                              }).join(' | ')}
                            </div>
                          </div>
                        </div>
                        <div className="list-item-right" style={{ gap: '0.3rem', flexShrink: 0 }}>
                          <button className="btn-small" onClick={() => setEditing(flow)}>EDIT</button>
                          <button className="btn-small" style={{ color: 'var(--danger)' }} onClick={() => deleteFlow(flow.id)}>DEL</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="page-sidebar-right">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// HOW IT WORKS</span>
            </div>
            <div className="panel-body" style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <p style={{ marginBottom: '0.5rem' }}>
                A <strong style={{ color: 'var(--accent)' }}>flow</strong> is a set of rules. Each rule defines which <strong>locations</strong> and <strong>categories</strong> to show.
              </p>
              <p style={{ marginBottom: '0.5rem' }}>
                An article passes if it matches <strong>any</strong> rule in an active flow. A rule matches when the article's location is in the rule's location list AND its category is in the rule's category list.
              </p>
              <p style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.6rem' }}>
                Example: "Israel: CONFLICT | USA: POLITICS+CONFLICT | Iran: CONFLICT+ECONOMY"
              </p>
              <p>
                When no flows are active, all articles show. Multiple active flows combine — an article shows if it matches any active flow.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">// STATS</span>
            </div>
            <div className="panel-body">
              <div className="info-row"><span className="info-label">Total Articles</span><span className="info-value">{stats.total}</span></div>
              <div className="info-row"><span className="info-label">Geolocated</span><span className="info-value">{stats.geolocated}</span></div>
              <div className="info-row"><span className="info-label">Active Flows</span><span className="info-value">{activeCount}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
