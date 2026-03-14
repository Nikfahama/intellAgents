# intellAgents — Setup & Configuration Guide

## Quick Start

1. Install dependencies:
   ```bash
   cd osmap-app
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:5173` in your browser.

---

## AI-Powered Article Processing (Optional)

intellAgents supports OpenAI GPT integration for enhanced article processing:

- **Smart Summarization** — AI generates concise 1-2 sentence summaries for each article
- **Precise Geolocation** — Instead of keyword matching, GPT extracts the exact location mentioned and returns precise coordinates (e.g., "US attacks Kharg Island" → places the dot on Kharg Island, not just "Iran")
- **Multi-Category Classification** — Articles can belong to multiple categories. An "athlete defecting due to war" is tagged as both CONFLICT and HUMANITARIAN
- **Country Detection** — Extracts the country for each article, enabling country-based filtering

### Setup

1. Get an OpenAI API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

2. Create a `.env` file in the `osmap-app/` directory:
   ```
   VITE_OPENAI_API_KEY=sk-your-actual-key-here
   ```

3. Restart the dev server. The AI features activate automatically when a valid key is detected.

> **Note:** The API key is exposed to the browser in this setup. For production deployments, use a backend proxy to protect your key. GPT-4o-mini is used by default for cost efficiency (~$0.15/1M input tokens).

### How It Works

1. Articles are fetched from RSS feeds as normal
2. If an API key is configured, articles are sent to GPT in batches of 10
3. GPT returns:
   - A concise summary
   - One or more category IDs
   - Precise latitude/longitude coordinates
   - Location name and country
4. The enriched data replaces the keyword-based categorization and gazetteer-based geolocation
5. If the API call fails, the app falls back to the built-in keyword/gazetteer system

### Cost Estimate

With ~13 sources averaging ~15 articles each:
- ~195 articles per refresh
- ~20 API calls (batches of 10)
- **~$0.01-0.02 per refresh** with GPT-4o-mini

---

## News Sources

Sources are configured in `src/utils/sources.js`. Each source needs:
- `id` — Unique identifier
- `name` — Display name
- `color` — Hex color for the source badge
- `url` — RSS feed URL

### Currently Included Sources

| Source | Region | RSS Feed |
|--------|--------|----------|
| JPost | Middle East | jpost.com/rss |
| Times of Israel | Middle East | timesofisrael.com/feed |
| Al Jazeera | International | aljazeera.com/xml/rss/all.xml |
| Reuters | International | reutersagency.com/feed |
| BBC World | UK/International | feeds.bbci.co.uk/news/world |
| The Guardian | UK | theguardian.com/world/rss |
| NY Times | US | rss.nytimes.com/.../World.xml |
| AP News | US/International | via rsshub proxy |
| France 24 | Europe | france24.com/en/rss |
| DW News | Europe | rss.dw.com/rdf/rss-en-world |
| SCMP | Asia | scmp.com/rss/91/feed |
| ABC Australia | Oceania | abc.net.au/news/feed |
| Africanews | Africa | africanews.com/feed |

### Adding a Source

Add an entry to the `NEWS_SOURCES` array in `src/utils/sources.js`:
```javascript
{ id: 'my-source', name: 'My Source', color: '#ff6600',
  url: 'https://example.com/rss/feed.xml' },
```

### Toggling Sources

Open **Settings** (gear icon in sidebar) → scroll to the **Sources** section. Each source has an on/off switch. Changes take effect immediately. Click **REFETCH** to re-fetch only enabled sources.

---

## Categories

Articles are classified into these categories:

| Category | Color | Examples |
|----------|-------|----------|
| CONFLICT | Red | War, military operations, airstrikes, terrorism |
| POLITICS | Orange | Elections, diplomacy, legislation, summits |
| ECONOMY | Yellow-Green | Markets, trade, inflation, sanctions |
| DISASTER | Orange | Earthquakes, floods, wildfires, climate events |
| SECURITY | Red-Orange | Cyber attacks, espionage, crime, court cases |
| HUMANITARIAN | Blue | Refugees, aid, disease outbreaks, human rights |
| GENERAL | Grey | Anything that doesn't match above categories |

### Without AI
Categories are assigned by keyword matching against the article title and description. An article matches the first category whose keywords appear in the text.

### With AI
GPT assigns multiple categories per article. An article about "a cyberattack disrupting stock markets" would be tagged as both SECURITY and ECONOMY. The primary category (first in the list) is used for the color/badge, but filtering shows articles matching ANY of their assigned categories.

---

## Globe View Features

### Cards & Stack Mode
- **CARDS switch** — Toggle article cards on/off (dots remain visible)
- **STACK button** — Stacks cards in a deck on the right side; scroll to cycle through
- Click to select, Ctrl+click to multi-select
- Selected articles show a white border and white leader line

### Pop Out
- Click **POP OUT** in the toolbar to open the globe in a dedicated window
- The main window shows controls; the pop-out shows only the canvas
- Controls sync via BroadcastChannel — changing filters on the main site updates the pop-out
- Click **MERGE** to bring the canvas back

### Zones
- Click **ZONES** to enter polygon drawing mode
- Click on the globe to place vertices; the polygon auto-closes
- Name and color the zone, then **SAVE**
- Use **FOCUS** to fade articles outside a zone

### Archive
- Filter articles by time: LAST 24H, 48H, 7 DAYS, 30 DAYS
- Or set a custom date range with FROM/TO date pickers

---

## Architecture

```
osmap-app/
├── src/
│   ├── main.jsx              # Entry point
│   ├── App.jsx               # Router (main + popout routes)
│   ├── index.css             # Global styles (CSS custom properties)
│   ├── components/
│   │   ├── Layout.jsx        # Main layout (sidebar + content)
│   │   ├── PopoutLayout.jsx  # Minimal layout for pop-out windows
│   │   ├── Sidebar.jsx       # Navigation, stats, refresh, settings
│   │   └── SettingsModal.jsx # Theme, borders, source toggles
│   ├── contexts/
│   │   ├── IntelContext.jsx  # Article fetching, filtering, source management
│   │   └── ThemeContext.jsx  # Theme & globe border color
│   ├── pages/
│   │   ├── Dashboard.jsx     # Overview stats
│   │   ├── Feed.jsx          # Article list view
│   │   ├── MapView.jsx       # 2D Leaflet map
│   │   └── GlobeView.jsx     # 3D globe (react-globe.gl + Three.js)
│   └── utils/
│       ├── ai.js             # OpenAI GPT integration
│       ├── intel.js          # RSS feed fetching & parsing
│       ├── sources.js        # News sources & category definitions
│       └── gazetteer.js      # Location database for geolocation
├── .env.example              # API key template
└── SETUP.md                  # This file
```
