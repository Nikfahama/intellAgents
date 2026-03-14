import { NEWS_SOURCES, CATEGORIES } from './sources'
import { extractLocation } from './gazetteer'

const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
]

const RSS2JSON_API = (url) =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`

function stripHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

// Extract first image URL from an RSS item element
function extractImageFromXml(item) {
  // media:content or media:thumbnail (namespace-aware)
  for (const tag of ['content', 'thumbnail']) {
    const el = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', tag)[0]
      || item.querySelector(tag + '[url]')
    if (el) {
      const url = el.getAttribute('url')
      if (url) return url
    }
  }
  // <enclosure type="image/...">
  const enc = item.querySelector('enclosure')
  if (enc) {
    const type = enc.getAttribute('type') || ''
    if (type.startsWith('image')) return enc.getAttribute('url')
    // some feeds don't set type — check if URL looks like an image
    const url = enc.getAttribute('url') || ''
    if (/\.(jpg|jpeg|png|webp|gif)/i.test(url)) return url
  }
  // <img> inside description/content HTML
  const descRaw = item.querySelector('description')?.textContent
    || item.querySelector('content\\:encoded')?.textContent || ''
  const imgMatch = descRaw.match(/<img[^>]+src=["']([^"']+)["']/)
  if (imgMatch) return imgMatch[1]
  return null
}

// Extract image from rss2json response item
function extractImageFromJson(item) {
  if (item.thumbnail) return item.thumbnail
  if (item.enclosure?.link) {
    const type = item.enclosure.type || ''
    if (type.startsWith('image') || /\.(jpg|jpeg|png|webp|gif)/i.test(item.enclosure.link)) {
      return item.enclosure.link
    }
  }
  // img in description
  const desc = item.description || item.content || ''
  const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/)
  if (imgMatch) return imgMatch[1]
  return null
}

function parseRSSXml(xml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  let items = [...doc.querySelectorAll('item')]
  if (items.length === 0) items = [...doc.querySelectorAll('entry')]
  return items.map(item => {
    const get = (tag) => item.querySelector(tag)?.textContent?.trim() || ''
    let link = get('link')
    if (!link) {
      const linkEl = item.querySelector('link')
      if (linkEl) link = linkEl.getAttribute('href') || ''
    }
    return {
      title: get('title'),
      description: stripHtml(get('description') || get('summary') || get('content')),
      link,
      pubDate: get('pubDate') || get('published') || get('updated') || '',
      image: extractImageFromXml(item),
    }
  })
}

async function fetchViaRss2Json(source) {
  try {
    const res = await fetch(RSS2JSON_API(source.url), {
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'ok' || !data.items) return null
    return data.items.map(item => ({
      title: item.title || '',
      description: stripHtml(item.description || item.content || ''),
      link: item.link || '',
      pubDate: item.pubDate || '',
      image: extractImageFromJson(item),
      sourceId: source.id,
      sourceName: source.name,
      sourceColor: source.color,
    }))
  } catch {
    return null
  }
}

async function fetchViaProxy(source) {
  for (const proxyFn of CORS_PROXIES) {
    try {
      const res = await fetch(proxyFn(source.url), {
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) continue
      const text = await res.text()
      if (!text || text.length < 100) continue
      const items = parseRSSXml(text)
      if (items.length === 0) continue
      return items.map(item => ({
        ...item,
        sourceId: source.id,
        sourceName: source.name,
        sourceColor: source.color,
      }))
    } catch {}
  }
  return null
}

async function fetchFeed(source) {
  const r2j = await fetchViaRss2Json(source)
  if (r2j && r2j.length > 0) return r2j
  const proxy = await fetchViaProxy(source)
  if (proxy && proxy.length > 0) return proxy
  console.warn(`[OSmap] Failed to fetch feed: ${source.name} (${source.url})`)
  return []
}

function categorize(title, description) {
  const text = `${title} ${description}`.toLowerCase()
  const matched = []
  for (const [id, cat] of Object.entries(CATEGORIES)) {
    for (const kw of cat.keywords) {
      if (text.includes(kw.toLowerCase())) {
        matched.push(id)
        break
      }
    }
  }
  if (matched.length === 0) {
    return { id: 'general', label: 'GENERAL', badge: 'badge-muted', allCategories: ['general'] }
  }
  const primaryId = matched[0]
  const primary = CATEGORIES[primaryId]
  return { id: primaryId, ...primary, allCategories: matched }
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    const diff = Date.now() - date.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  } catch { return '' }
}

export async function fetchAllFeeds(enabledSourceIds = null, allSources = null) {
  const pool = allSources || NEWS_SOURCES
  const sources = enabledSourceIds
    ? pool.filter(s => enabledSourceIds.includes(s.id))
    : pool

  const results = await Promise.allSettled(sources.map(s => fetchFeed(s)))
  const articles = []

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const item of result.value) {
      const location = extractLocation(`${item.title} ${item.description}`)
      const category = categorize(item.title, item.description)
      articles.push({
        id: `${item.sourceId}-${articles.length}`,
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: item.pubDate,
        timeAgo: timeAgo(item.pubDate),
        image: item.image || null,
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        sourceColor: item.sourceColor,
        location,
        category,
      })
    }
  }

  articles.sort((a, b) => {
    try { return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime() }
    catch { return 0 }
  })

  return articles
}
