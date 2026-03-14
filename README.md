# intellAgents (Very much work in progress - I know that there are several bugs)

Real-time open source intelligence (OSINT) dashboard that aggregates global news from RSS feeds, geolocates articles on an interactive 3D globe, and provides AI-powered analysis.

![Globe View](https://img.shields.io/badge/React-Globe.gl-blue) ![License](https://img.shields.io/badge/License-GPL--3.0-green)

## Features

### Globe & Map Views
- **Interactive 3D globe** with multiple styles (Outline, Night, Topo, Marble, Dark Topo)
- **2D Leaflet map** with 15+ tile layer options
- Articles plotted as color-coded dots by category
- **Leader lines** connecting surface points to article cards
- Click to select, Ctrl+click for multi-select, white glow for focused articles

### Cards & Local Stacks
- Every article gets a card on the globe
- Articles at the same location form **local stacks** — scroll on a stack to cycle through articles
- Stack counter shows `X/Y` position
- Cards are **draggable** — reposition them anywhere on the canvas
- **Stack mode** — deck view on the right side for sequential browsing

### AI Integration (Optional)
- Paste an OpenAI API key in `.env` to enable
- **Smart geolocation** — GPT extracts precise coordinates ("US attacks Kharg Island" → Kharg Island coords, not just "Iran")
- **Disambiguation** — handles Georgia (country) vs Georgia (US state), Turkey (country) vs bird, etc.
- **Multi-category classification** — an athlete defecting due to war is tagged CONFLICT + HUMANITARIAN
- **Multi-country detection** — "Russia-Ukraine prisoner swap in Turkey" → countries: [Russia, Ukraine, Turkey]
- **Article summaries** — concise 1-2 sentence AI-generated summaries
- **AI Agent** — natural language command bar: "Show conflict in Middle East", "Summarize Ukraine", "What's happening in Africa?"

### 13 Categories
`CONFLICT` `POLITICS` `ECONOMY` `DISASTER` `SECURITY` `HUMANITARIAN` `STOCKS` `TERRORISM` `DEFENSE` `ANTISEMITISM` `MARITIME` `TRADE` `GENERAL`

### Filtering & Flow
- **Category dropdown** with multi-select checkboxes
- **Location filter** with search bar, select all / reset
- **Archive** — filter by time: 24h, 48h, 7 days, 30 days, or custom date range
- **Flow** — compound filter presets with per-location category rules (e.g., Israel: CONFLICT | USA: POLITICS+CONFLICT | Iran: CONFLICT+ECONOMY)
- **Zones** — draw polygons on the globe to focus on a region; everything outside disappears. Vertices are draggable in edit mode.

### Sources
- 13 built-in sources: JPost, Times of Israel, Al Jazeera, Reuters, BBC, Guardian, NYT, AP, France 24, DW, SCMP, ABC Australia, Africanews
- **Add custom sources** via CSV upload or paste on the Dashboard
- Toggle sources on/off in Settings
- Sources persist in localStorage

### Other Features
- **Pop out** — detach the globe/map to a dedicated window; controls on the main site sync via BroadcastChannel
- **Cache** — articles cached for 30 minutes to save API tokens; reset cache button in Settings and Dashboard
- **Refresh** — manual refresh in sidebar; auto-refresh every 5 minutes
- **Dark/Amber themes** with globe border color picker
- **Cluster radius** configurable in Settings

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`

## AI Setup (Optional)

1. Get an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create `.env` in the project root:
   ```
   VITE_OPENAI_API_KEY=sk-your-key-here
   ```
3. Restart the dev server. The sidebar will show "AI AGENT ACTIVE" in green.

> GPT-4o-mini is used for cost efficiency (~$0.01-0.02 per refresh cycle).

## Adding Sources

### In the app
Dashboard → **ADD SOURCES** panel → paste CSV or URLs:
```
BBC World, https://feeds.bbci.co.uk/news/rss.xml
https://example.com/feed.xml
```

### In code
Edit `src/utils/sources.js`:
```javascript
{ id: 'my-source', name: 'My Source', color: '#ff6600',
  url: 'https://example.com/rss/feed.xml' },
```

## Architecture

```
src/
├── components/     Layout, Sidebar, Settings, PopoutLayout
├── contexts/       IntelContext (data), ThemeContext (UI)
├── pages/          Dashboard, Feed, Flow, MapView, GlobeView
└── utils/          ai.js, agent.js, intel.js, sources.js, gazetteer.js
```

## Key Files

| File | Purpose |
|------|---------|
| `src/utils/ai.js` | GPT integration — article processing prompt, geolocation, categorization |
| `src/utils/agent.js` | AI agent command interpreter prompt |
| `src/utils/sources.js` | News sources & category definitions with keywords |
| `src/utils/gazetteer.js` | Location database (200+ countries, cities, regions) |
| `src/contexts/IntelContext.jsx` | Data fetching, caching, source management, flow filtering |
| `src/pages/GlobeView.jsx` | 3D globe with cards, stacks, clustering, zones, leader lines |

## License

GPL-3.0 — see [LICENSE](LICENSE)
