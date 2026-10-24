# MEH AI prompt digital library

MEH AI prompt digital library is a personal, local-first finder for reusable AI prompt templates. The bundled library contains **16,165 records** from four public GitHub datasets. It preserves exactly three screens: Home, Browse, and Prompt View.

## Screens and behavior

- **Home:** local keyword search, on-device recents, popular topics, and source attribution.
- **Browse:** local search plus topic, source, and text/image/video filters, with paginated results.
- **Prompt View:** source text, source-record link, upstream revision, attribution, license, modality, and any source-provided variables, constraints, translations, or image annotations.

The app loads only same-site static JSON files. Search uses local string matching. Recent prompt IDs are optional browser `localStorage` data on this device only. There is no account, external API, analytics service, AI inference, or external database.

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
npm run build
```

Static files are produced in `out/` and can be served from any static host. The Next.js build is configured for static export.

## Project structure

```text
app/
  globals.css
  layout.tsx
  page.tsx
components/
  PromptFinder.tsx
lib/
  search.ts
public/
  favicon.svg
  data/
    library.json
    prompts-<source>-<part>.json
scripts/
  build-library.py
types/
  prompt.ts
next.config.ts
package.json
```
