import { isAIEnabled } from './ai'
import { CATEGORIES } from './sources'

const API_URL = 'https://api.openai.com/v1/chat/completions'

const VALID_CATEGORIES = Object.keys(CATEGORIES)

const AGENT_SYSTEM = `You are an OSINT map intelligence agent. The user gives you natural language commands to control an interactive news globe.

You can execute these actions by returning JSON with an "actions" array:

1. **filter_categories** — Show only specific categories
   { "type": "filter_categories", "categories": ["conflict", "security"] }
   Valid: ${VALID_CATEGORIES.join(', ')}, general. Use [] to show all.

2. **filter_locations** — Show only articles from specific locations/countries
   { "type": "filter_locations", "locations": ["Ukraine", "Russia"] }
   Use [] to clear filter.

3. **select_article** — Highlight a specific article by keyword match
   { "type": "select_article", "keyword": "Kharg Island" }

4. **summarize** — Provide a text summary of current articles
   { "type": "summarize", "text": "Your summary here..." }

5. **zoom** — Zoom to a location
   { "type": "zoom", "lat": 48.8, "lng": 2.35, "altitude": 1.5 }

6. **message** — Reply to the user with a text message
   { "type": "message", "text": "Here's what I found..." }

You will also receive the current article list as context. Use it to give informed answers.

Rules:
- You can combine multiple actions in one response
- Always include a "message" action explaining what you did
- For "show me X" commands, use filters + a message
- For "what's happening in X" commands, filter to that location + summarize relevant articles
- For "summarize" commands, read through the articles and provide a concise briefing
- Be concise. This is a military-style intelligence dashboard.

Respond ONLY with JSON: { "actions": [ ... ] }`

export async function runAgentCommand(command, articles, signal) {
  if (!isAIEnabled()) {
    return { actions: [{ type: 'message', text: 'AI agent is not active. Add your OpenAI API key to .env to enable it.' }] }
  }

  const key = import.meta.env.VITE_OPENAI_API_KEY || ''

  // Build concise article context (title + location + category, first 50)
  const articleContext = articles.slice(0, 50).map((a, i) =>
    `[${i}] ${a.title} | ${a.location?.name || 'Unknown'} | ${a.category?.label || 'GENERAL'} | ${a.timeAgo}`
  ).join('\n')

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AGENT_SYSTEM },
          { role: 'user', content: `Current articles on the map:\n${articleContext}\n\n---\nUser command: ${command}` },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
      signal: signal || AbortSignal.timeout(20000),
    })

    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    const content = data.choices[0]?.message?.content || '{}'
    return JSON.parse(content)
  } catch (err) {
    return { actions: [{ type: 'message', text: `Agent error: ${err.message}` }] }
  }
}
