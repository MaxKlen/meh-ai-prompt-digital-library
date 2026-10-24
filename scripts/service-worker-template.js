/* Generated from this template by scripts/build-pwa.mjs. */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE_NAME = `meh-ai-precache-${VERSION}`;
const CACHE_PREFIX = "meh-ai-precache-";
const SHELL_URL = "/";
const KNOWN_URLS = new Set(PRECACHE.map((entry) => entry.url));
const TOTAL_BYTES = PRECACHE.reduce((sum, entry) => sum + entry.bytes, 0);
let preparation = null;

async function notifyClients(message) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage(message);
}

async function cacheIsComplete(cache) {
  if (!cache) return false;
  for (const entry of PRECACHE) {
    if (!(await cache.match(entry.url))) return false;
  }
  return true;
}

async function prepareCache() {
  if (preparation) return preparation;
  preparation = (async () => {
    const cache = await caches.open(CACHE_NAME);
    let completed = 0;
    for (const entry of PRECACHE) {
      if (!(await cache.match(entry.url))) {
        const response = await fetch(new Request(entry.url, { cache: "no-cache" }));
        if (!response.ok) throw new Error(`Precache request failed (${response.status}): ${entry.url}`);
        await cache.put(entry.url, response);
      }
      completed += 1;
      await notifyClients({ type: "OFFLINE_PROGRESS", completed, total: PRECACHE.length });
    }
    if (!(await cacheIsComplete(cache))) throw new Error("Offline cache verification failed");
  })();
  try { await preparation; } finally { preparation = null; }
}

async function status() {
  const ready = await cacheIsComplete(await caches.open(CACHE_NAME));
  return { ready, version: ready ? VERSION : "", total: PRECACHE.length, bytes: ready ? TOTAL_BYTES : 0 };
}

async function announceReady() {
  await notifyClients({ type: "OFFLINE_READY", version: VERSION, total: PRECACHE.length, bytes: TOTAL_BYTES });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      await prepareCache();
      await self.skipWaiting();
    } catch (error) {
      // Only this failed new version is discarded; the previous good version remains intact.
      await caches.delete(CACHE_NAME);
      await notifyClients({ type: "OFFLINE_ERROR", message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // CacheStorage.keys() is creation ordered, unlike content-hash names.
    const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
    const keep = new Set([CACHE_NAME, ...names.filter((name) => name !== CACHE_NAME).slice(-1)]);
    await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
    if ((await status()).ready) await announceReady();
  })());
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (!["GET_OFFLINE_STATUS", "PREPARE_OFFLINE"].includes(type) || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    try {
      if (type === "PREPARE_OFFLINE") await prepareCache();
      const result = await status();
      event.ports[0].postMessage(result);
      if (type === "PREPARE_OFFLINE" && result.ready) await announceReady();
    } catch (error) {
      // Cache repair keeps already-saved files and any prior version if connectivity/storage fails.
      event.ports[0].postMessage({ ready: false, version: "", total: PRECACHE.length, bytes: 0 });
      await notifyClients({ type: "OFFLINE_ERROR", message: error instanceof Error ? error.message : String(error) });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isNavigation = request.mode === "navigate";
  const isKnown = KNOWN_URLS.has(url.pathname);
  const isAppAsset = url.pathname.startsWith("/_next/static/");
  if (!isNavigation && !isKnown && !isAppAsset) return;
  event.respondWith((async () => {
    const current = await caches.open(CACHE_NAME);
    const hit = await current.match(request);
    if (hit) return hit;
    for (const name of (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)) {
      const oldHit = await (await caches.open(name)).match(request);
      if (oldHit) return oldHit;
    }
    try {
      return await fetch(request);
    } catch (error) {
      if (isNavigation) {
        const shell = await current.match(SHELL_URL);
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
