import { CATEGORIES } from './sources'

const API_URL = 'https://api.openai.com/v1/chat/completions'

function getApiKey() {
  return import.meta.env.VITE_OPENAI_API_KEY || ''
}

export function isAIEnabled() {
  const key = getApiKey()
  return key && key !== 'sk-your-key-here' && key.length > 10
}

async function callGPT(messages, options = {}) {
  const key = getApiKey()
  if (!key) throw new Error('No API key configured')

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4o-mini',
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens || 2000,
      response_format: options.json ? { type: 'json_object' } : undefined,
    }),
    signal: options.signal || AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return data.choices[0]?.message?.content || ''
}

const VALID_CATEGORIES = Object.keys(CATEGORIES)

const BATCH_SYSTEM_PROMPT = `You are a geopolitical news intelligence analyst creating map markers for a real-time OSINT dashboard. For each article, you MUST:

1. READ the full title and description carefully before responding.
2. DISAMBIGUATE location names using context:
   - "Georgia" in a political/military context with Russia, Tbilisi, or Caucasus → Georgia the COUNTRY (41.7, 44.8)
   - "Georgia" with Atlanta, US politics, or American context → Georgia the US STATE (32.16, -82.9)
   - "Turkey" as a country → Ankara (39.9, 32.9), not the bird
   - "Jordan" with Middle East context → Jordan the country, not a person named Jordan
   - Always use surrounding context clues (other place names, leaders, organizations) to resolve ambiguity.

3. For each article return:
   - "summary": 1-2 sentence factual summary. No opinions. Lead with WHAT happened WHERE.
   - "categories": array of ALL applicable category IDs. Valid: ${VALID_CATEGORIES.join(', ')}, general.
     Examples of multi-category:
     • Athlete defecting due to war → ["conflict", "humanitarian"]
     • Cyberattack on banks → ["security", "economy"]
     • Election violence → ["politics", "conflict"]
     • Pandemic border closures → ["humanitarian", "politics"]
     Only assign categories with CLEAR relevance in the article text.
   - "lat": latitude of the PRIMARY event location (most specific). Use precise coordinates.
   - "lng": longitude of the PRIMARY event location.
   - "locationName": specific place name (e.g. "Kharg Island", "Donetsk", "Gaza City"). Use the most granular location mentioned.
   - "countries": array of ALL countries involved or mentioned (e.g. ["Iran", "United States"] for "US strikes on Iran"). Include both the location country AND any other countries that are key actors.

Geolocation rules:
- "US attacks Kharg Island" → lat/lng of Kharg Island (29.23, 50.32), countries: ["Iran", "United States"]
- "Russia-Ukraine prisoner swap in Turkey" → lat/lng of Turkey/Ankara, countries: ["Russia", "Ukraine", "Turkey"]
- "NATO summit in Brussels discusses China threat" → Brussels coords, countries: ["Belgium", "China"]
- Prefer: landmark > neighborhood > city > region > country for lat/lng precision
- If NO location can be determined at all, set lat/lng to null and countries to []

Respond ONLY with JSON: { "results": [ { "index": 0, "summary": "...", "categories": [...], "lat": number|null, "lng": number|null, "locationName": "...", "countries": [...] }, ... ] }`

export async function processArticleBatch(articles, signal) {
  if (!isAIEnabled() || articles.length === 0) return articles

  const userContent = articles.map((a, i) =>
    `[${i}] Title: ${a.title}\nDescription: ${(a.description || '').slice(0, 300)}\nSource: ${a.sourceName}`
  ).join('\n\n')

  try {
    const raw = await callGPT([
      { role: 'system', content: BATCH_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ], { json: true, max_tokens: 3000, signal })

    const parsed = JSON.parse(raw)
    const results = parsed.results || []

    return articles.map((article, i) => {
      const r = results.find(x => x.index === i)
      if (!r) return article

      const enhanced = { ...article }

      if (r.summary) enhanced.aiSummary = r.summary

      if (r.categories && r.categories.length > 0) {
        const validCats = r.categories.filter(c => VALID_CATEGORIES.includes(c) || c === 'general')
        if (validCats.length > 0) {
          const primaryId = validCats[0]
          const cat = CATEGORIES[primaryId]
          enhanced.category = cat
            ? { id: primaryId, ...cat }
            : { id: 'general', label: 'GENERAL', badge: 'badge-muted' }
          enhanced.allCategories = validCats
        }
      }

      if (r.countries && r.countries.length > 0) {
        enhanced.countries = r.countries
      }

      if (r.lat != null && r.lng != null) {
        enhanced.location = {
          lat: r.lat,
          lng: r.lng,
          name: r.locationName || enhanced.location?.name || 'Unknown',
          country: (r.countries && r.countries[0]) || '',
          countries: r.countries || [],
          region: enhanced.location?.region || guessRegion(r.lat, r.lng),
        }
      }

      return enhanced
    })
  } catch (err) {
    console.warn('[AI] Batch processing failed:', err.message)
    return articles
  }
}

export async function processArticlesWithAI(articles, signal, onProgress) {
  if (!isAIEnabled()) return articles

  const batchSize = 10
  const results = []
  const totalBatches = Math.ceil(articles.length / batchSize)

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize)
    const processed = await processArticleBatch(batch, signal)
    results.push(...processed)
    if (onProgress) onProgress(Math.floor(i / batchSize) + 1, totalBatches)
  }

  return results
}

export async function summarizeArticle(article) {
  if (!isAIEnabled()) return null

  try {
    const raw = await callGPT([
      { role: 'system', content: 'Summarize this news article in 1-2 concise sentences. Return JSON: { "summary": "..." }' },
      { role: 'user', content: `Title: ${article.title}\nDescription: ${article.description || ''}` },
    ], { json: true, max_tokens: 200 })

    return JSON.parse(raw).summary || null
  } catch {
    return null
  }
}

export async function geolocateArticle(article) {
  if (!isAIEnabled()) return null

  try {
    const raw = await callGPT([
      { role: 'system', content: 'Extract the location from this article. Return JSON: { "lat": number|null, "lng": number|null, "name": "...", "countries": ["..."] }. Use the most specific location. List ALL countries involved. Disambiguate: "Georgia" near Russia = country (41.7,44.8), in US context = state (32.16,-82.9). If no location, return nulls.' },
      { role: 'user', content: `Title: ${article.title}\nDescription: ${(article.description || '').slice(0, 500)}` },
    ], { json: true, max_tokens: 100 })

    return JSON.parse(raw)
  } catch {
    return null
  }
}

function guessRegion(lat, lng) {
  if (lat > 15 && lat < 45 && lng > 25 && lng < 65) return 'Middle East'
  if (lat > 35 && lat < 72 && lng > -25 && lng < 40) return 'Europe'
  if (lat > -35 && lat < 37 && lng > -20 && lng < 55) return 'Africa'
  if (lat > 25 && lat < 50 && lng > -130 && lng < -60) return 'North America'
  if (lat > -55 && lat < 15 && lng > -85 && lng < -30) return 'South America'
  if (lat > 5 && lat < 55 && lng > 60 && lng < 145) return 'East Asia'
  if (lat > -10 && lat < 30 && lng > 65 && lng < 100) return 'South Asia'
  if (lat > -15 && lat < 25 && lng > 95 && lng < 150) return 'Southeast Asia'
  if (lat > -50 && lat < 0 && lng > 110 && lng < 180) return 'Oceania'
  return 'Other'
}
