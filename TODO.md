# Search and offline-app repair

- [x] Make the current Home and Browse search flow functional and clear on mobile: keep live typing results, add an explicit Search button, and make the keyboard Search/Enter action reveal matching results without a page reload.
- [x] Add an installable PWA with a clear one-time Save offline action and verified offline-ready state on iOS and Android. Cache the application shell, local JSON manifest, and every data shard on this device; add no external database, remote search, or API. Explain platform-specific installation and storage limitations.
- [x] Preserve the product name and the Home, Browse, and Prompt View screens, same-site local JSON data, optional on-device recents, inert prompt text, filters, and 60-record pagination. Verify mobile search and offline reload/search/browse/detail as far as a browser test allows.
- [x] Rebuild the static export at the existing live endpoint, push the intended changes to the existing GitHub main branch without force, and leave the shared screen showing a working search with results.

## Verification

TypeScript and production build pass. Seven focused search tests pass, and six representative real-library queries preserve the original exact ranking. The live mobile integration suite passes at 390 × 844 and 360 × 800 touch viewports, with no horizontal overflow at 320 px and no JavaScript errors. It verifies Search/Enter, live results, filters, 60 → 120 pagination, empty-state reset, inert prompt viewing/copy, and retained on-device recents.

The saved offline version contains 40 files (35,854,525 bytes). A cold tab with browser HTTP caching disabled and network requests blocked loads all 11 local data files from the service worker, returns 601 email matches and 352 video matches, and opens/copies prompt text. Deleting one cached manifest is detected and Save offline repairs it without losing recents. Physical iOS/Android native installation remains a user-side step; testing uses Chromium mobile emulation.
