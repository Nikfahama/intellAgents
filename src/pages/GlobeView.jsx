import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Globe from 'react-globe.gl'
import { Vector3, Vector2, Raycaster, Sphere } from 'three'
import { useTheme } from '../contexts/ThemeContext'
import { useIntel } from '../contexts/IntelContext'
import { CATEGORIES } from '../utils/sources'
import * as topojson from 'topojson-client'
import { isAIEnabled } from '../utils/ai'
import { runAgentCommand } from '../utils/agent'

const GLOBE_STYLES = {
  outline: { label: 'OUTLINE', globeImage: null, bgImage: null, bgColor: '#000005',
    bumpImage: null, globeMaterial: { color: '#050510', emissive: '#020208' } },
  night: { label: 'NIGHT', globeImage: '//unpkg.com/three-globe/example/img/earth-night.jpg',
    bgImage: '//unpkg.com/three-globe/example/img/night-sky.png', bgColor: null,
    bumpImage: '//unpkg.com/three-globe/example/img/earth-topology.png', globeMaterial: null },
  topo: { label: 'TOPO', globeImage: '//unpkg.com/three-globe/example/img/earth-topology.png',
    bgImage: '//unpkg.com/three-globe/example/img/night-sky.png', bgColor: null,
    bumpImage: '//unpkg.com/three-globe/example/img/earth-topology.png', globeMaterial: null },
  blue: { label: 'MARBLE', globeImage: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    bgImage: '//unpkg.com/three-globe/example/img/night-sky.png', bgColor: null,
    bumpImage: '//unpkg.com/three-globe/example/img/earth-topology.png', globeMaterial: null },
  water: { label: 'DARK TOPO', globeImage: '//unpkg.com/three-globe/example/img/earth-dark.jpg',
    bgImage: '//unpkg.com/three-globe/example/img/night-sky.png', bgColor: null,
    bumpImage: '//unpkg.com/three-globe/example/img/earth-topology.png', globeMaterial: null },
}

const CATEGORY_COLORS = {
  conflict: '#ff3333', security: '#ff6644', politics: '#cc7000',
  economy: '#ccff00', disaster: '#ff8800', humanitarian: '#8888ff', general: '#666666',
  stocks: '#00cc88', terrorism: '#ff1111', defense: '#6688cc',
  antisemitism: '#cc44cc', maritime: '#2299dd', trade: '#ddaa22',
}

const GLOBE_R = 100

function getCSSVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() }

// Reverse-project screen coords to lat/lng by raycasting onto the globe sphere
function screenToLatLng(mx, my, camera, W, H) {
  const ndc = new Vector2((mx / W) * 2 - 1, -(my / H) * 2 + 1)
  const rc = new Raycaster()
  rc.setFromCamera(ndc, camera)
  const sphere = new Sphere(new Vector3(0, 0, 0), GLOBE_R)
  const target = new Vector3()
  const hit = rc.ray.intersectSphere(sphere, target)
  if (!hit) return null
  const lat = 90 - Math.acos(target.y / GLOBE_R) * 180 / Math.PI
  const lng = 90 - Math.atan2(target.z, target.x) * 180 / Math.PI
  return { lat, lng }
}

// Ray casting point-in-polygon test (2D screen coords)
function pointInPoly(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function truncate(s, l) { return !s ? '' : s.length > l ? s.slice(0, l) + '...' : s }

// Interpolate points along a polygon's edges for smooth globe-curved rendering
function interpolatePolygon(coords, camera, W, H, segsPerEdge = 8) {
  const pts = []
  for (let i = 0; i < coords.length; i++) {
    const a = coords[i], b = coords[(i + 1) % coords.length]
    for (let s = 0; s < segsPerEdge; s++) {
      const t = s / segsPerEdge
      const lat = a.lat + (b.lat - a.lat) * t
      const lng = a.lng + (b.lng - a.lng) * t
      const sp = projectToScreen(latLngTo3D(lat, lng), camera, W, H)
      pts.push(sp)
    }
  }
  return pts
}

// Must match three-globe's internal polar2Cartesian exactly
// Downsample polygon rings to maxPts points to reduce GPU load
function simplifyCoords(coords, type, maxPts) {
  const simplifyRing = (ring) => {
    if (ring.length <= maxPts) return ring
    const step = ring.length / maxPts
    const out = []
    for (let i = 0; i < maxPts; i++) out.push(ring[Math.floor(i * step)])
    // close ring
    if (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]) out.push(out[0])
    return out
  }
  if (type === 'Polygon') return coords.map(ring => simplifyRing(ring))
  if (type === 'MultiPolygon') return coords.map(poly => poly.map(ring => simplifyRing(ring)))
  return coords
}

function simplifyFeatures(features, maxPts) {
  return features.map(f => ({
    ...f,
    geometry: {
      ...f.geometry,
      coordinates: simplifyCoords(f.geometry.coordinates, f.geometry.type, maxPts),
    }
  }))
}

function latLngTo3D(lat, lng) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (90 - lng) * Math.PI / 180
  return new Vector3(
    GLOBE_R * Math.sin(phi) * Math.cos(theta),
    GLOBE_R * Math.cos(phi),
    GLOBE_R * Math.sin(phi) * Math.sin(theta)
  )
}

// Project a 3D point to screen coords
function projectToScreen(p3d, camera, W, H) {
  const v = p3d.clone().project(camera)
  return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, z: v.z }
}


