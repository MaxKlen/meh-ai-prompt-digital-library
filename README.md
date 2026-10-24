# MEH AI prompt digital library

MEH AI prompt digital library is a personal, local-first finder for reusable AI prompt templates. The bundled library contains **16,165 records** from four public GitHub datasets. It preserves exactly three screens: Home, Browse, and Prompt View.

## Screens and behavior

- **Home:** local keyword search, on-device recents, popular topics, and source attribution.
- **Browse:** local search plus topic, source, and text/image/video filters, with paginated results.
- **Prompt View:** source text, source-record link, upstream revision, attribution, license, modality, and any source-provided variables, constraints, translations, or image annotations.

The app loads only same-site static JSON files. Search uses local string matching. Recent prompt IDs are optional browser `localStorage` data on this device only. There is no account, external API, analytics service, AI inference, or external database.

## Search on a phone

Type a task such as **email**, **research**, or **image**. Home shows a live match count and six preview cards. Tap the visible **Search** button or the keyboard's **Search / Enter** key to open the matching Browse results, dismiss the keyboard, and bring the search controls and results into view. Browse retains live filtering, topic/source/format selectors, a clear empty state, and 60-record pagination. Search uses one reusable, normalized local index rather than scanning and normalizing the entire library twice per keystroke.

## Install and use offline

Open the HTTPS app address in a regular, non-private browser while online. Tap **Save offline** and keep the page open until it says **Ready offline**. This one-time download saves the complete app and all 16,165 prompts on that device (about 35 MB plus app assets), not just the visible results. Readiness is shown only after the service worker verifies every required cached file.

On **iPhone or iPad**, open the app in Safari, use **Share → Add to Home Screen → Add**. On **Android**, use Chrome's **Install app** option or its menu's **Install app / Add to Home screen**. The in-app Install button uses the browser's native prompt when available and otherwise shows these instructions. An embedded chat browser may not offer installation.

Open the installed home-screen app once while online and confirm **Ready offline**; if that browser context needs its own saved copy, tap Save offline there too. After that, Home, Browse, search, filters, prompt details, on-device recents, and Copy text work without a connection, including after closing and reopening the page. External attribution/source websites still need internet access.

The cache is tied to the exact site address and browser/device. Clearing site data, private browsing, or OS/browser storage cleanup can remove it. The app requests persistent storage where supported, but the device remains in control; check the Ready offline status before travelling without connectivity. An interrupted cache update keeps the prior complete copy. Browser-based testing can verify offline behavior but cannot guarantee every physical iOS/Android installation flow. Installation and storage behavior follow the browser's [PWA installation](https://web.dev/learn/pwa/installation) and [offline storage](https://web.dev/learn/pwa/offline-data) capabilities.

## Included datasets and license terms

| Dataset | Records included | Data license | Coverage and notes |
| --- | ---: | --- | --- |
| [ThinkWithPrompt AI Prompt Library](https://github.com/amitsoni-ai/thinkwithprompt-prompts) | 2,663 | CC BY 4.0 | 28 topic groups; text, image, and video types. Attribute ThinkWithPrompt by Synottic and link to the individual prompt page where practical. |
| [PromptTensor Prompt Bank](https://github.com/PromptTensor/prompttensor-promptbank) | 6,913 | 6,906 rows marked CC BY 4.0; 7 marked CC0 1.0 | 7,040 source rows. The importer excludes 127 rows with blank, unknown, internal, or otherwise unclear row-level license markers. |
| [prompts.chat community prompt data](https://github.com/f/prompts.chat) | 2,617 | CC0 1.0 | Source code/site content is separately MIT; prompt data is CC0. Ten records whose titles explicitly identify system-prompt, jailbreak, or attack-oriented material are omitted. |
| [WeGenBench image-generation prompts](https://github.com/WeChatCV/WeGenBench) | 3,972 | CC BY-NC 4.0 | English and Chinese text-to-image benchmark prompts. The noncommercial restriction applies to these data records; cite WeGenBench and indicate changes. The current selected snapshot includes 972 records in the updated English text-rendering split. |

The current library uses **CC BY 4.0, CC0 1.0, and CC BY-NC 4.0** data. The WeGenBench material is noncommercial-only; a commercial distribution must omit it or obtain permission. Each record carries its source, pinned commit, source file and line, record URL where available, attribution, and applicable license. A manifest and size-capped source-specific JSON shards are stored under `public/data/` and shipped as static assets.

## Compatibility and display-only policy

Platform coverage is descriptive source metadata, not a compatibility test. ThinkWithPrompt and prompts.chat name multiple chat assistants; PromptTensor describes general LLM prompts; WeGenBench is a text-to-image benchmark. The app has not independently tested any prompt against any model.

Every prompt is inert text data. The app renders source text as escaped plain text, searches it with local string matching, and copies it only when the user selects **Copy text**. It never evaluates, executes, interprets, simulates, tests, optimizes, improves, or applies a record. No prompt text is sent to an AI service. The uploaded system-prompt archive and the previous DAN/jailbreak collection are not part of the everyday library.

## Refresh the bundled data

The standard-library importer reads fixed upstream revisions, validates documented row counts, applies per-row license checks to PromptTensor, excludes explicit title markers from prompts.chat, and writes local JSON shards below 4.5 MB each plus a provenance manifest:

```bash
python3 scripts/build-library.py
```

Refreshing the library requires internet access during this explicit build step. The running app uses only its local static JSON files.

## Run and build

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To type-check and create the static production export:

```bash
npm run typecheck
npm run test:search
npm run build
```

Static files are produced in `out/` and can be served from any static HTTPS host (or localhost for testing). The Next.js build is configured for static export. The build then derives a content-versioned precache list from the complete export and generates `out/sw.js`; it includes all app assets, the JSON manifest, and all data shards. Offline saving is intentionally a production-build feature, not Next.js development-server caching.

For the optional mobile and offline integration test, install Python's `playwright` package and provide a Chromium executable. Serve `out/`, then run:

```bash
python3 -m http.server 3000 --bind 0.0.0.0 --directory out
python3 scripts/test-search-ui.py --url http://localhost:3000
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. The test covers live typing, touch Search, keyboard Enter, filters, pagination, empty states, inert prompt view/copy, recents, cache completeness, and a cold-tab offline launch with HTTP caching disabled. It uses iPhone-sized and Android-sized Chromium touch viewports, not a physical-device or native-install test. Screenshots are written to the ignored `screenshots/` directory.

## Project structure

```text
app/
  globals.css
  layout.tsx
  page.tsx
components/
  PromptFinder.tsx
  OfflineControls.tsx
lib/
  search.ts
public/
  favicon.svg
  manifest.webmanifest
  icons/
  data/
    library.json
    prompts-<source>-<part>.json
scripts/
  build-library.py
  build-pwa.mjs
  service-worker-template.js
  test-search.cjs
  test-search-ui.py
types/
  prompt.ts
next.config.ts
package.json
```

---

## Original repository README (preserved)

The pre-existing README text is reproduced verbatim below.

```text
# meh-ai-prompt-digital-library
AI prompt digital library 
```
