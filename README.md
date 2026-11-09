# Plymouth Weather Scene

A live weather app for Plymouth, New Hampshire whose hero image is **re-imagined
by an image model** to match the time of day, time of year, and forecast.

The app is an Express + Vite + React + TypeScript project. It:

1. Pulls the current weather from the National Weather Service for
   `43.7589, -71.6892` (Plymouth, NH, ZIP 03264).
2. Sends a multimodal LLM the reference photo plus a weather briefing, and asks
   it to write a single image-editing prompt.
3. Sends that prompt and the reference photo to **Qwen Image 2.1 Turbo** through
   OpenRouter, and saves the result.
4. Verifies that the generated image is actually different from the reference
   (32×32 grayscale mean-absolute difference) and retries once with a stronger
   prompt if the change is too subtle.
5. Shows a draggable **before / after** comparison so the change is obvious.

```
NWS API ──► normalize weather ──► weather briefing ──► Gemini 2.5 Flash
                                                        (writes edit prompt)
                                                                 │
reference photo (downloaded, CC BY-SA 4.0) ◄─────────────────────┘
        │
        ▼
Qwen Image 2.1 Turbo (image-to-image) ──► change check ──► .cache/scenes/
        │
        ▼
   React UI (hero + compare slider + forecast)
```

## Run it

```bash
cd weather

# 1. Install the Node version pinned in .mise.toml
mise install

# 2. Install dependencies
npm install

# 3. Add an OpenRouter key
cp .env.example .env
# edit .env and set OPENROUTER_API_KEY=...
# (The server also reads ../openrouter.env if that is how the lab set it up.)

# 4. Download the reference photograph (the actual image is not committed by
#    the lecture; this fetches the Rounds Hall photo from Wikimedia Commons)
npm run fetch:reference

# 5. Develop
npm run dev
# → http://localhost:3000

# Production build
npm run build
npm start
```

`npm run dev` starts a single Express server on port 3000 with Vite in
middleware mode, so there is no separate frontend port and no proxy config.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Required for scene generation |
| `PROMPT_MODEL` | `google/gemini-2.5-flash` | Multimodal model that writes the edit prompt |
| `IMAGE_MODEL` | `qwen/qwen-image-2.1-turbo` | Image editing model |
| `WEATHER_USER_AGENT` | `cs2010-weather-scene/1.0 (...)` | NWS requires an identifying User-Agent |
| `PORT` | `3000` | HTTP port |
| `WEATHER_CACHE_DIR` | `weather/.cache` | Generated scenes and cache |

The server never exposes the OpenRouter key to the browser; all API calls happen
on the Express side.

## API

| Endpoint | What it does |
| --- | --- |
| `GET /api/health` | Key/reference/model status |
| `GET /api/weather[?refresh=1]` | Normalized weather (5-minute cache) |
| `GET /api/scene` | Latest scene + whether it matches current conditions |
| `POST /api/scene[?refresh=1]` | Generate a scene for the current weather |
| `GET /api/scene/:hash.jpg` | Cached generated image |
| `GET /api/reference` | Reference photograph |
| `GET /api/reference/meta` | Photo attribution/license |

A scene is cached under `.cache/scenes/` using a key derived from the date,
time-of-day bucket, season, temperature, forecast text, and precipitation
chance. Repeated page loads do **not** spend money; a new image is generated
only when the conditions key changes or the user clicks **Re-imagine scene**.
Concurrent requests for the same conditions share a single in-flight generation.

## How time / season are decided

- **Time of day** uses real sunrise/sunset/dawn/dusk times from `suncalc` in
  `America/New_York`, split into deep night, pre-dawn, early morning, morning,
  midday, afternoon, golden hour, dusk, and evening.
- **Season** uses the local date with New Hampshire-specific labels (mud season,
  stick season, fall foliage, deep winter, etc.) and feeds a visual description
  into the prompt.
- The current conditions come from the NWS `forecastHourly` period that covers
  the current time; the next six day/night periods come from `forecast`.

## Reference photo

The lecture notes reference a `panther-snow.jpg` that is not available from the
course site, so this app downloads a real photograph of the campus instead:

- **Title:** Rounds Hall, Plymouth State University
- **Artist:** User:Magicipiano
- **Source:** <https://commons.wikimedia.org/wiki/File:PlymouthNH_PlymouthStateU_RoundsHall.jpg>
- **License:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0)

`npm run fetch:reference` downloads the full-resolution file to
`assets/reference.jpg` and writes `assets/reference.json` with the attribution
shown in the app footer. The reference is resized to at most 1100 px wide before
being sent to the model.

## Cost notes

Each scene is one image-edit call (plus one small chat call for the prompt).
Scenes are cached aggressively and the UI never auto-regenerates on every
poll. The **Re-imagine scene** button is the only way to force a new image.