export default function GlobeView({ popout = false }) {
  const { theme } = useTheme()
  const { geoArticles, loading } = useIntel()
  const globeRef = useRef()
  const containerRef = useRef()
  const canvasRef = useRef()
  const canvasTopRef = useRef()
  const cardRefsMap = useRef(new Map())
  const [selectedArticle, setSelectedArticle] = useState(null)
  const selectedArticleRef = useRef(null)
  const [expandedCards, setExpandedCards] = useState(new Set())
  const expandedRef = useRef(new Set())
  const [frontCard, setFrontCard] = useState(null)
  const lockedPositions = useRef(new Map()) // articleId → {x, y} frozen position
  const lastPositions = useRef(new Map()) // articleId → {x, y} last rendered position
  const mouseDownPos = useRef(null) // track drag vs click
  const [cardSizes, setCardSizes] = useState({}) // articleId → {w, h}
  const resizingRef = useRef(null) // {id, startX, startY, startW, startH}
  const cardDragged = useRef(false) // suppress click after drag
  const [collapsedPanels, setCollapsedPanels] = useState({}) // panelId → boolean
  const [autoRotate, setAutoRotate] = useState(false)
  const [rotateSpeed, setRotateSpeed] = useState(0.5)
  const [showArcs, setShowArcs] = useState(false)
  const [showBorders, setShowBorders] = useState(true)
  const [showCards, setShowCards] = useState(true)
  const [stackCards, setStackCards] = useState(false)
  const [stackIndex, setStackIndex] = useState(0)
  const stackIndexRef = useRef(0)
  const [globeStyle, setGlobeStyle] = useState('outline')
  const [activeCategories, setActiveCategories] = useState(new Set(Object.keys(CATEGORIES)))
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const categoryDropdownRef = useRef(null)
  const [archiveMode, setArchiveMode] = useState('all')
  const [archiveFrom, setArchiveFrom] = useState('')
  const [archiveTo, setArchiveTo] = useState('')
  const [archiveDropdownOpen, setArchiveDropdownOpen] = useState(false)
  const archiveDropdownRef = useRef(null)
  const [poppedOut, setPoppedOut] = useState(false)
  const popoutWindowRef = useRef(null)
  const popoutContainerRef = useRef(null)
  const [globeAltitude, setGlobeAltitude] = useState(2.5)
  const [clusterScrollMap, setClusterScrollMap] = useState({}) // clusterRepId → active index
  const clusterScrollRef = useRef({})
  clusterScrollRef.current = clusterScrollMap
  const [countryFilter, setCountryFilter] = useState(new Set())
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const countryDropdownRef = useRef(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentInput, setAgentInput] = useState('')
  const [agentMessages, setAgentMessages] = useState([])
  const [agentLoading, setAgentLoading] = useState(false)
  const [focusMode, setFocusMode] = useState(false) // polygon drawing mode
  const [focusVerts, setFocusVerts] = useState([]) // [{lat,lng}] geographic coords while drawing
  const [zones, setZones] = useState([]) // [{id, name, color, coords:[{lat,lng}]}] saved zones
  const [activeZoneId, setActiveZoneId] = useState(null) // which zone is used for focus fading
  const [pendingZoneName, setPendingZoneName] = useState('')
  const [pendingZoneColor, setPendingZoneColor] = useState('#cc7000')
  const zoneIdCounter = useRef(1)
  const draggingVert = useRef(null) // { type: 'pending'|'zone', zoneId?, vertIdx, startMx, startMy }
  const projectedPoints = useRef([]) // [{x, y, article}, ...] updated each frame
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [countries, setCountries] = useState([])
  const { borderResolution, clusterRadius: clusterMultiplier } = useTheme()

  // Map resolution setting to world-atlas file
  const resFile = borderResolution === '10m' ? 'countries-10m.json'
    : borderResolution === '50m' ? 'countries-50m.json'
    : 'countries-110m.json'

  useEffect(() => {
    setCountries([]) // clear while loading
    fetch(`https://unpkg.com/world-atlas@2/${resFile}`)
      .then(r => r.json())
      .then(data => setCountries(topojson.feature(data, data.objects.countries).features))
      .catch(() => {})
  }, [resFile, borderResolution])

  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width, h = e.contentRect.height
        setDimensions({ width: w, height: h })
        if (canvasRef.current) {
          canvasRef.current.width = w * devicePixelRatio
          canvasRef.current.height = h * devicePixelRatio
        }
        if (canvasTopRef.current) {
          canvasTopRef.current.width = w * devicePixelRatio
          canvasTopRef.current.height = h * devicePixelRatio
        }
      }
    })
    obs.observe(c)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    g.controls().autoRotate = autoRotate
    g.controls().autoRotateSpeed = rotateSpeed
    g.controls().enableZoom = true
    g.pointOfView({ lat: 20, lng: 0, altitude: 2.5 })
  }, [])

  // Pause rotation when a card is expanded; disable controls in focus draw mode
  const hasExpanded = expandedCards.size > 0
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    g.controls().enabled = !focusMode
    g.controls().autoRotate = autoRotate && !hasExpanded && !focusMode
    g.controls().autoRotateSpeed = rotateSpeed
  }, [autoRotate, rotateSpeed, hasExpanded, focusMode])

  // Track zoom level for clustering
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    const controls = g.controls()
    let last = 0
    const onZoom = () => {
      const pov = g.pointOfView()
      if (pov && Math.abs(pov.altitude - last) > 0.05) {
        last = pov.altitude
        setGlobeAltitude(pov.altitude)
      }
    }
    const onGlobeMove = () => {
      // Clear locked positions for non-selected cards/clusters
      for (const [key] of lockedPositions.current) {
        if (typeof key === 'string' && key.startsWith('cluster-')) {
          lockedPositions.current.delete(key)
        } else if (!expandedRef.current.has(key)) {
          lockedPositions.current.delete(key)
        }
      }
    }
    controls.addEventListener('change', onZoom)
    controls.addEventListener('change', onGlobeMove)
    return () => {
      controls.removeEventListener('change', onZoom)
      controls.removeEventListener('change', onGlobeMove)
    }
  }, [])

  useEffect(() => {
    const g = globeRef.current
    const s = GLOBE_STYLES[globeStyle]
    if (!g || !s.globeMaterial) return
    const mesh = g.scene().children.find(c => c.type === 'Mesh')
    if (mesh?.material) {
      mesh.material.color?.set(s.globeMaterial.color)
      mesh.material.emissive?.set(s.globeMaterial.emissive)
    }
  }, [globeStyle])

  const allCatIds = useMemo(() => Object.keys(CATEGORIES), [])
  const filtered = useMemo(() => {
    if (activeCategories.size === 0) return []
    let result = activeCategories.size === allCatIds.length
      ? geoArticles
      : geoArticles.filter(a => {
          // Check primary category and all cross-categories
          if (activeCategories.has(a.category.id)) return true
          const allCats = a.category.allCategories || a.allCategories
          return allCats?.some(c => activeCategories.has(c))
        })
    if (archiveMode !== 'all') {
      let fromTs = 0, toTs = Infinity
      const now = Date.now()
      if (archiveMode === '24h') fromTs = now - 24 * 3600000
      else if (archiveMode === '48h') fromTs = now - 48 * 3600000
      else if (archiveMode === '7d') fromTs = now - 7 * 86400000
      else if (archiveMode === '30d') fromTs = now - 30 * 86400000
      else if (archiveMode === 'custom') {
        if (archiveFrom) fromTs = new Date(archiveFrom).getTime()
        if (archiveTo) toTs = new Date(archiveTo + 'T23:59:59').getTime()
      }
      result = result.filter(a => {
        try {
          const t = new Date(a.pubDate).getTime()
          return t >= fromTs && t <= toTs
        } catch { return false }
      })
    }
    // Country/location filter — supports multi-country articles
    if (countryFilter.size > 0) {
      result = result.filter(a => {
        if (countryFilter.has(a.location?.name)) return true
        if (countryFilter.has(a.location?.country)) return true
        const countries = a.countries || a.location?.countries
        return countries?.some(c => countryFilter.has(c))
      })
    }
    return result
  }, [geoArticles, activeCategories, allCatIds, archiveMode, archiveFrom, archiveTo, countryFilter])

  // Available locations for country filter dropdown — includes multi-country
  const availableLocations = useMemo(() => {
    const counts = {}
    for (const a of geoArticles) {
      const name = a.location?.name
      if (name) counts[name] = (counts[name] || 0) + 1
      // Also count countries from multi-country array
      const countries = a.countries || a.location?.countries
      if (countries) {
        for (const c of countries) {
          if (c && c !== name) counts[c] = (counts[c] || 0) + 1
        }
      }
      // Single country field
      const country = a.location?.country
      if (country && country !== name) counts[country] = (counts[country] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [geoArticles])

  // Every article gets a card. Group by location into local stacks.
  const { cardArticles, clusters } = useMemo(() => {
    if (filtered.length === 0) return { cardArticles: [], clusters: new Map() }
    // Group by location name — articles at same place form a local stack
    const byLocation = new Map()
    for (const a of filtered) {
      const key = a.location.name
      if (!byLocation.has(key)) byLocation.set(key, [])
      byLocation.get(key).push(a)
    }
    // Also merge nearby locations based on zoom
    const proximityRadius = Math.max(0.05, globeAltitude * clusterMultiplier)
    const locKeys = [...byLocation.keys()]
    const merged = new Map() // locName → merged group
    const usedKeys = new Set()
    for (const key of locKeys) {
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      const group = [...byLocation.get(key)]
      const ref = group[0].location
      for (const otherKey of locKeys) {
        if (usedKeys.has(otherKey)) continue
        const other = byLocation.get(otherKey)[0].location
        const dLat = ref.lat - other.lat, dLng = ref.lng - other.lng
        if (dLat * dLat + dLng * dLng < proximityRadius * proximityRadius) {
          group.push(...byLocation.get(otherKey))
          usedKeys.add(otherKey)
        }
      }
      merged.set(key, group)
    }
    // Build: all articles are cards. Selected articles pop out of their cluster.
    const clusterMap = new Map()
    const allCards = []
    for (const [, group] of merged) {
      // Split: selected cards are independent, unselected stay in the cluster
      const inCluster = group.filter(a => !expandedCards.has(a.id))
      const poppedOut = group.filter(a => expandedCards.has(a.id))
      // Cluster for the remaining unselected articles
      if (inCluster.length > 0) {
        const rep = inCluster[0]
        for (const a of inCluster) {
          clusterMap.set(a.id, {
            articles: inCluster,
            lat: rep.location.lat,
            lng: rep.location.lng,
            name: rep.location.name,
            count: inCluster.length,
            repId: rep.id,
          })
        }
      }
      // Popped-out selected cards are their own single-item "cluster"
      for (const a of poppedOut) {
        clusterMap.set(a.id, {
          articles: [a],
          lat: a.location.lat,
          lng: a.location.lng,
          name: a.location.name,
          count: 1,
          repId: a.id,
        })
      }
      allCards.push(...group)
    }
    return { cardArticles: allCards, clusters: clusterMap }
  }, [filtered, globeAltitude, clusterMultiplier, expandedCards])

  const arcs = useMemo(() => {
    if (!showArcs || filtered.length < 2) return []
    const result = [], used = new Set()
    for (let i = 0; i < Math.min(filtered.length, 30); i++)
      for (let j = i + 1; j < Math.min(filtered.length, 30); j++) {
        const a = filtered[i], b = filtered[j]
        if (a.location.region !== b.location.region) {
          const k = `${a.location.name}-${b.location.name}`
          if (!used.has(k)) { used.add(k); result.push({ startLat: a.location.lat, startLng: a.location.lng, endLat: b.location.lat, endLng: b.location.lng }) }
          if (result.length >= 20) return result
        }
      }
    return result
  }, [filtered, showArcs])

  // ---------- RAF LOOP ----------
  useEffect(() => {
    let frameId
    const update = () => {
      const g = globeRef.current
      const canvas = canvasRef.current
      const canvasTop = canvasTopRef.current
      if (!g || !canvas) { frameId = requestAnimationFrame(update); return }

      const camera = g.camera()
      const W = dimensions.width, H = dimensions.height
      if (W === 0 || H === 0) { frameId = requestAnimationFrame(update); return }
      const dpr = devicePixelRatio
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)
      // Top canvas for selected card lines (renders above unselected cards)
      const ctxTop = canvasTop?.getContext('2d')
      if (ctxTop) {
        ctxTop.clearRect(0, 0, canvasTop.width, canvasTop.height)
        ctxTop.save()
        ctxTop.scale(dpr, dpr)
      }

      // Globe center on screen
      const gc = projectToScreen(new Vector3(0, 0, 0), camera, W, H)

      // Globe screen radius — sample multiple axis points for robustness
      let globeSR = 0
      for (const p of [
        new Vector3(0, GLOBE_R, 0),
        new Vector3(GLOBE_R, 0, 0),
        new Vector3(0, 0, GLOBE_R),
        new Vector3(-GLOBE_R, 0, 0),
        new Vector3(0, 0, -GLOBE_R),
      ]) {
        const sp = projectToScreen(p, camera, W, H)
        const d = Math.sqrt((sp.x - gc.x) ** 2 + (sp.y - gc.y) ** 2)
        if (d > globeSR) globeSR = d
      }

      // Store globeSR on container for drag handler access
      if (containerRef.current) containerRef.current.dataset.globeSR = String(globeSR)
      const camDir = camera.position.clone().normalize()
      const accent = getCSSVar('--accent') || '#cc7000'
      const now = Date.now()

      // --- Draw 2D points for ALL filtered articles (breathing + ripple) ---
      // Build set of non-representative article IDs to skip their individual dots
      const clusteredIds = new Set()
      for (const [artId, cl] of clusters) {
        if (cl.count > 1 && cl.repId !== artId) clusteredIds.add(artId)
      }

      const pts = []
      filtered.forEach((a, i) => {
        if (!a.location) return
        // Skip articles that are part of a cluster (drawn once at rep position)
        if (clusteredIds.has(a.id)) return
        const p3d = latLngTo3D(a.location.lat, a.location.lng)
        const dot = camDir.dot(p3d.clone().normalize())
        if (dot < -0.05) return
        const ptSp = projectToScreen(p3d, camera, W, H)
        // Skip off-screen points
        if (ptSp.x < -20 || ptSp.x > W + 20 || ptSp.y < -20 || ptSp.y > H + 20) return
        const ptVis = dot < 0.2 ? (dot + 0.05) / 0.25 : 1
        const catColor = CATEGORY_COLORS[a.category.id] || '#666'
        const clusterInfo = clusters.get(a.id)
        const isCluster = clusterInfo && clusterInfo.count > 1

        // Focus polygon fade
        let fv = ptVis
        const activeZone2 = focusMode && focusVerts.length >= 3 ? focusVerts
          : activeZoneId ? zones.find(z => z.id === activeZoneId)?.coords : null
        if (activeZone2 && activeZone2.length >= 3) {
          const sp2 = activeZone2.map(v => {
            const p = projectToScreen(latLngTo3D(v.lat, v.lng), camera, W, H)
            return { x: p.x, y: p.y }
          })
          if (!pointInPoly(ptSp.x, ptSp.y, sp2)) return // completely hide points outside focused zone
        }

        const breath = 0.5 + 0.5 * Math.sin(now / 800 + i * 0.7)

        if (isCluster) {
          // Draw SQUARE for multi-article cluster
          const s = 3 + breath * 1.5
          ctx.globalAlpha = fv * (0.5 + breath * 0.3)
          ctx.fillStyle = catColor
          ctx.fillRect(ptSp.x - s, ptSp.y - s, s * 2, s * 2)
          // Square ripple
          const ripplePeriod = 3000
          const rippleT = ((now + i * 400) % ripplePeriod) / ripplePeriod
          const rippleS = 4 + rippleT * 14
          const rippleAlpha = (1 - rippleT) * 0.3 * fv
          if (rippleAlpha > 0.01) {
            ctx.globalAlpha = rippleAlpha
            ctx.strokeStyle = catColor
            ctx.lineWidth = 0.8
            ctx.strokeRect(ptSp.x - rippleS, ptSp.y - rippleS, rippleS * 2, rippleS * 2)
          }
        } else {
          // Draw CIRCLE for single article
          const r = 2 + breath * 1.2
          ctx.globalAlpha = fv * (0.4 + breath * 0.4)
          ctx.fillStyle = catColor
          ctx.beginPath()
          ctx.arc(ptSp.x, ptSp.y, r, 0, Math.PI * 2)
          ctx.fill()
          // Circle ripple
          const ripplePeriod = 3000
          const rippleT = ((now + i * 400) % ripplePeriod) / ripplePeriod
          const rippleR = 3 + rippleT * 12
          const rippleAlpha = (1 - rippleT) * 0.3 * fv
          if (rippleAlpha > 0.01) {
            ctx.globalAlpha = rippleAlpha
            ctx.strokeStyle = catColor
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.arc(ptSp.x, ptSp.y, rippleR, 0, Math.PI * 2)
            ctx.stroke()
          }
        }

        // Store for click detection
        if (fv > 0.1) pts.push({ x: ptSp.x, y: ptSp.y, article: a })
      })
      projectedPoints.current = pts

      // --- Card leader lines and annotations (two passes: unselected then selected on top) ---
      const drawCard = (a, i, drawCtx) => {
        const ctx = drawCtx // use the passed canvas context for this card's lines
        const el = cardRefsMap.current.get(a.id)
        if (!el) return

        const p3d = latLngTo3D(a.location.lat, a.location.lng)
        const dot = camDir.dot(p3d.clone().normalize())

        // Project to screen
        const sp = projectToScreen(p3d, camera, W, H)
        const catColor = CATEGORY_COLORS[a.category.id] || '#666'

        // --- STACK MODE: deck of cards on the right ---
        if (stackCards) {
          const isExp = expandedRef.current.has(a.id)
          const deckIdx = cardArticles.indexOf(a)
          const activeIdx = stackIndexRef.current
          const offset = deckIdx - activeIdx
          const cW = el.offsetWidth || 185
          const cH = el.offsetHeight || 55
          // Position: right side of canvas, stacked with small vertical offset
          const deckRight = 12
          const deckTop = H * 0.15
          const stackStep = 3  // px offset per card behind
          const maxVisible = 5

          // Cards far from active index are hidden
          if (offset < 0 || offset > maxVisible) {
            el.style.display = 'none'
            el.style.pointerEvents = 'none'
            return
          }
          el.style.display = ''

          // Active card on top, others peek behind with increasing offset
          // Selected cards stay in place — only visual difference is white border + line
          const fx = W - cW - deckRight + offset * 1
          const fy = deckTop + offset * stackStep
          const cardOpacity = offset === 0 ? 1 : Math.max(0.08, 0.35 - offset * 0.07)
          const cardZ = 100 - offset

          el.style.left = fx + 'px'
          el.style.top = fy + 'px'
          el.style.opacity = String(cardOpacity)
          el.style.zIndex = String(cardZ)
          el.style.pointerEvents = (offset === 0 || isExp) ? 'auto' : 'none'
          lastPositions.current.set(a.id, { x: fx, y: fy })

          // Draw leader line — only white line for selected card when it's the active card
          if (dot < -0.05) return
          const vis = dot < 0.2 ? (dot + 0.05) / 0.25 : 1
          if (vis < 0.05 || offset > 2) return
          // In stack mode, only show white selected line when card is the active one (offset 0)
          const drawAsSelected = isExp && offset === 0

          // Connection point on card: always left edge center (cards are on the right)
          const conn = { x: fx, y: fy + cH / 2 }
          const circleR = Math.max(8, globeSR * 0.035)
          let lineStartX = sp.x, lineStartY = sp.y
          if (drawAsSelected) {
            const tDx = conn.x - sp.x, tDy = conn.y - sp.y
            const tDist = Math.sqrt(tDx * tDx + tDy * tDy) || 1
            lineStartX = sp.x + (tDx / tDist) * circleR
            lineStartY = sp.y + (tDy / tDist) * circleR
          }

          if (drawAsSelected) {
            ctx.globalAlpha = vis * 0.8
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5
            ctx.shadowColor = '#ffffff'
            ctx.shadowBlur = 6
            ctx.setLineDash([])
          } else {
            ctx.globalAlpha = vis * 0.3 * cardOpacity
            ctx.strokeStyle = catColor
            ctx.lineWidth = 1
            ctx.shadowColor = 'transparent'
            ctx.shadowBlur = 0
            ctx.setLineDash([3, 4])
          }
          ctx.beginPath()
          ctx.moveTo(lineStartX, lineStartY)
          ctx.lineTo(conn.x, conn.y)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'

          // Surface point
          if (drawAsSelected) {
            ctx.globalAlpha = vis * 0.9
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5
            ctx.shadowColor = '#ffffff'
            ctx.shadowBlur = 8
            ctx.beginPath()
            ctx.arc(sp.x, sp.y, circleR, 0, Math.PI * 2)
            ctx.stroke()
            ctx.shadowBlur = 0
            ctx.shadowColor = 'transparent'
            ctx.fillStyle = '#ffffff'
            ctx.globalAlpha = vis * 0.6
            ctx.beginPath()
            ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2)
            ctx.fill()
          } else {
            const pulse = 0.3 + 0.7 * Math.abs(Math.sin(now / 600 + i * 1.2))
            ctx.globalAlpha = vis * pulse * 0.6 * cardOpacity
            ctx.fillStyle = catColor
            ctx.beginPath()
            ctx.arc(sp.x, sp.y, 2 + pulse * 1.5, 0, Math.PI * 2)
            ctx.fill()
          }

          // Card connection dot
          ctx.fillStyle = drawAsSelected ? '#ffffff' : catColor
          if (drawAsSelected) {
            ctx.globalAlpha = vis * 0.3
            ctx.beginPath()
            ctx.arc(conn.x, conn.y, 7, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = vis * (drawAsSelected ? 1 : 0.7 * cardOpacity)
          ctx.beginPath()
          ctx.arc(conn.x, conn.y, drawAsSelected ? 4 : 3.5, 0, Math.PI * 2)
          ctx.fill()
          return
        }

        // Visibility — backface + off-screen + focus region
        if (dot < -0.05) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          return
        }
        // Hide cards whose surface point is outside the visible canvas (with margin)
        const screenMargin = 50
        if (sp.x < -screenMargin || sp.x > W + screenMargin || sp.y < -screenMargin || sp.y > H + screenMargin) {
          el.style.display = 'none'
          el.style.pointerEvents = 'none'
          return
        }
        let vis = dot < 0.2 ? (dot + 0.05) / 0.25 : 1
        // Focus polygon fading — project geographic zone coords to screen
        const activeZone = focusMode && focusVerts.length >= 3 ? focusVerts
          : activeZoneId ? zones.find(z => z.id === activeZoneId)?.coords : null
        if (activeZone && activeZone.length >= 3) {
          const screenPoly = activeZone.map(v => {
            const p = projectToScreen(latLngTo3D(v.lat, v.lng), camera, W, H)
            return { x: p.x, y: p.y }
          })
          if (!pointInPoly(sp.x, sp.y, screenPoly)) {
            // Completely hide cards outside focused zone
            el.style.display = 'none'
            el.style.pointerEvents = 'none'
            return
          }
        }
        if (vis < 0.05) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          el.style.display = 'none'
          return
        }
        el.style.display = ''
        const isExp = expandedRef.current.has(a.id)
        el.style.opacity = isExp ? '1' : String(vis)
        el.style.pointerEvents = (isExp || vis > 0.3) ? 'auto' : 'none'

        const cW = el.offsetWidth || 170
        const cH = el.offsetHeight || 55

        // Local cluster deck — only show the active card per cluster, scroll to cycle
        const cl = clusters.get(a.id)
        const isMulti = cl && cl.count > 1
        const groupIdx = isMulti ? cl.articles.indexOf(a) : 0
        const repId = cl?.repId
        const activeClusterIdx = isMulti ? (clusterScrollRef.current[repId] || 0) : 0
        const isActiveInCluster = !isMulti || groupIdx === activeClusterIdx

        // Hide non-active cards in a cluster — only the active card is shown
        if (isMulti && !isActiveInCluster && !isExp) {
          el.style.display = 'none'
          el.style.pointerEvents = 'none'
          return
        }

        // Position: use cluster's anchor point (not individual article's) so position is stable when scrolling
        const anchorLat = isMulti && !isExp ? cl.lat : a.location.lat
        const anchorLng = isMulti && !isExp ? cl.lng : a.location.lng
        const anchorP3d = (anchorLat === a.location.lat && anchorLng === a.location.lng) ? p3d : latLngTo3D(anchorLat, anchorLng)
        const anchorSp = (anchorP3d === p3d) ? sp : projectToScreen(anchorP3d, camera, W, H)
        const dx = anchorSp.x - gc.x, dy = anchorSp.y - gc.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const nx = dx / dist, ny = dy / dist
        const cardMargin = 75
        const cardDist = Math.max(globeSR + cardMargin, dist + 35)
        const idealX = gc.x + nx * cardDist
        const idealY = gc.y + ny * cardDist

        // Use cluster repId as the lock key for dragged clusters (so all cards in a cluster share position)
        const lockKey = isMulti && !isExp ? `cluster-${repId}` : a.id
        let fx, fy
        if (lockedPositions.current.has(lockKey)) {
          const locked = lockedPositions.current.get(lockKey)
          fx = locked.x
          fy = locked.y
        } else {
          fx = Math.round(Math.max(3, Math.min(W - cW - 3, idealX - cW / 2)))
          fy = Math.round(Math.max(3, Math.min(H - cH - 3, idealY - cH / 2)))
        }
        // Only update DOM when position changed by >=1px
        const last = lastPositions.current.get(a.id)
        if (!last || Math.abs(last.x - fx) >= 1 || Math.abs(last.y - fy) >= 1) {
          el.style.left = fx + 'px'
          el.style.top = fy + 'px'
          lastPositions.current.set(a.id, { x: fx, y: fy })
        }

        // --- LEADER LINE ---
        // Only draw line for the active card in a cluster (or for single/expanded cards)
        if (isMulti && !isActiveInCluster && !isExp) return

        // Elbow: when the surface point is inside the globe's screen circle + buffer,
        // the line bends at the globe edge perimeter.
        // Disable elbow for dragged cards — straight line looks better when position is manual
        const isDragged = lockedPositions.current.has(lockKey)
        const buffer = 20
        const edgeR = globeSR + buffer
        let useElbow = !isExp && !isDragged && dist < edgeR
        // Base elbow on the globe edge, radially outward through the surface point
        let elbowX = gc.x + nx * edgeR
        let elbowY = gc.y + ny * edgeR

        // Pick the connection point on the card based on WHERE THE LINE ARRIVES FROM.
        // When there's an elbow, the line arrives from the elbow direction.
        // When straight, it arrives from the surface point direction.
        const fromX = useElbow ? elbowX : sp.x
        const fromY = useElbow ? elbowY : sp.y
        const cardCx = fx + cW / 2, cardCy = fy + cH / 2

        // Pick the edge that faces the incoming line
        const midTop    = { x: fx + cW / 2, y: fy }
        const midBottom = { x: fx + cW / 2, y: fy + cH }
        const midLeft   = { x: fx,          y: fy + cH / 2 }
        const midRight  = { x: fx + cW,     y: fy + cH / 2 }
        const candidates = [midTop, midBottom, midLeft, midRight]
        let conn = midTop, bestD = Infinity
        for (const c of candidates) {
          const d = (c.x - fromX) ** 2 + (c.y - fromY) ** 2
          if (d < bestD) { bestD = d; conn = c }
        }

        // Snap elbow so the second arm is exactly horizontal or vertical
        if (useElbow) {
          const isHoriz = (conn.y === fy + cH / 2) // left or right edge
          if (isHoriz) {
            elbowY = conn.y
          } else {
            elbowX = conn.x
          }
        }

        // Selected/focused state: white glow + continuous line. Otherwise: dim + category color.
        const isFocused = isExp || frontCard === a.id
        const circleR = Math.max(8, globeSR * 0.035)
        let lineStartX = sp.x, lineStartY = sp.y
        if (isFocused) {
          const target = useElbow ? { x: elbowX, y: elbowY } : conn
          const tDx = target.x - sp.x, tDy = target.y - sp.y
          const tDist = Math.sqrt(tDx * tDx + tDy * tDy) || 1
          lineStartX = sp.x + (tDx / tDist) * circleR
          lineStartY = sp.y + (tDy / tDist) * circleR
        }

        if (isFocused) {
          // === SELECTED/FOCUSED: solid white glow ===
          ctx.globalAlpha = vis * 0.8
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.shadowColor = '#ffffff'
          ctx.shadowBlur = 6
          ctx.setLineDash([])
        } else {
          // === IDLE: category color line ===
          ctx.globalAlpha = vis * 0.5
          ctx.strokeStyle = catColor
          ctx.lineWidth = 1.2
          ctx.shadowColor = catColor
          ctx.shadowBlur = 3
          ctx.setLineDash([5, 3])
        }

        // Draw segments
        if (useElbow) {
          ctx.beginPath()
          ctx.moveTo(lineStartX, lineStartY)
          ctx.lineTo(elbowX, elbowY)
          ctx.lineTo(conn.x, conn.y)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.moveTo(lineStartX, lineStartY)
          ctx.lineTo(conn.x, conn.y)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'

        // Surface point: pulsing dot (idle) or white circle (selected/focused)
        if (isFocused) {
          ctx.globalAlpha = vis * 0.9
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.shadowColor = '#ffffff'
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.arc(sp.x, sp.y, circleR, 0, Math.PI * 2)
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'
          ctx.fillStyle = '#ffffff'
          ctx.globalAlpha = vis * 0.6
          ctx.beginPath()
          ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          const pulse = 0.3 + 0.7 * Math.abs(Math.sin(now / 600 + i * 1.2))
          ctx.globalAlpha = vis * pulse * 0.6
          ctx.fillStyle = catColor
          ctx.beginPath()
          ctx.arc(sp.x, sp.y, 2 + pulse * 1.5, 0, Math.PI * 2)
          ctx.fill()
        }

        // Card connection dot
        ctx.fillStyle = isFocused ? '#ffffff' : catColor
        if (isFocused) {
          ctx.globalAlpha = vis * 0.3
          ctx.beginPath()
          ctx.arc(conn.x, conn.y, 7, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = vis * (isFocused ? 1 : 0.7)
        ctx.beginPath()
        ctx.arc(conn.x, conn.y, isFocused ? 4 : 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      // Draw card lines + position cards (skip when cards hidden)
      // Unselected lines on bottom canvas (behind cards), selected lines on top canvas (above unselected cards)
      if (showCards) {
        cardArticles.forEach((a, i) => { if (!expandedRef.current.has(a.id)) drawCard(a, i, ctx) })
        cardArticles.forEach((a, i) => { if (expandedRef.current.has(a.id)) drawCard(a, i, ctxTop || ctx) })
      } else {
        // Hide all card DOM elements when cards are off
        cardArticles.forEach(a => {
          const el = cardRefsMap.current.get(a.id)
          if (el) { el.style.display = 'none' }
        })
        // Draw white circles on globe for selected articles
        filtered.forEach(a => {
          if (!expandedRef.current.has(a.id)) return
          const p3d = latLngTo3D(a.location.lat, a.location.lng)
          const dot = camDir.dot(p3d.clone().normalize())
          if (dot < -0.05) return
          const vis = dot < 0.2 ? (dot + 0.05) / 0.25 : 1
          const sp = projectToScreen(p3d, camera, W, H)
          const circleR = Math.max(8, globeSR * 0.035)
          ctx.globalAlpha = vis * 0.9
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.shadowColor = '#ffffff'
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.arc(sp.x, sp.y, circleR, 0, Math.PI * 2)
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'
          ctx.fillStyle = '#ffffff'
          ctx.globalAlpha = vis * 0.6
          ctx.beginPath()
          ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2)
          ctx.fill()
        })
      }

      // Draw white circle for selectedArticle (when it has no card)
      const selArt = selectedArticleRef.current
      if (selArt?.location && !expandedRef.current.has(selArt.id)) {
        const p3d = latLngTo3D(selArt.location.lat, selArt.location.lng)
        const dot2 = camDir.dot(p3d.clone().normalize())
        if (dot2 > -0.05) {
          const vis2 = dot2 < 0.2 ? (dot2 + 0.05) / 0.25 : 1
          const sp2 = projectToScreen(p3d, camera, W, H)
          const cr = Math.max(8, globeSR * 0.035)
          ctx.globalAlpha = vis2 * 0.9
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.shadowColor = '#ffffff'
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.arc(sp2.x, sp2.y, cr, 0, Math.PI * 2)
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'
          ctx.fillStyle = '#ffffff'
          ctx.globalAlpha = vis2 * 0.6
          ctx.beginPath()
          ctx.arc(sp2.x, sp2.y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Draw all saved zones — interpolated for smooth globe curvature
      for (const zone of zones) {
        if (zone.coords.length < 3) continue
        // Backface check — skip if most vertices are on the far side
        const visibleVerts = zone.coords.filter(v => {
          const p = latLngTo3D(v.lat, v.lng)
          return camDir.dot(p.clone().normalize()) > -0.05
        })
        if (visibleVerts.length === 0) continue
        const isActive = zone.id === activeZoneId
        // Only interpolate visible vertices to avoid lines wrapping through the globe
        const coordsToRender = visibleVerts.length >= 3 ? visibleVerts : zone.coords
        const interp = interpolatePolygon(coordsToRender, camera, W, H, 12)
        // Fill
        ctx.globalAlpha = isActive ? 0.1 : 0.05
        ctx.fillStyle = zone.color
        ctx.beginPath()
        ctx.moveTo(interp[0].x, interp[0].y)
        for (let i = 1; i < interp.length; i++) ctx.lineTo(interp[i].x, interp[i].y)
        ctx.closePath()
        ctx.fill()
        // Stroke with glow
        ctx.globalAlpha = isActive ? 0.7 : 0.35
        ctx.strokeStyle = zone.color
        ctx.lineWidth = isActive ? 2 : 1.5
        ctx.shadowColor = zone.color
        ctx.shadowBlur = isActive ? 8 : 4
        ctx.beginPath()
        ctx.moveTo(interp[0].x, interp[0].y)
        for (let i = 1; i < interp.length; i++) ctx.lineTo(interp[i].x, interp[i].y)
        ctx.closePath()
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        // Vertex handles — only shown in edit mode (focusMode), only visible-side vertices
        if (focusMode) {
          const verts = zone.coords.map(v => {
            const p3 = latLngTo3D(v.lat, v.lng)
            const visible = camDir.dot(p3.clone().normalize()) > -0.05
            return visible ? projectToScreen(p3, camera, W, H) : null
          }).filter(Boolean)
          for (const v of verts) {
            ctx.globalAlpha = 0.9
            ctx.fillStyle = zone.color
            ctx.beginPath()
            ctx.arc(v.x, v.y, 5, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5
            ctx.globalAlpha = 0.6
            ctx.beginPath()
            ctx.arc(v.x, v.y, 5, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
      }

      // Draw focus polygon being drawn — interpolated
      if (focusMode && focusVerts.length > 0) {
        // Only render vertices on the visible side
        const visibleFocusVerts = focusVerts.filter(v => {
          const p = latLngTo3D(v.lat, v.lng)
          return camDir.dot(p.clone().normalize()) > -0.05
        })
        const verts = visibleFocusVerts.map(v => projectToScreen(latLngTo3D(v.lat, v.lng), camera, W, H))
        if (visibleFocusVerts.length >= 3) {
          const interp = interpolatePolygon(visibleFocusVerts, camera, W, H, 12)
          ctx.globalAlpha = 0.06
          ctx.fillStyle = pendingZoneColor
          ctx.beginPath()
          ctx.moveTo(interp[0].x, interp[0].y)
          for (let i = 1; i < interp.length; i++) ctx.lineTo(interp[i].x, interp[i].y)
          ctx.closePath()
          ctx.fill()
        }
        // Edges with glow
        ctx.shadowColor = pendingZoneColor
        ctx.shadowBlur = 10
        ctx.globalAlpha = 0.8
        ctx.strokeStyle = pendingZoneColor
        ctx.lineWidth = 2
        if (visibleFocusVerts.length >= 2) {
          const interp = interpolatePolygon(visibleFocusVerts.length >= 3 ? visibleFocusVerts : [...visibleFocusVerts, visibleFocusVerts[0]], camera, W, H, 12)
          ctx.beginPath()
          ctx.moveTo(interp[0].x, interp[0].y)
          for (let i = 1; i < interp.length; i++) ctx.lineTo(interp[i].x, interp[i].y)
          if (visibleFocusVerts.length >= 3) ctx.closePath()
          ctx.stroke()
        }
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        // Vertex handles — draggable, larger
        for (const v of verts) {
          ctx.globalAlpha = 1
          ctx.fillStyle = pendingZoneColor
          ctx.beginPath()
          ctx.arc(v.x, v.y, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.globalAlpha = 0.8
          ctx.beginPath()
          ctx.arc(v.x, v.y, 6, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      ctx.restore()
      if (ctxTop) ctxTop.restore()
      frameId = requestAnimationFrame(update)
    }
    frameId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frameId)
  }, [cardArticles, filtered, dimensions, focusMode, focusVerts, zones, activeZoneId, pendingZoneColor, stackCards, stackIndex, showCards, frontCard])

  useEffect(() => { selectedArticleRef.current = selectedArticle }, [selectedArticle])

  const deselectAll = useCallback(() => {
    setExpandedCards(new Set())
    expandedRef.current = new Set()
    lockedPositions.current.clear()
    setFrontCard(null)
    setSelectedArticle(null)
    setCardSizes({})
  }, [])

  const selectCard = useCallback((article, multi = false) => {
    setExpandedCards(prev => {
      let next
      if (multi) {
        // Ctrl+click: toggle this card in/out of selection
        next = new Set(prev)
        if (next.has(article.id)) {
          next.delete(article.id)
          lockedPositions.current.delete(article.id)
        } else {
          next.add(article.id)
        }
      } else {
        if (prev.has(article.id) && prev.size === 1) {
          // Clicking the only selected card: deselect
          lockedPositions.current.delete(article.id)
          next = new Set()
        } else {
          // Single select: collapse others
          lockedPositions.current.clear()
          next = new Set([article.id])
        }
      }
      expandedRef.current = next
      return next
    })
    setFrontCard(article.id)
    setSelectedArticle(article)
    if (!multi) {
      globeRef.current?.pointOfView({ lat: article.location.lat, lng: article.location.lng, altitude: 1.8 }, 1000)
    }
  }, [])

  const handleReset = useCallback(() => {
    globeRef.current?.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1000)
    setSelectedArticle(null)
    setExpandedCards(new Set())
    expandedRef.current = new Set()
    lockedPositions.current.clear()
    setFrontCard(null)
  }, [])

  const handleAgentSubmit = useCallback(async () => {
    const cmd = agentInput.trim()
    if (!cmd) return
    setAgentMessages(prev => [...prev, { role: 'user', text: cmd }])
    setAgentInput('')
    setAgentLoading(true)
    try {
      const result = await runAgentCommand(cmd, filtered)
      for (const action of (result.actions || [])) {
        switch (action.type) {
          case 'filter_categories':
            if (action.categories?.length > 0) setActiveCategories(new Set(action.categories))
            else setActiveCategories(new Set(Object.keys(CATEGORIES)))
            break
          case 'filter_locations':
            if (action.locations?.length > 0) setCountryFilter(new Set(action.locations))
            else setCountryFilter(new Set())
            break
          case 'select_article': {
            const kw = (action.keyword || '').toLowerCase()
            const match = filtered.find(a => a.title.toLowerCase().includes(kw) || a.location?.name?.toLowerCase().includes(kw))
            if (match) {
              selectCard(match)
            }
            break
          }
          case 'zoom':
            if (action.lat != null && action.lng != null)
              globeRef.current?.pointOfView({ lat: action.lat, lng: action.lng, altitude: action.altitude || 1.5 }, 1000)
            break
          case 'summarize':
          case 'message':
            setAgentMessages(prev => [...prev, { role: 'agent', text: action.text }])
            break
        }
      }
    } catch (err) {
      setAgentMessages(prev => [...prev, { role: 'agent', text: `Error: ${err.message}` }])
    }
    setAgentLoading(false)
  }, [agentInput, filtered, selectCard])

  const handlePointClick = useCallback((point) => {
    const card = cardArticles.find(a => a.location.name === point.location?.name)
    if (card) {
      selectCard(card)
    } else {
      setSelectedArticle(point)
      setFrontCard(null)
      globeRef.current?.pointOfView({ lat: point.location.lat, lng: point.location.lng, altitude: 1.8 }, 1000)
    }
  }, [cardArticles, selectCard])

  const { borderColor: globeBorderColor } = useTheme()
  const accent = useMemo(() => getCSSVar('--accent') || '#cc7000', [theme])
  const panelBorderColor = useMemo(() => getCSSVar('--border-bright') || '#302518', [theme])
  const style = GLOBE_STYLES[globeStyle]

  useEffect(() => {
    if (!categoryDropdownOpen && !archiveDropdownOpen && !countryDropdownOpen) return
    const handleClick = (e) => {
      if (categoryDropdownOpen && categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target))
        setCategoryDropdownOpen(false)
      if (archiveDropdownOpen && archiveDropdownRef.current && !archiveDropdownRef.current.contains(e.target))
        setArchiveDropdownOpen(false)
      if (countryDropdownOpen && countryDropdownRef.current && !countryDropdownRef.current.contains(e.target))
        setCountryDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [categoryDropdownOpen, archiveDropdownOpen, countryDropdownOpen])

  // --- Popout window management ---
  const handlePopout = useCallback(() => {
    const win = window.open('/globe-popout', 'globe-popout',
      'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no')
    if (!win) return
    popoutWindowRef.current = win
    setPoppedOut(true)
  }, [])

  const handleMerge = useCallback(() => {
    if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
      popoutWindowRef.current.close()
    }
    popoutWindowRef.current = null
    setPoppedOut(false)
  }, [])

  // Detect popout window close
  useEffect(() => {
    if (!poppedOut || popout) return
    const check = setInterval(() => {
      if (popoutWindowRef.current?.closed) {
        popoutWindowRef.current = null
        setPoppedOut(false)
      }
    }, 500)
    return () => clearInterval(check)
  }, [poppedOut, popout])

  // Broadcast state to popout window
  useEffect(() => {
    if (popout || !poppedOut) return
    const ch = new BroadcastChannel('osmap-globe')
    ch.postMessage({
      globeStyle, showCards, showArcs, showBorders,
      autoRotate, rotateSpeed,
      activeCategories: [...activeCategories],
      archiveMode, archiveFrom, archiveTo,
      stackCards, stackIndex,
      zones, activeZoneId,
    })
    return () => ch.close()
  }, [popout, poppedOut, globeStyle, showCards, showArcs, showBorders,
    autoRotate, rotateSpeed, activeCategories, archiveMode, archiveFrom, archiveTo,
    stackCards, stackIndex, zones, activeZoneId])

  // Receive state in popout window
  useEffect(() => {
    if (!popout) return
    const ch = new BroadcastChannel('osmap-globe')
    ch.onmessage = (e) => {
      const s = e.data
      if (s.globeStyle !== undefined) setGlobeStyle(s.globeStyle)
      if (s.showCards !== undefined) setShowCards(s.showCards)
      if (s.showArcs !== undefined) setShowArcs(s.showArcs)
      if (s.showBorders !== undefined) setShowBorders(s.showBorders)
      if (s.autoRotate !== undefined) setAutoRotate(s.autoRotate)
      if (s.rotateSpeed !== undefined) setRotateSpeed(s.rotateSpeed)
      if (s.activeCategories) setActiveCategories(new Set(s.activeCategories))
      if (s.archiveMode !== undefined) setArchiveMode(s.archiveMode)
      if (s.archiveFrom !== undefined) setArchiveFrom(s.archiveFrom)
      if (s.archiveTo !== undefined) setArchiveTo(s.archiveTo)
      if (s.stackCards !== undefined) setStackCards(s.stackCards)
      if (s.stackIndex !== undefined) { setStackIndex(s.stackIndex); stackIndexRef.current = s.stackIndex }
      if (s.zones) setZones(s.zones)
      if (s.activeZoneId !== undefined) setActiveZoneId(s.activeZoneId)
    }
    return () => ch.close()
  }, [popout])

  const regionCounts = useMemo(() => {
    const m = {}
    for (const a of filtered) m[a.location.region] = (m[a.location.region] || 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [filtered])

  return (
    <div className={popout ? 'popout-view' : ''}>
      {!popout && (
        <div className="page-header">
          <h1>// Globe Intel</h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {loading && <span className="badge badge-warning">LOADING</span>}
            <span className="toolbar-count">{filtered.length} plotted</span>
          </div>
        </div>
      )}

      <div className={popout ? '' : 'page-layout'}>
        <div className={popout ? '' : 'page-main'}>
          {!popout && <div className="toolbar">
            <div className="toolbar-group">
              {Object.entries(GLOBE_STYLES).map(([key, s]) => (
                <button key={key} className={`btn-toolbar ${globeStyle === key ? 'active' : ''}`}
                  onClick={() => setGlobeStyle(key)}>{s.label}</button>
              ))}
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
              <span className="toolbar-sep">|</span>
              <button className={`btn-toolbar ${agentOpen ? 'active' : ''}`}
                style={{
                  ...(isAIEnabled() ? { color: '#00cc44', borderColor: '#00cc4444' } : { opacity: 0.4 }),
                  ...(agentOpen ? { background: '#00cc44', color: '#000', borderColor: '#00cc44' } : {}),
                }}
                onClick={() => setAgentOpen(!agentOpen)}>
                {isAIEnabled() ? '\u2B24 ' : ''}AGENT
              </button>
            </div>
          </div>}

          {/* Agent command bar */}
          {agentOpen && !popout && (
            <div className="agent-panel">
              <div className="agent-messages">
                {agentMessages.length === 0 && (
                  <span className="agent-hint">Ask the agent: "Show conflict in Middle East", "Summarize Ukraine", "What's happening in Africa?"</span>
                )}
                {agentMessages.map((m, i) => (
                  <div key={i} className={`agent-msg agent-msg-${m.role}`}>
                    <span className="agent-msg-label">{m.role === 'user' ? '>' : 'AGENT:'}</span>
                    <span className="agent-msg-text">{m.text}</span>
                  </div>
                ))}
                {agentLoading && <div className="agent-msg agent-msg-agent"><span className="agent-msg-label">AGENT:</span><span className="agent-msg-text" style={{ opacity: 0.5 }}>thinking...</span></div>}
              </div>
              <div className="agent-input-row">
                <input type="text" className="input-text agent-input" placeholder="Command the agent..."
                  value={agentInput}
                  onChange={e => setAgentInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAgentSubmit() }}
                  disabled={agentLoading} />
                <button className="btn-accent" onClick={handleAgentSubmit} disabled={agentLoading || !agentInput.trim()}
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.6rem' }}>SEND</button>
                <button className="btn-small" onClick={() => setAgentMessages([])} title="Clear history">CLR</button>
              </div>
            </div>
          )}

          {!popout && <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <div className="toolbar-group" style={{ flexWrap: 'wrap' }}>
              <button className={`btn-toolbar ${autoRotate ? 'active' : ''}`}
                onClick={() => setAutoRotate(!autoRotate)}>ROTATE</button>
              <span className="toolbar-count">SPD</span>
              <input type="range" className="slider" min="0" max="30" step="1"
                value={rotateSpeed * 10}
                onChange={e => setRotateSpeed(Number(e.target.value) / 10)}
                style={{ width: '50px', margin: '0 2px' }} />
              <span className="toolbar-count" style={{ minWidth: '18px' }}>{rotateSpeed.toFixed(1)}</span>
              <span className="toolbar-sep">|</span>
              <label className="toolbar-switch" onClick={() => setShowCards(!showCards)}>
                <span className="toolbar-count" style={{ fontWeight: 600 }}>CARDS</span>
                <span className={`switch-track ${showCards ? 'switch-on' : ''}`}>
                  <span className="switch-thumb" />
                </span>
              </label>
              <button className={`btn-toolbar ${showArcs ? 'active' : ''}`}
                onClick={() => setShowArcs(!showArcs)}>ARCS</button>
              <button className={`btn-toolbar ${showBorders ? 'active' : ''}`}
                onClick={() => setShowBorders(!showBorders)}>BORDERS</button>
              <button className={`btn-toolbar ${focusMode ? 'active' : ''}`}
                onClick={() => {
                  if (focusMode) { setFocusMode(false); setFocusVerts([]) }
                  else { setFocusMode(true); setFocusVerts([]); setPendingZoneName(''); setPendingZoneColor('#cc7000') }
                }}>ZONES</button>
              {focusMode && <>
                <input type="text" className="input-text" placeholder="name..."
                  value={pendingZoneName} onChange={e => setPendingZoneName(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '70px', padding: '2px 5px', fontSize: '0.6rem', height: '20px' }} />
                <input type="color" className="color-picker" value={pendingZoneColor}
                  onChange={e => setPendingZoneColor(e.target.value)}
                  style={{ width: '20px', height: '18px' }} />
                <span className="toolbar-count">{focusVerts.length} pts</span>
                {focusVerts.length > 0 && (
                  <button className="btn-toolbar" onClick={() => setFocusVerts(prev => prev.slice(0, -1))}>UNDO</button>
                )}
                {focusVerts.length >= 3 && (
                  <button className="btn-toolbar" style={{ color: '#00ff88', borderColor: '#00ff8844' }}
                    onClick={() => {
                      const id = zoneIdCounter.current++
                      setZones(prev => [...prev, {
                        id,
                        name: pendingZoneName || `Zone ${id}`,
                        color: pendingZoneColor,
                        coords: [...focusVerts],
                      }])
                      setFocusMode(false)
                      setFocusVerts([])
                    }}>SAVE</button>
                )}
              </>}
              {activeZoneId && !focusMode && (
                <button className="btn-toolbar" style={{ color: '#ff6644', borderColor: '#ff664444' }}
                  onClick={() => setActiveZoneId(null)}>UNFOCUS</button>
              )}
              <span className="toolbar-sep">|</span>
              <button className={`btn-toolbar ${stackCards ? 'active' : ''}`}
                onClick={() => { setStackCards(!stackCards); setStackIndex(0); stackIndexRef.current = 0 }}>STACK</button>
              <span className="toolbar-sep">|</span>
              <div className="cat-dropdown-wrap" ref={categoryDropdownRef}>
                <button className={`btn-toolbar ${activeCategories.size === allCatIds.length ? 'active' : ''}`}
                  onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}>
                  CATEGORIES{activeCategories.size < allCatIds.length ? ` (${activeCategories.size})` : ''}
                  <span style={{ marginLeft: 4, fontSize: '0.45rem' }}>{categoryDropdownOpen ? '\u25B2' : '\u25BC'}</span>
                </button>
                {categoryDropdownOpen && (
                  <div className="cat-dropdown">
                    {Object.entries(CATEGORIES).map(([id, cat]) => (
                      <div key={id} className="cat-dropdown-item" onClick={() => {
                        setActiveCategories(prev => {
                          const next = new Set(prev)
                          if (next.has(id)) next.delete(id)
                          else next.add(id)
                          return next
                        })
                      }}>
                        <input type="checkbox" readOnly checked={activeCategories.has(id)} tabIndex={-1} />
                        <span className="cat-dropdown-dot" style={{ backgroundColor: CATEGORY_COLORS[id] }} />
                        <span>{cat.label}</span>
                      </div>
                    ))}
                    <div className="cat-dropdown-divider" />
                    <div className="cat-dropdown-actions">
                      <button className="cat-dropdown-btn" onClick={() => setActiveCategories(new Set(allCatIds))}>SELECT ALL</button>
                      <button className="cat-dropdown-btn" onClick={() => setActiveCategories(new Set())}>RESET</button>
                    </div>
                  </div>
                )}
              </div>
              <span className="toolbar-sep">|</span>
              <div className="cat-dropdown-wrap" ref={archiveDropdownRef}>
                <button className={`btn-toolbar ${archiveMode !== 'all' ? 'active' : ''}`}
                  onClick={() => setArchiveDropdownOpen(!archiveDropdownOpen)}>
                  ARCHIVE{archiveMode !== 'all' ? ` (${archiveMode === 'custom' ? 'CUSTOM' : archiveMode.toUpperCase()})` : ''}
                  <span style={{ marginLeft: 4, fontSize: '0.45rem' }}>{archiveDropdownOpen ? '\u25B2' : '\u25BC'}</span>
                </button>
                {archiveDropdownOpen && (
                  <div className="cat-dropdown">
                    {[
                      { key: 'all', label: 'ALL TIME' },
                      { key: '24h', label: 'LAST 24H' },
                      { key: '48h', label: 'LAST 48H' },
                      { key: '7d', label: 'LAST 7 DAYS' },
                      { key: '30d', label: 'LAST 30 DAYS' },
                    ].map(opt => (
                      <div key={opt.key}
                        className={`cat-dropdown-item ${archiveMode === opt.key ? 'cat-dropdown-item-active' : ''}`}
                        onClick={() => { setArchiveMode(opt.key); setArchiveDropdownOpen(false) }}>
                        <span>{opt.label}</span>
                      </div>
                    ))}
                    <div className="cat-dropdown-divider" />
                    <div className="archive-custom-range">
                      <span className="archive-range-label">CUSTOM RANGE</span>
                      <div className="archive-date-row">
                        <label className="archive-date-field">
                          <span>FROM</span>
                          <input type="date" className="archive-date-input" value={archiveFrom}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { setArchiveFrom(e.target.value); setArchiveMode('custom') }} />
                        </label>
                        <label className="archive-date-field">
                          <span>TO</span>
                          <input type="date" className="archive-date-input" value={archiveTo}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { setArchiveTo(e.target.value); setArchiveMode('custom') }} />
                        </label>
                      </div>
                      {archiveMode === 'custom' && (archiveFrom || archiveTo) && (
                        <button className="cat-dropdown-btn" style={{ marginTop: 4 }}
                          onClick={() => { setArchiveFrom(''); setArchiveTo(''); setArchiveMode('all') }}>CLEAR DATES</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <span className="toolbar-sep">|</span>
              <div className="cat-dropdown-wrap" ref={countryDropdownRef}>
                <button className={`btn-toolbar ${countryFilter.size > 0 ? 'active' : ''}`}
                  onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}>
                  LOCATIONS{countryFilter.size > 0 ? ` (${countryFilter.size})` : ''}
                  <span style={{ marginLeft: 4, fontSize: '0.45rem' }}>{countryDropdownOpen ? '\u25B2' : '\u25BC'}</span>
                </button>
                {countryDropdownOpen && (
                  <div className="cat-dropdown" style={{ minWidth: '180px', maxHeight: '280px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '4px 8px' }}>
                      <input type="text" className="input-text" placeholder="Search..."
                        value={countrySearch} onChange={e => setCountrySearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', fontSize: '0.6rem', padding: '3px 6px', height: '22px' }} />
                    </div>
                    <div className="cat-dropdown-divider" />
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {availableLocations
                        .filter(([name]) => !countrySearch || name.toLowerCase().includes(countrySearch.toLowerCase()))
                        .map(([name, count]) => (
                        <div key={name} className={`cat-dropdown-item ${countryFilter.has(name) ? 'cat-dropdown-item-active' : ''}`}
                          onClick={() => {
                            setCountryFilter(prev => {
                              const next = new Set(prev)
                              if (next.has(name)) next.delete(name)
                              else next.add(name)
                              return next
                            })
                          }}>
                          <input type="checkbox" readOnly checked={countryFilter.has(name)} tabIndex={-1} />
                          <span>{name}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.5rem', color: 'var(--text-muted)' }}>{count}</span>
                        </div>
                      ))}
                    </div>
                    <div className="cat-dropdown-divider" />
                    <div className="cat-dropdown-actions">
                      <button className="cat-dropdown-btn" onClick={() => setCountryFilter(new Set(availableLocations.map(([n]) => n)))}>SELECT ALL</button>
                      <button className="cat-dropdown-btn" onClick={() => setCountryFilter(new Set())}>RESET</button>
                    </div>
                  </div>
                )}
              </div>
              <span className="toolbar-sep">|</span>
              <button className="btn-toolbar" onClick={handleReset}>RESET VIEW</button>
            </div>
          </div>}

          {poppedOut && !popout && (
            <div className="popout-placeholder">
              <div className="popout-placeholder-inner">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent)', opacity: 0.5 }}>
                  <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
                <span className="popout-placeholder-text">Globe displayed in external window</span>
                <button className="btn-toolbar" style={{ color: '#00ff88', borderColor: '#00ff8844', padding: '0.4rem 1rem' }} onClick={handleMerge}>MERGE BACK</button>
              </div>
            </div>
          )}
          <div className="panel" style={{ overflow: 'hidden', ...(poppedOut && !popout ? { display: 'none' } : {}) }}>
            <div ref={containerRef}
              onMouseDown={(e) => {
                mouseDownPos.current = { x: e.clientX, y: e.clientY }
                // Check if clicking on a zone vertex for dragging
                if (focusMode || zones.length > 0) {
                  const rect = containerRef.current.getBoundingClientRect()
                  const mx = e.clientX - rect.left, my = e.clientY - rect.top
                  const g = globeRef.current
                  if (g) {
                    const cam = g.camera()
                    // Check pending polygon vertices
                    if (focusMode && focusVerts.length > 0) {
                      for (let vi = 0; vi < focusVerts.length; vi++) {
                        const vsp = projectToScreen(latLngTo3D(focusVerts[vi].lat, focusVerts[vi].lng), cam, rect.width, rect.height)
                        if (Math.sqrt((mx - vsp.x) ** 2 + (my - vsp.y) ** 2) < 10) {
                          draggingVert.current = { type: 'pending', vertIdx: vi }
                          e.preventDefault()
                          return
                        }
                      }
                    }
                    // Check saved zone vertices — only when in focus/edit mode
                    if (focusMode) {
                      for (const zone of zones) {
                        for (let vi = 0; vi < zone.coords.length; vi++) {
                          const vsp = projectToScreen(latLngTo3D(zone.coords[vi].lat, zone.coords[vi].lng), cam, rect.width, rect.height)
                          if (Math.sqrt((mx - vsp.x) ** 2 + (my - vsp.y) ** 2) < 10) {
                            draggingVert.current = { type: 'zone', zoneId: zone.id, vertIdx: vi }
                            e.preventDefault()
                            return
                          }
                        }
                      }
                    }
                  }
                }
              }}
              onMouseMove={(e) => {
                if (!draggingVert.current) return
                const rect = containerRef.current.getBoundingClientRect()
                const mx = e.clientX - rect.left, my = e.clientY - rect.top
                const g = globeRef.current
                if (!g) return
                const ll = screenToLatLng(mx, my, g.camera(), rect.width, rect.height)
                if (!ll) return
                const dv = draggingVert.current
                if (dv.type === 'pending') {
                  setFocusVerts(prev => prev.map((v, i) => i === dv.vertIdx ? ll : v))
                } else if (dv.type === 'zone') {
                  setZones(prev => prev.map(z => z.id === dv.zoneId
                    ? { ...z, coords: z.coords.map((c, i) => i === dv.vertIdx ? ll : c) }
                    : z
                  ))
                }
              }}
              onMouseUp={(e) => {
                if (draggingVert.current) {
                  draggingVert.current = null
                  mouseDownPos.current = null
                  return
                }
                const md = mouseDownPos.current
                if (!md) return
                const moved = Math.abs(e.clientX - md.x) + Math.abs(e.clientY - md.y)
                mouseDownPos.current = null
                if (moved >= 5 || e.target.closest('.overlay-card')) return

                const rect = containerRef.current.getBoundingClientRect()
                const mx = e.clientX - rect.left, my = e.clientY - rect.top

                // Focus draw mode: add geographic vertex via raycasting
                if (focusMode) {
                  const g = globeRef.current
                  if (!g) return
                  const ll = screenToLatLng(mx, my, g.camera(), rect.width, rect.height)
                  if (!ll) return // clicked off the globe
                  // Close polygon if clicking near first vertex
                  if (focusVerts.length >= 3) {
                    const firstSp = projectToScreen(latLngTo3D(focusVerts[0].lat, focusVerts[0].lng), g.camera(), rect.width, rect.height)
                    if (Math.sqrt((mx - firstSp.x) ** 2 + (my - firstSp.y) ** 2) < 15) return
                  }
                  setFocusVerts(prev => [...prev, ll])
                  return
                }

                // Point click detection
                let best = null, bestD = 196
                for (const p of projectedPoints.current) {
                  const dd = (p.x - mx) ** 2 + (p.y - my) ** 2
                  if (dd < bestD) { bestD = dd; best = p }
                }
                if (best) {
                  const multi = e.ctrlKey || e.metaKey
                  const card = cardArticles.find(c => c.location.name === best.article.location?.name)
                  if (card) {
                    // If this card is part of a multi-article cluster, just focus it (don't expand/pop out)
                    const cl = clusters.get(card.id)
                    if (cl && cl.count > 1 && !multi) {
                      setSelectedArticle(card)
                      setFrontCard(card.id)
                      globeRef.current?.pointOfView({ lat: card.location.lat, lng: card.location.lng, altitude: 1.8 }, 1000)
                    } else {
                      selectCard(card, multi)
                    }
                  } else {
                    setSelectedArticle(best.article)
                  }
                } else {
                  deselectAll()
                }
              }}
              style={{ height: popout ? 'calc(100vh - 10px)' : 'calc(100vh - 290px)', minHeight: '400px', background: style.bgColor || '#000', position: 'relative' }}>
              <Globe
                ref={globeRef}
                width={dimensions.width}
                height={dimensions.height}
                globeImageUrl={style.globeImage || undefined}
                backgroundImageUrl={style.bgImage || undefined}
                backgroundColor={style.bgColor || 'rgba(0,0,0,0)'}
                bumpImageUrl={style.bumpImage || undefined}
                showAtmosphere={true}
                atmosphereColor={globeBorderColor}
                atmosphereAltitude={0.18}
                polygonsData={(showBorders || globeStyle === 'outline') ? countries : []}
                polygonAltitude={0.005}
                polygonCapColor={() => globeStyle === 'outline' ? 'rgba(10,15,30,0.6)' : 'rgba(0,0,0,0)'}
                polygonSideColor={() => 'rgba(0,0,0,0)'}
                polygonStrokeColor={() => showBorders ? globeBorderColor + '66' : 'rgba(0,0,0,0)'}
                polygonLabel={() => ''}
                arcsData={arcs}
                arcColor={() => [accent, accent]}
                arcDashLength={0.4}
                arcDashGap={0.2}
                arcDashAnimateTime={2000}
                arcStroke={0.4}
                arcAltitudeAutoScale={0.3}
              />

              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
                  onWheel={stackCards && showCards ? (e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    setStackIndex(prev => {
                      const next = e.deltaY > 0 ? prev + 1 : prev - 1
                      const clamped = Math.max(0, Math.min(cardArticles.length - 1, next))
                      stackIndexRef.current = clamped
                      return clamped
                    })
                  } : undefined}>
                  <canvas ref={canvasRef}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
                  />
                  <canvas ref={canvasTopRef}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }}
                  />
                  {stackCards && cardArticles.length > 1 && (
                    <div className="stack-indicator">
                      <span className="stack-indicator-text">{stackIndex + 1} / {cardArticles.length}</span>
                      <div className="stack-indicator-dots">
                        {cardArticles.map((a, i) => (
                          <span key={a.id} className={`stack-dot ${i === stackIndex ? 'stack-dot-active' : ''} ${expandedCards.has(a.id) ? 'stack-dot-selected' : ''}`}
                            style={{ backgroundColor: i === stackIndex ? (CATEGORY_COLORS[a.category.id] || '#666') : undefined }}
                            onClick={(e) => { e.stopPropagation(); setStackIndex(i); stackIndexRef.current = i }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {cardArticles.map(a => {
                    const catColor = CATEGORY_COLORS[a.category.id] || '#666'
                    const isSelected = expandedCards.has(a.id)
                    const isExpanded = isSelected && !stackCards // in stack mode, selected cards don't expand
                    const stackOffset = stackCards ? cardArticles.indexOf(a) - stackIndex : -1
                    const showSelectedStyle = isSelected && (!stackCards || stackOffset === 0)
                    const isFront = frontCard === a.id
                    return (
                      <div key={a.id}
                        ref={el => { if (el) cardRefsMap.current.set(a.id, el); else cardRefsMap.current.delete(a.id) }}
                        className={`overlay-card ${isFront ? 'overlay-card-front' : ''} ${showSelectedStyle ? 'overlay-card-selected' : ''}`}
                        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'auto',
                          zIndex: isExpanded ? (isFront ? 150 : 120) : 10,
                          cursor: 'grab',
                          transition: stackCards ? 'left 0.3s ease, top 0.3s ease, opacity 0.3s ease' : undefined }}
                        onMouseDown={(e) => {
                          if (e.target.closest('.oc-resize-handle') || e.target.closest('.oc-link') || e.target.closest('.oc-body')) return
                          e.stopPropagation()
                          e.preventDefault()
                          setFrontCard(a.id)
                          const el = cardRefsMap.current.get(a.id)
                          if (!el) return
                          const startX = e.clientX, startY = e.clientY
                          const cl = clusters.get(a.id)
                          const isMulti = cl && cl.count > 1
                          const lockKey = isMulti && !expandedCards.has(a.id) ? `cluster-${cl.repId}` : a.id
                          const pos = lockedPositions.current.get(lockKey) || lastPositions.current.get(a.id) || { x: el.offsetLeft, y: el.offsetTop }
                          el.style.cursor = 'grabbing'
                          cardDragged.current = false
                          const onMove = (ev) => {
                            cardDragged.current = true
                            const nx = pos.x + (ev.clientX - startX)
                            const ny = pos.y + (ev.clientY - startY)
                            lockedPositions.current.set(lockKey, { x: nx, y: ny })
                            lastPositions.current.set(a.id, { x: nx, y: ny })
                            el.style.left = nx + 'px'
                            el.style.top = ny + 'px'
                          }
                          const onUp = () => {
                            el.style.cursor = 'grab'
                            window.removeEventListener('mousemove', onMove)
                            window.removeEventListener('mouseup', onUp)
                          }
                          window.addEventListener('mousemove', onMove)
                          window.addEventListener('mouseup', onUp)
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (cardDragged.current) { cardDragged.current = false; return }
                          if (e.target.closest('.oc-link') || e.target.closest('.oc-resize-handle')) return
                          selectCard(a, e.ctrlKey || e.metaKey)
                        }}
                        onMouseEnter={() => {
                          const g = globeRef.current
                          if (g) g.controls().enableZoom = false
                        }}
                        onMouseLeave={() => {
                          const g = globeRef.current
                          if (g) g.controls().enableZoom = true
                        }}
                        onWheel={clusters.get(a.id)?.count > 1 ? (e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          const cl = clusters.get(a.id)
                          if (!cl) return
                          const repId = cl.repId
                          const cur = clusterScrollRef.current[repId] || 0
                          const next = Math.max(0, Math.min(cl.count - 1, e.deltaY > 0 ? cur + 1 : cur - 1))
                          setClusterScrollMap(prev => ({ ...prev, [repId]: next }))
                        } : undefined}>
                        <div className="oc-border" style={{
                          '--card-accent': catColor,
                          ...(isExpanded && cardSizes[a.id] ? {
                            width: cardSizes[a.id].w + 'px',
                            height: cardSizes[a.id].h + 'px',
                          } : {}),
                        }}>
                          <div className={`oc-inner ${isExpanded ? 'expanded' : ''} ${isExpanded && cardSizes[a.id] ? 'resized' : ''}`}
                            style={{
                              ...(stackCards ? { maxWidth: '185px', background: 'rgb(2, 2, 6)' } : {}),
                              ...(isExpanded && cardSizes[a.id] ? {
                                maxWidth: 'none', width: '100%', height: '100%',
                                display: 'flex', flexDirection: 'column',
                              } : {}),
                            }}>
                            <div className="oc-header">
                              <span className="oc-source" style={{ color: catColor }}>{a.sourceName}</span>
                              <div className="oc-header-right">
                                <span className="oc-time">{a.timeAgo}</span>
                                {!stackCards && <span className="oc-expand-indicator">{isExpanded ? '−' : '+'}</span>}
                              </div>
                            </div>
                            <div className="oc-title">{isExpanded ? a.title : truncate(a.title, 50)}</div>
                            <div className="oc-loc">
                              <span className="oc-dot" style={{ background: catColor, boxShadow: `0 0 4px ${catColor}` }}></span>
                              {a.location.name}
                              {(() => {
                                const cl = clusters.get(a.id)
                                if (!cl || cl.count <= 1) return null
                                const idx = cl.articles.indexOf(a)
                                const activeIdx = clusterScrollMap[cl.repId] || 0
                                if (idx !== activeIdx) return null
                                return <span className="oc-stack-counter">{activeIdx + 1}/{cl.count}</span>
                              })()}
                            </div>
                            {isExpanded && (
                              <div className="oc-body" style={{
                                flex: 1, minHeight: 0,
                                maxHeight: cardSizes[a.id] ? 'none' : undefined,
                              }}>
                                {a.image && <img className="oc-img" src={a.image} alt="" onError={e => e.target.style.display = 'none'} />}
                                <div className="oc-desc">{a.description || 'No description available.'}</div>
                                <div className="oc-meta">
                                  <span className="oc-cat" style={{ borderColor: catColor + '55', color: catColor }}>{a.category.label}</span>
                                  <span className="oc-region">{a.location.region}</span>
                                </div>
                                {a.link && <a className="oc-link" href={a.link} target="_blank" rel="noopener noreferrer">SOURCE</a>}
                              </div>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="oc-resize-handle"
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                const border = e.target.closest('.oc-border')
                                resizingRef.current = {
                                  id: a.id,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  startW: border.offsetWidth,
                                  startH: border.offsetHeight,
                                }
                                const onMove = (ev) => {
                                  const r = resizingRef.current
                                  if (!r) return
                                  setCardSizes(prev => ({
                                    ...prev,
                                    [r.id]: {
                                      w: Math.max(180, r.startW + (ev.clientX - r.startX)),
                                      h: Math.max(100, r.startH + (ev.clientY - r.startY)),
                                    }
                                  }))
                                }
                                const onUp = () => {
                                  resizingRef.current = null
                                  window.removeEventListener('mousemove', onMove)
                                  window.removeEventListener('mouseup', onUp)
                                }
                                window.addEventListener('mousemove', onMove)
                                window.addEventListener('mouseup', onUp)
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
            </div>
          </div>
        </div>

        {!popout && <div className="page-sidebar-right">
          {/* Coverage */}
          <div className="panel">
            <div className="panel-header" style={{ cursor: 'pointer' }}
              onClick={() => setCollapsedPanels(p => ({ ...p, coverage: !p.coverage }))}>
              <span className="panel-title">// COVERAGE</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{collapsedPanels.coverage ? '+' : '−'}</span>
            </div>
            {!collapsedPanels.coverage && (
              <div className="panel-body">
                <div className="result-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="result-card active"><span className="result-label">Articles</span><span className="result-value">{filtered.length}</span></div>
                  <div className="result-card"><span className="result-label">Cards</span><span className="result-value">{cardArticles.length}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Zones */}
          {zones.length > 0 && (
            <div className="panel">
              <div className="panel-header" style={{ cursor: 'pointer' }}
                onClick={() => setCollapsedPanels(p => ({ ...p, zones: !p.zones }))}>
                <span className="panel-title">// ZONES</span>
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                  <span className="toolbar-count">{zones.length}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{collapsedPanels.zones ? '+' : '−'}</span>
                </div>
              </div>
              {!collapsedPanels.zones && (
                <div>
                  {zones.map(z => (
                    <div key={z.id} className="list-item">
                      <div className={`list-item-header ${activeZoneId === z.id ? 'selected' : ''}`}
                        style={{ gap: '0.4rem' }}>
                        <div className="list-item-left" style={{ flex: 1, gap: '0.4rem' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '2px', flexShrink: 0, backgroundColor: z.color }}></span>
                          <input type="text" className="input-text" value={z.name}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setZones(prev => prev.map(p => p.id === z.id ? { ...p, name: e.target.value } : p))}
                            style={{ fontSize: '0.6rem', padding: '1px 4px', height: '18px', border: 'none', background: 'transparent', color: 'var(--text-primary)' }} />
                        </div>
                        <div className="list-item-right" style={{ gap: '0.2rem' }}>
                          <input type="color" value={z.color}
                            onChange={e => setZones(prev => prev.map(p => p.id === z.id ? { ...p, color: e.target.value } : p))}
                            style={{ width: '16px', height: '14px', border: '1px solid #333', padding: 0, cursor: 'pointer', background: 'transparent' }} />
                          <button className="btn-small"
                            style={activeZoneId === z.id ? { color: '#00ff88', borderColor: '#00ff8844' } : {}}
                            onClick={() => setActiveZoneId(activeZoneId === z.id ? null : z.id)}>
                            {activeZoneId === z.id ? 'ON' : 'FOCUS'}
                          </button>
                          <button className="btn-small"
                            style={focusMode ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
                            onClick={() => {
                              // Toggle edit mode — entering focusMode enables vertex dragging
                              if (focusMode) { setFocusMode(false); setFocusVerts([]) }
                              else { setFocusMode(true); setFocusVerts([]) }
                            }}>EDIT</button>
                          <button className="btn-small" style={{ color: 'var(--danger)' }}
                            onClick={() => {
                              setZones(prev => prev.filter(p => p.id !== z.id))
                              if (activeZoneId === z.id) setActiveZoneId(null)
                            }}>x</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Regions */}
          <div className="panel">
            <div className="panel-header" style={{ cursor: 'pointer' }}
              onClick={() => setCollapsedPanels(p => ({ ...p, regions: !p.regions }))}>
              <span className="panel-title">// REGIONS</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{collapsedPanels.regions ? '+' : '−'}</span>
            </div>
            {!collapsedPanels.regions && (
              <div className="panel-body">
                {regionCounts.map(([region, count]) => (
                  <div key={region} className="info-row"><span className="info-label">{region}</span><span className="info-value">{count}</span></div>
                ))}
              </div>
            )}
          </div>

          {/* Articles list */}
          <div className="panel">
            <div className="panel-header" style={{ cursor: 'pointer' }}
              onClick={() => setCollapsedPanels(p => ({ ...p, articles: !p.articles }))}>
              <span className="panel-title">// ARTICLES</span>
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <span className="toolbar-count">{filtered.length}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{collapsedPanels.articles ? '+' : '−'}</span>
              </div>
            </div>
            {!collapsedPanels.articles && (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {filtered.slice(0, 40).map(a => {
                  const isSelected = expandedCards.has(a.id) || selectedArticle?.id === a.id
                  return (
                    <div key={a.id} className="list-item">
                      <div className={`list-item-header ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => {
                          const multi = e.ctrlKey || e.metaKey
                          const card = cardArticles.find(c => c.location.name === a.location?.name)
                          if (card) selectCard(card, multi)
                          else {
                            setSelectedArticle(a)
                            globeRef.current?.pointOfView({ lat: a.location.lat, lng: a.location.lng, altitude: 1.8 }, 1000)
                          }
                        }}>
                        <div className="list-item-left" style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, backgroundColor: CATEGORY_COLORS[a.category.id] || '#666' }}></span>
                          <span style={{ fontSize: '0.6rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                        </div>
                        <div className="list-item-right" style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: '0.5rem', color: 'var(--accent)' }}>{a.location?.name}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Details */}
          {selectedArticle && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">// DETAILS</span>
                <button className="btn-close" onClick={() => setSelectedArticle(null)}>x</button>
              </div>
              <div className="panel-body" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {selectedArticle.image && <img src={selectedArticle.image} alt="" style={{ width: '100%', maxHeight: '90px', objectFit: 'cover', borderRadius: '2px', marginBottom: '0.5rem', border: '1px solid var(--border)' }} onError={e => e.target.style.display = 'none'} />}
                <p style={{ fontSize: '0.73rem', fontWeight: 600, marginBottom: '0.5rem', lineHeight: 1.5 }}>{selectedArticle.title}</p>
                <div className="info-row"><span className="info-label">Source</span><span className="info-value">{selectedArticle.sourceName}</span></div>
                <div className="info-row"><span className="info-label">Category</span><span className={`badge ${selectedArticle.category.badge}`} style={{ fontSize: '0.5rem', padding: '0.1rem 0.3rem' }}>{selectedArticle.category.label}</span></div>
                <div className="info-row"><span className="info-label">Location</span><span className="info-value">{selectedArticle.location?.name}</span></div>
                <div className="info-row"><span className="info-label">Region</span><span className="info-value">{selectedArticle.location?.region}</span></div>
                <div className="info-row"><span className="info-label">Time</span><span className="info-value">{selectedArticle.timeAgo}</span></div>
                {selectedArticle.link && <a href={selectedArticle.link} target="_blank" rel="noopener noreferrer" className="btn-accent" style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem' }}>Open Source Article</a>}
              </div>
            </div>
          )}
        </div>}
      </div>
    </div>
  )
}
